-- Revenue Recovery V1 — correctif : ordre serveur monotone et immuable
-- pour revenue_recovery_permissions, plus jamais un tie-break par UUID.
-- Migration additive, non destructive : ADD COLUMN + backfill + conversion
-- en identité + CREATE OR REPLACE (vue et fonction). Aucune donnée métier
-- supprimée ni modifiée (statut, preuve_reference, base_eligibilite,
-- origine, motif, created_at, enregistre_par : tous inchangés).
--
-- Bug confirmé (recette sur le projet de test isolé, jamais Production) :
-- le tri "created_at desc, id desc" utilisait un id (uuid aléatoire) comme
-- second critère. now() renvoie l'heure de DÉBUT de transaction : plusieurs
-- écritures dans la même transaction partagent donc exactement le même
-- created_at, et id desc devient alors le seul critère effectif — sans
-- corrélation avec l'ordre réel d'écriture. Démontré : une opposition
-- insérée après une autorisation, dans la même transaction, peut être
-- ignorée au profit de l'autorisation si son uuid trie plus bas. La
-- machine à états de revenue_recovery_enregistrer_permission() lit alors
-- un état "courant" faux, et le contrôle de preuve distincte après
-- opposition ne se déclenche jamais.
--
-- clock_timestamp() explicitement écarté comme correctif principal : une
-- granularité temporelle plus fine réduit la probabilité de collision sans
-- l'éliminer (charge élevée, ou une future écriture par lot dans une même
-- transaction). Le besoin réel est un ordre total et durable, jamais
-- recalculable après coup — une colonne d'identité générée serveur le
-- garantit structurellement, indépendamment de l'horloge.

-- ---------------------------------------------------------------------
-- 1. Colonne d'ordre — bigint simple d'abord, le backfill des lignes déjà
--    présentes doit pouvoir écrire une valeur choisie, ce qu'une colonne
--    "generated always as identity" refuse par construction tant qu'elle
--    n'est pas encore convertie.
-- ---------------------------------------------------------------------
alter table public.revenue_recovery_permissions
  add column if not exists numero_sequence bigint;

