-- Refermer ce que 20260913000100 avait ouvert trop large.
--
-- CE QUI A ÉTÉ CONSTATÉ
--
-- La policy `garages_membre_select`, posée le matin même, donne au salarié la
-- lecture de SA ligne `garages`. Mesuré ensuite sur Test avec un compte
-- mécanicien réel : la ligne revient **entière**, soit 36 colonnes, dont
-- `stripe_customer_id`, `stripe_subscription_id`, `forfait`,
-- `abonnement_statut`, `siren` et `objectif_ca_mensuel`. Un mécanicien n'a
-- rien à faire de l'objectif de chiffre d'affaires de son patron ni de ses
-- identifiants de facturation.
--
-- C'est la limite que la migration 20260905000400 énonçait déjà pour la
-- surface du mécanicien : « RLS filtre des lignes, jamais des colonnes ».
-- Elle vaut ici aussi. La policy est donc retirée, et remplacée par la
-- projection explicite des seules colonnes dont l'application a besoin pour
-- ouvrir l'espace d'un salarié.
--
-- CE QUE L'APPLICATION LIT VRAIMENT
--
-- Au démarrage, elle a besoin de : l'identifiant du garage, son nom, et les
-- cinq champs qui décident si l'accès est ouvert ou terminé. Rien d'autre.
-- `mes_adhesions()` les rend désormais, et reste la seule porte du salarié.
--
-- Le propriétaire n'est pas concerné : sa policy `owner_user_id`, contrôlée
-- par le verrou 20260909000900, est inchangée, et lui seul continue de lire
-- sa ligne en entier.

drop policy if exists garages_membre_select on public.garages;

create or replace function public.mes_adhesions()
returns table (
  garage_id uuid,
  nom_garage text,
  role text,
  acces_motif text,
  acces_fin timestamptz,
  abonnement_actif boolean,
  abonnement_statut text,
  forfait text,
  abonnement_prochaine_facture timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.garage_id,
         g.nom_garage,
         m.role,
         g.acces_motif,
         g.acces_fin,
         g.abonnement_actif,
         g.abonnement_statut,
         g.forfait,
         g.abonnement_prochaine_facture
  from public.garage_membres m
  join public.garages g on g.id = m.garage_id
  where m.user_id = auth.uid()
    and m.actif = true
    and m.revoked_at is null
  order by m.created_at, m.id
$$;

comment on function public.mes_adhesions() is
  'Les garages où le compte connecté a une adhésion active, avec son rôle et le strict nécessaire pour ouvrir ou fermer son espace. Projection explicite : ni identifiants de facturation, ni objectif de chiffre d''affaires, ni SIREN. Élargie le 2026-09-13 en remplacement de la policy garages_membre_select, qui rendait la ligne entière.';

revoke execute on function public.mes_adhesions() from public, anon, service_role;
grant execute on function public.mes_adhesions() to authenticated;

do $$
declare
  v_pb text := '';
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_membre_select'
  ) then
    v_pb := v_pb || E'\n- la policy trop large est toujours en place';
  end if;

  -- La policy du propriétaire doit survivre : cette migration retire, elle ne
  -- remplace pas la porte du dirigeant.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages' and cmd = 'SELECT'
      and coalesce(qual, '') like '%owner_user_id%'
  ) then
    v_pb := v_pb || E'\n- la policy de lecture du proprietaire a disparu';
  end if;

  if to_regprocedure('public.mes_adhesions()') is null then
    v_pb := v_pb || E'\n- mes_adhesions() est absente';
  end if;

  -- Aucune des colonnes sensibles ne doit figurer dans la projection.
  if exists (
    select 1
    from information_schema.parameters p
    where p.specific_schema = 'public'
      and p.parameter_mode = 'OUT'
      and p.parameter_name in ('stripe_customer_id', 'stripe_subscription_id',
                               'objectif_ca_mensuel', 'siren', 'owner_user_id')
      and p.specific_name like 'mes_adhesions%'
  ) then
    v_pb := v_pb || E'\n- mes_adhesions() projette une colonne sensible';
  end if;

  if v_pb <> '' then
    raise exception 'Migration 20260913000300 incomplete : %', v_pb;
  end if;
  raise notice 'Lecture du membre refermee sur les colonnes utiles';
end;
$$;
