-- Onboarding garage V1 — un garage se crée lui-même, sans intervention humaine.
-- Référence : docs/architecture/onboarding-garage-v1.md
--
-- LE PROBLÈME QUE CE LOT FERME
--
-- Aujourd'hui, un compte qui n'a aucun garage rattaché tombe sur un cul-de-sac :
-- components/NexoraDashboard.jsx affiche « Aucun garage n'est associe a ce
-- compte. Contactez le support Nexora. » La création de la ligne `garages` est
-- donc un geste manuel, fait par l'éditeur, pour chaque nouveau client. C'est le
-- point unique qui empêche toute mise en service autonome.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- Additif, deux objets neufs et une colonne neuve :
--   - public.garages.profil_activite  (colonne, nullable)
--   - public.profil_activite_valide(text[])  (fonction, règle unique)
--   - public.creer_mon_garage(...)  (RPC de création, security definer)
--
-- Elle ne modifie AUCUNE colonne existante, ne supprime rien, ne répare aucune
-- donnée. Les garages déjà en base gardent `profil_activite` à NULL, ce qui
-- signifie « profil non renseigné » et n'enlève aucune fonctionnalité.
--
-- Migration volontairement NON idempotente, comme les précédentes : aucun
-- IF NOT EXISTS, aucun OR REPLACE. Les trois noms sont neufs. En cas de
-- collision elle doit échouer bruyamment plutôt qu'écraser un objet existant.

-- =====================================================================
-- 1. Vocabulaire des profils d'activité — source unique de la règle
-- =====================================================================
-- Les neuf valeurs ne sont pas inventées : elles reprennent les activités
-- réellement constatées sur les garages indépendants qualifiés en septembre
-- 2026 (mécanique, carrosserie, pneus, négoce VO, dépannage, véhicules
-- anciens, VL/PL/agricole, voitures sans permis, diagnostic électronique).
--
-- Le profil sert à deux choses, et à rien d'autre :
--   - adapter les modules affichés dans le tableau de bord ;
--   - adapter le vocabulaire des écrans.
-- Il n'ouvre ni ne ferme aucun droit. Ce n'est pas un mécanisme de sécurité.
--
-- Règle FERMÉE PAR DÉFAUT, comme devis_statut_modifiable : NULL est refusé,
-- le tableau vide est refusé, et toute valeur hors vocabulaire est refusée.