-- ---------------------------------------------------------------------
-- 2. Backfill déterministe des lignes déjà existantes (table vide sur les
--    environnements connus à ce jour, traité ici dans le cas général pour
--    rester sûr si ce n'était plus le cas) : row_number() garantit par
--    construction l'absence de NULL et de collision, quel que soit le tri
--    sous-jacent utilisé pour reconstituer un ordre historique plausible
--    (created_at puis id, en dernier recours, uniquement pour ce backfill
--    ponctuel — jamais réutilisé comme mécanisme de lecture vivant).
-- ---------------------------------------------------------------------
update public.revenue_recovery_permissions p
set numero_sequence = r.rang
from (
  select id, row_number() over (order by created_at, id) as rang
  from public.revenue_recovery_permissions
) r
where r.id = p.id
  and p.numero_sequence is null;

-- ---------------------------------------------------------------------
-- 3. Conversion en colonne d'identité serveur. GENERATED ALWAYS interdit
--    au client de fournir sa propre valeur (un INSERT explicite sur cette
--    colonne échoue sauf OVERRIDING SYSTEM VALUE, jamais utilisé par ce
--    projet). START WITH reprend juste après le plus grand rang déjà
--    attribué au backfill, pour qu'aucune future valeur ne collisionne.
-- ---------------------------------------------------------------------
do $$
declare
  v_depart bigint;
begin
  select coalesce(max(numero_sequence), 0) + 1 into v_depart
  from public.revenue_recovery_permissions;

  execute format(
    'alter table public.revenue_recovery_permissions alter column numero_sequence add generated always as identity (start with %s)',
    v_depart
  );
end
$$;

alter table public.revenue_recovery_permissions
  alter column numero_sequence set not null;

alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_numero_sequence_unique unique (numero_sequence);

comment on column public.revenue_recovery_permissions.numero_sequence is
  'Ordre serveur monotone et immuable, alimenté uniquement par la séquence d''identité sous-jacente (GENERATED ALWAYS) — jamais fourni par le client. Remplace id (uuid aléatoire) comme second critère de tri : sa valeur croît strictement dans l''ordre réel d''insertion, y compris pour plusieurs lignes partageant le même created_at au sein d''une même transaction.';

-- ---------------------------------------------------------------------
-- 4. Vue : tri par created_at desc, puis numero_sequence desc — jamais
--    par id. security_invoker conservé (déjà correct, RLS de l'appelant
--    toujours respecté).
-- ---------------------------------------------------------------------
create or replace view public.revenue_recovery_permissions_courant
with (security_invoker = true) as
select distinct on (garage_id, client_id, canal)
  garage_id, client_id, travail_differe_id, canal, statut,
  base_eligibilite, origine, preuve_reference, enregistre_par, created_at, numero_sequence
from public.revenue_recovery_permissions
order by garage_id, client_id, canal, created_at desc, numero_sequence desc;

comment on view public.revenue_recovery_permissions_courant is
  'Statut courant par (garage_id, client_id, canal), dérivé de la dernière ligne du journal. Tri par created_at desc puis numero_sequence desc (colonne d''identité serveur monotone) — jamais par id : contrairement à un uuid, numero_sequence reflète toujours l''ordre réel d''écriture, y compris pour des lignes partageant le même created_at au sein d''une même transaction.';

-- ---------------------------------------------------------------------
-- 5. Fonction : même critère exact pour retrouver la dernière autorisation
--    réelle après une opposition/expiration/révocation. Corps identique à
--    20260831000700, seule la clause ORDER BY de la recherche de preuve
--    change (id desc -> numero_sequence desc).
-- ---------------------------------------------------------------------
create or replace function public.revenue_recovery_enregistrer_permission(
  p_garage_id uuid,
  p_client_id uuid,
  p_canal text,
  p_statut text,
  p_origine text,
  p_travail_differe_id uuid default null,
  p_base_eligibilite text default null,
  p_preuve_reference text default null,
  p_motif text default null
)
returns public.revenue_recovery_permissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.revenue_recovery_permissions;
  v_actuel record;
  v_derniere_autorisation record;
begin
  if p_canal <> 'email' then
    raise exception 'Canal non supporté : %', p_canal;
  end if;
  if p_statut not in ('inconnu', 'autorise', 'oppose', 'expire', 'revoque') then
    raise exception 'Statut invalide : %', p_statut;
  end if;
  if p_origine is null or length(trim(p_origine)) = 0 then
    raise exception 'origine est obligatoire';
  end if;

  if not exists (
    select 1 from public.garages where id = p_garage_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé au garage %', p_garage_id;
  end if;

  if not exists (
    select 1 from public.clients where id = p_client_id and garage_id = p_garage_id
  ) then
    raise exception 'Client % n''appartient pas au garage %', p_client_id, p_garage_id;
  end if;

  if p_travail_differe_id is not null and not exists (
    select 1 from public.travaux_differes where id = p_travail_differe_id and garage_id = p_garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', p_travail_differe_id, p_garage_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_garage_id::text || ':' || p_client_id::text || ':' || p_canal, 0)
  );

  select statut into v_actuel
  from public.revenue_recovery_permissions_courant
  where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal;

  if v_actuel.statut is null then
    v_actuel.statut := 'inconnu';
  end if;

  if p_statut = 'inconnu' and v_actuel.statut <> 'inconnu' then
    raise exception 'Transition refusée : impossible de revenir à "inconnu" depuis "%"', v_actuel.statut;
  end if;

  if p_statut = 'autorise' then
    if p_base_eligibilite is null or length(trim(p_base_eligibilite)) = 0
       or p_preuve_reference is null or length(trim(p_preuve_reference)) = 0 then
      raise exception 'Transition refusée : "autorise" exige base_eligibilite et preuve_reference';
    end if;

    if v_actuel.statut in ('oppose', 'expire', 'revoque') then
      -- Comparaison contre la DERNIÈRE ligne "autorise" réelle, retrouvée
      -- par le même ordre total que la vue (created_at desc, numero_sequence
      -- desc) — jamais par id, qui ne reflète pas l'ordre réel d'écriture.
      select preuve_reference into v_derniere_autorisation
      from public.revenue_recovery_permissions
      where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal
        and statut = 'autorise'
      order by created_at desc, numero_sequence desc
      limit 1;

      if v_derniere_autorisation.preuve_reference is not null
         and p_preuve_reference is not distinct from v_derniere_autorisation.preuve_reference then
        raise exception 'Transition refusée : une nouvelle autorisation après "%" exige une preuve distincte de la dernière autorisation (pas de la ligne d''opposition, qui n''en porte pas)', v_actuel.statut;
      end if;
    end if;
  end if;

  insert into public.revenue_recovery_permissions
    (garage_id, client_id, travail_differe_id, canal, statut, base_eligibilite, origine, preuve_reference, motif)
  values
    (p_garage_id, p_client_id, p_travail_differe_id, p_canal, p_statut, p_base_eligibilite, p_origine, p_preuve_reference, p_motif)
  returning * into v_row;
  -- enregistre_par/created_at restent forcés par le trigger existant sur la
  -- table ; numero_sequence est alimenté automatiquement par l'identité,
  -- jamais fourni ni contrôlable ici.

  return v_row;
end;
$$;

-- Droits inchangés : cette redéfinition ne touche à aucun GRANT/REVOKE
-- (déjà fermés en 20260831000700/001100), seule la logique interne change.

-- ---------------------------------------------------------------------
-- 6. Vérification post-migration bloquante : la colonne existe, est
--    alimentée uniquement côté serveur (GENERATED ALWAYS), non nulle,
--    unique, et aucune ligne existante n'a été laissée sans valeur ou en
--    collision par le backfill.
-- ---------------------------------------------------------------------
do $$
declare
  v_attidentity text;
  v_is_nullable text;
  v_a_contrainte_unique boolean;
  v_lignes_totales bigint;
  v_valeurs_distinctes bigint;
begin
  select a.attidentity into v_attidentity
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'revenue_recovery_permissions'
    and a.attname = 'numero_sequence'
    and a.attnum > 0
    and not a.attisdropped;

  if v_attidentity is null then
    raise exception 'Vérification échouée : colonne numero_sequence introuvable sur revenue_recovery_permissions';
  end if;
  if v_attidentity <> 'a' then
    raise exception 'Vérification échouée : numero_sequence n''est pas GENERATED ALWAYS AS IDENTITY (attidentity=%, attendu=a)', v_attidentity;
  end if;

  select is_nullable into v_is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'revenue_recovery_permissions'
    and column_name = 'numero_sequence';
  if v_is_nullable is distinct from 'NO' then
    raise exception 'Vérification échouée : numero_sequence reste nullable (is_nullable=%)', v_is_nullable;
  end if;

  select exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'revenue_recovery_permissions'
      and tc.constraint_type = 'UNIQUE'
      and kcu.column_name = 'numero_sequence'
  ) into v_a_contrainte_unique;
  if not v_a_contrainte_unique then
    raise exception 'Vérification échouée : aucune contrainte UNIQUE trouvée sur numero_sequence';
  end if;

  select count(*), count(distinct numero_sequence)
  into v_lignes_totales, v_valeurs_distinctes
  from public.revenue_recovery_permissions;
  if v_lignes_totales <> v_valeurs_distinctes then
    raise exception 'Vérification échouée : collision détectée sur numero_sequence (% lignes, % valeurs distinctes)', v_lignes_totales, v_valeurs_distinctes;
  end if;

  if exists (select 1 from public.revenue_recovery_permissions where numero_sequence is null) then
    raise exception 'Vérification échouée : au moins une ligne existante a numero_sequence NULL après backfill';
  end if;
end
$$;
