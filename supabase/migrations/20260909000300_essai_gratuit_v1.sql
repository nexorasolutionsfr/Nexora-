-- Essai gratuit et fin d'accès — V1.
-- Référence : docs/architecture/essai-gratuit-v1.md
--
-- LE PROBLÈME OUVERT PAR L'INSCRIPTION LIBRE
--
-- Depuis que `signUp` est ouvert, n'importe qui crée un compte, un garage, et
-- utilise Nexora sans limite de durée ni contrepartie. C'était le prix à payer
-- pour supprimer la création manuelle de comptes ; il faut maintenant le
-- refermer, sans revenir à un geste humain par client.
--
-- LE CHOIX : PAS DE FILTRE À L'ENTRÉE, UNE LIMITE DANS LE TEMPS
--
-- Un code d'invitation à l'inscription tuerait le parcours qu'on vient
-- d'ouvrir : un garagiste qui découvre Nexora un dimanche soir n'a personne à
-- qui demander un code. La limite de durée fait le même travail sans fermer la
-- porte — quelqu'un d'illégitime obtient quatorze jours puis plus rien, ce qui
-- ne coûte rien, tandis qu'un vrai garage a exactement le temps annoncé sur la
-- page tarifaire.
--
-- DEUX COLONNES, PAS DAVANTAGE
--
--   essai_fin        : quand l'essai s'arrête. NULL = aucune limite.
--   abonnement_actif : vrai quand le garage paie. Écrit plus tard par le
--                      webhook Stripe ; à la main d'ici là.
--
-- NULL est l'état des quatre garages déjà en Production, et il signifie « accès
-- sans limite ». Leur imposer une échéance rétroactive les couperait du jour au
-- lendemain d'un outil qu'ils utilisent — ce serait le pire usage possible d'une
-- migration qui part directement en production.

-- =====================================================================
-- 1. Les deux colonnes
-- =====================================================================

alter table public.garages add column essai_fin timestamptz;
alter table public.garages add column abonnement_actif boolean not null default false;

comment on column public.garages.essai_fin is
  'Fin de la période d''essai gratuit. NULL = aucune limite de durée (garages antérieurs à ce lot, et pilotes prolongés à la main). Sans effet si abonnement_actif est vrai.';
comment on column public.garages.abonnement_actif is
  'Vrai lorsque le garage a un abonnement en cours. Écrit par le webhook Stripe. Prime toujours sur essai_fin.';

-- =====================================================================
-- 2. La règle d'accès — source unique
-- =====================================================================
-- Écrite une fois, ici, et appelée partout ailleurs. Une règle d'accès
-- recopiée dans l'interface et dans la base finit toujours par diverger, et
-- c'est la copie la plus permissive qui gagne.

create function public.acces_garage_ouvert(p_garage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.garages g
    where g.id = p_garage_id
      and (
        g.abonnement_actif
        or g.essai_fin is null
        or g.essai_fin > now()
      )
  );
$$;

comment on function public.acces_garage_ouvert(uuid) is
  'Vrai si ce garage peut encore utiliser Nexora : abonnement en cours, aucune limite d''essai, ou essai non échu. Source unique de la règle — ne jamais la réécrire ailleurs.';

revoke execute on function public.acces_garage_ouvert(uuid) from public;
revoke execute on function public.acces_garage_ouvert(uuid) from anon;
-- Supabase accorde EXECUTE à service_role sur toute fonction neuve de public,
-- par privilège par défaut : la révocation est nécessaire, pas redondante.
revoke execute on function public.acces_garage_ouvert(uuid) from service_role;
grant execute on function public.acces_garage_ouvert(uuid) to authenticated;