create function public.profil_activite_valide(p_profil text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_profil is not null
     and array_length(p_profil, 1) is not null
     and array_length(p_profil, 1) between 1 and 9
     and not exists (
       select 1
       from unnest(p_profil) as v(valeur)
       where v.valeur is null
          or v.valeur not in (
            'mecanique',
            'carrosserie',
            'diagnostic_electronique',
            'pneus',
            'vente_vo',
            'depannage',
            'vehicules_anciens',
            'poids_lourds_agricole',
            'voitures_sans_permis'
          )
     );
$$;

comment on function public.profil_activite_valide(text[]) is
  'Vrai si le tableau décrit un profil d''activité de garage recevable : non nul, non vide, au plus neuf entrées, toutes dans le vocabulaire figé. Fermé par défaut. Source unique de la règle — voir docs/architecture/onboarding-garage-v1.md.';

-- =====================================================================
-- 2. Colonne profil_activite sur public.garages
-- =====================================================================
-- Nullable À DESSEIN : les garages créés avant ce lot n'ont pas de profil, et
-- leur en imposer un rétroactivement serait inventer une donnée métier. NULL
-- se lit « profil non renseigné » et, côté interface, fait afficher tous les
-- modules — c'est-à-dire exactement le comportement actuel.
--
-- La contrainte CHECK ne s'applique donc qu'aux valeurs non nulles.

alter table public.garages
  add column profil_activite text[];

alter table public.garages
  add constraint garages_profil_activite_valide
  check (profil_activite is null or public.profil_activite_valide(profil_activite));

comment on column public.garages.profil_activite is
  'Activités réellement exercées par le garage, choisies à la mise en service. NULL = non renseigné (garage antérieur au lot onboarding) : l''interface affiche alors tous les modules. N''ouvre aucun droit.';

-- =====================================================================
-- 3. RPC de création — public.creer_mon_garage
-- =====================================================================
-- `security definer` est nécessaire et assumé : l'insertion dans `garages`
-- doit être possible pour un utilisateur qui, par construction, n'est encore
-- propriétaire d'aucun garage — donc qu'aucune policy RLS fondée sur
-- l'appartenance ne peut autoriser.
--
-- Le contournement de RLS est strictement encadré par trois gardes :
--   1. auth.uid() doit exister — un appel anonyme est refusé ;
--   2. owner_user_id est TOUJOURS auth.uid(), jamais un paramètre : l'appelant
--      ne peut pas créer un garage au nom d'un autre compte ;
--   3. un compte qui possède déjà un garage est refusé — pas de création en
--      rafale, pas d'escalade par multiplication de lignes.
--
-- C'est la différence de fond avec la faille corrigée le 2026-09-01 sur le
-- rattachement Gmail : là, l'identité du garage venait d'un paramètre non
-- signé fourni par l'appelant. Ici, elle vient de la session, et d'elle seule.

create function public.creer_mon_garage(
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

  -- Un compte = un garage. Verrou explicite plutôt qu'implicite : la table ne
  -- porte aujourd'hui aucune contrainte d'unicité sur owner_user_id, et ce lot
  -- ne lui en ajoute pas (ce serait modifier une table existante au-delà de
  -- l'additif). Le contrôle est donc porté ici, dans le seul chemin de
  -- création ouvert aux comptes clients.
  if exists (select 1 from public.garages g where g.owner_user_id = v_utilisateur) then
    raise exception 'creer_mon_garage: ce compte possede deja un garage'
      using errcode = '23505';
  end if;

  insert into public.garages (owner_user_id, nom_garage, adresse, telephone, email, profil_activite)
  values (
    v_utilisateur,
    btrim(p_nom_garage),
    nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_telephone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_profil_activite
  )
  returning id into v_garage_id;

  return v_garage_id;
end;
$$;

comment on function public.creer_mon_garage(text, text, text, text, text[]) is
  'Crée le garage du compte appelant et renvoie son identifiant. owner_user_id vaut toujours auth.uid() : l''appelant ne peut créer un garage que pour lui-même. Refuse un appel anonyme, un nom vide, un profil hors vocabulaire, et un compte possédant déjà un garage. Seul chemin de création ouvert aux comptes clients.';

-- Fermé par défaut, puis ouvert au seul rôle qui en a l'usage.
revoke execute on function public.creer_mon_garage(text, text, text, text, text[]) from public;
revoke execute on function public.creer_mon_garage(text, text, text, text, text[]) from anon;
-- service_role N'EST PAS redondant ici. Supabase pose
-- `alter default privileges in schema public grant all on functions to service_role`,
-- si bien que toute fonction neuve lui est accordée à la création. Sans cette
-- ligne, le bloc de vérification échoue — et il a effectivement échoué au
-- premier essai d'application sur Test, ce qui est exactement son rôle.
revoke execute on function public.creer_mon_garage(text, text, text, text, text[]) from service_role;
grant execute on function public.creer_mon_garage(text, text, text, text, text[]) to authenticated;

revoke execute on function public.profil_activite_valide(text[]) from public;
grant execute on function public.profil_activite_valide(text[]) to authenticated;
-- Simple prédicat sans effet de bord, mais on ne laisse pas un droit non
-- demandé s'installer par défaut.
revoke execute on function public.profil_activite_valide(text[]) from service_role;

-- =====================================================================
-- 4. Vérification dans la transaction de la migration
-- =====================================================================
-- L'état visé, et rien d'autre, doit être atteint. La migration échoue sinon.

do $$
declare
  v_pb text := '';
  v_colonnes_bloquantes text;
begin
  -- 4.1 La colonne et sa contrainte existent.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages' and column_name = 'profil_activite'
  ) then
    v_pb := v_pb || 'la colonne profil_activite est absente; ';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'garages_profil_activite_valide'
      and conrelid = 'public.garages'::regclass
  ) then
    v_pb := v_pb || 'la contrainte garages_profil_activite_valide est absente; ';
  end if;

  -- 4.2 La RPC est fermée à anon et à service_role, ouverte à authenticated.
  if has_function_privilege('anon', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE') then
    v_pb := v_pb || 'anon peut creer un garage; ';
  end if;
  if has_function_privilege('service_role', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE') then
    v_pb := v_pb || 'service_role peut creer un garage; ';
  end if;
  if not has_function_privilege('authenticated', 'public.creer_mon_garage(text, text, text, text, text[])', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut pas creer son garage; ';
  end if;

  -- 4.3 GARDE-FOU CENTRAL DE CE LOT.
  -- L'insertion de la RPC ne renseigne que six colonnes. Si `garages` porte
  -- une AUTRE colonne NOT NULL sans valeur par défaut, la RPC compilerait
  -- sans erreur mais échouerait au premier appel réel, en production, devant
  -- un client. Le schéma de `garages` n'étant pas versionné dans ce dépôt
  -- (constat du 2026-09-05), cette hypothèse ne peut pas être vérifiée par
  -- lecture du code : elle est donc vérifiée ici, contre la base réelle, et
  -- fait échouer la migration plutôt que de laisser passer une bombe à
  -- retardement.
  select string_agg(c.column_name, ', ' order by c.column_name)
    into v_colonnes_bloquantes
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'garages'
    and c.is_nullable = 'NO'
    and c.column_default is null
    and c.is_identity = 'NO'
    and c.is_generated = 'NEVER'
    and c.column_name not in (
      'id', 'owner_user_id', 'nom_garage', 'adresse', 'telephone', 'email', 'profil_activite'
    );

  if v_colonnes_bloquantes is not null then
    v_pb := v_pb || format(
      'creer_mon_garage ne renseigne pas ces colonnes obligatoires de garages: %s; ',
      v_colonnes_bloquantes
    );
  end if;

  -- 4.4 Les colonnes que la RPC écrit doivent exister.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages' and column_name = 'owner_user_id'
  ) then
    v_pb := v_pb || 'la colonne owner_user_id est absente; ';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages' and column_name = 'nom_garage'
  ) then
    v_pb := v_pb || 'la colonne nom_garage est absente; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot onboarding garage v1: %', v_pb;
  end if;
end;
$$;