-- =====================================================================
-- 3. La mise en service ouvre un essai de quatorze jours
-- =====================================================================
-- `create or replace` est ici légitime et non un contournement : la fonction
-- remplacée est celle posée par 20260909000100, dans ce même dépôt, et le
-- corps est repris à l'identique à la seule exception de l'échéance d'essai.
-- Les privilèges d'une fonction survivent à `create or replace` ; ils sont
-- néanmoins revérifiés au bloc 4.
--
-- Quatorze jours : c'est ce qu'annonce la page tarifaire. Le nombre est écrit
-- ici ET dans lib/tarifs.ts ; le banc de test vérifie que la base tient bien la
-- promesse affichée.

create or replace function public.creer_mon_garage(
  p_nom_garage text,
  p_adresse text,
  p_telephone text,
  p_email text,
  p_profil_activite text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utilisateur uuid := auth.uid();
  v_garage_id uuid;
begin
  if v_utilisateur is null then
    raise exception 'creer_mon_garage: appel sans session authentifiee'
      using errcode = '28000';
  end if;

  if length(btrim(coalesce(p_nom_garage, ''))) = 0 then
    raise exception 'creer_mon_garage: le nom du garage est obligatoire'
      using errcode = '22023';
  end if;

  if not public.profil_activite_valide(p_profil_activite) then
    raise exception 'creer_mon_garage: profil d''activite invalide'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.garages g where g.owner_user_id = v_utilisateur) then
    raise exception 'creer_mon_garage: ce compte possede deja un garage'
      using errcode = '23505';
  end if;

  insert into public.garages (
    owner_user_id, nom_garage, adresse, telephone, email, profil_activite, essai_fin
  )
  values (
    v_utilisateur,
    btrim(p_nom_garage),
    nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_telephone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_profil_activite,
    now() + interval '14 days'
  )
  returning id into v_garage_id;

  return v_garage_id;
end;
$$;

comment on function public.creer_mon_garage(text, text, text, text, text[]) is
  'Crée le garage du compte appelant, avec un essai gratuit de quatorze jours, et renvoie son identifiant. owner_user_id vaut toujours auth.uid() : l''appelant ne peut créer un garage que pour lui-même. Refuse un appel anonyme, un nom vide, un profil hors vocabulaire, et un compte possédant déjà un garage.';

-- =====================================================================
-- 4. Vérification dans la transaction de la migration
-- =====================================================================

do $$
declare
  v_pb text := '';
  v_sans_limite int;
begin
  -- 4.1 Les colonnes existent.
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='garages' and column_name='essai_fin') then
    v_pb := v_pb || 'colonne essai_fin absente; ';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='garages' and column_name='abonnement_actif') then
    v_pb := v_pb || 'colonne abonnement_actif absente; ';
  end if;

  -- 4.2 GARDE-FOU CENTRAL : aucun garage existant ne doit être coupé.
  -- Cette migration part directement en production ; couper un garage en
  -- service serait le pire effet possible, et il doit être impossible de le
  -- faire par inadvertance.
  select count(*) into v_sans_limite
  from public.garages g
  where not public.acces_garage_ouvert(g.id);

  if v_sans_limite > 0 then
    v_pb := v_pb || format('%s garage(s) existant(s) se retrouvent sans acces; ', v_sans_limite);
  end if;

  -- 4.3 Droits de la règle d'accès et de la mise en service.
  if has_function_privilege('anon', 'public.acces_garage_ouvert(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.acces_garage_ouvert(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'acces_garage_ouvert ouverte a anon ou service_role; ';
  end if;
  if not has_function_privilege('authenticated', 'public.acces_garage_ouvert(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut pas lire son propre acces; ';
  end if;

  -- `create or replace` conserve les privilèges, mais on ne le suppose pas.
  if has_function_privilege('anon', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE')
     or has_function_privilege('service_role', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE') then
    v_pb := v_pb || 'creer_mon_garage a rouvert anon ou service_role; ';
  end if;
  if not has_function_privilege('authenticated', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut plus creer son garage; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot essai gratuit v1: %', v_pb;
  end if;
end;
$$;
