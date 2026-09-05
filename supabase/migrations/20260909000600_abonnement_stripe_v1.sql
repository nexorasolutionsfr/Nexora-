-- Abonnement Stripe, V1 : l'état payant du garage devient une donnée écrite
-- par Stripe, et par Stripe seul.
--
-- CE QUE CETTE MIGRATION CORRIGE, AU-DELÀ D'AJOUTER DES COLONNES
--
-- `garages_self_update` autorise le propriétaire à modifier sa ligne, sans
-- `with check` et avec un privilège UPDATE portant sur TOUTE la table. Depuis
-- le navigateur, avec la seule clé anonyme, ceci passe aujourd'hui :
--
--     supabase.from('garages').update({ abonnement_actif: true }).eq('id', ...)
--
-- Autrement dit, le garage peut s'offrir l'abonnement lui-même, repousser
-- `essai_fin`, ou réattribuer `owner_user_id` à quelqu'un d'autre. Brancher un
-- webhook Stripe sur une colonne que le client peut écrire ne prouverait rien
-- du tout : la colonne doit d'abord cesser d'être à sa portée.
--
-- On passe donc d'un privilège de table à un privilège de colonnes, en liste
-- BLANCHE. Une colonne ajoutée demain ne sera pas modifiable par le garage
-- tant que quelqu'un ne l'aura pas décidé explicitement — c'est le sens de la
-- liste blanche, et l'inverse d'une liste noire qu'on oublie de tenir.
--
-- LE FORFAIT N'EST PAS UNE CHAÎNE LIBRE
--
-- `forfait` reprend les clés de lib/tarifs.ts. La contrainte les répète : si
-- une offre est renommée d'un côté sans l'autre, l'écriture échoue au lieu de
-- laisser un garage avec un forfait que le code ne sait pas interpréter.

begin;

alter table public.garages
  add column if not exists forfait                 text,
  add column if not exists abonnement_periodicite  text,
  add column if not exists abonnement_statut       text,
  add column if not exists stripe_customer_id      text,
  add column if not exists stripe_subscription_id  text,
  -- Stripe ne garantit pas l'ordre de livraison des événements, et rejoue les
  -- siens en cas d'erreur. Cette date est la seule défense contre un
  -- « subscription.updated » ancien qui arriverait après un plus récent et
  -- ferait régresser l'état. Le webhook n'écrit que s'il est plus récent.
  add column if not exists abonnement_maj_le       timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'garages_forfait_connu') then
    alter table public.garages add constraint garages_forfait_connu
      check (forfait is null or forfait in ('essentiel', 'atelier', 'atelier-plus'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'garages_abonnement_periodicite_connue') then
    alter table public.garages add constraint garages_abonnement_periodicite_connue
      check (abonnement_periodicite is null or abonnement_periodicite in ('mensuel', 'annuel'));
  end if;
end $$;

-- Un abonnement Stripe appartient à un garage et à un seul. Sans ces index, un
-- même abonnement pourrait être recopié sur deux lignes et le webhook
-- n'aurait plus de destinataire unique.
create unique index if not exists garages_stripe_customer_id_unique
  on public.garages (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists garages_stripe_subscription_id_unique
  on public.garages (stripe_subscription_id) where stripe_subscription_id is not null;

-- Le webhook lit la ligne par l'identifiant d'abonnement Stripe : c'est la
-- seule clé que portent « customer.subscription.updated » et « .deleted ».

comment on column public.garages.forfait is
  'Offre payée, clé de lib/tarifs.ts. NULL = aucun abonnement. Écrit par le webhook Stripe uniquement.';
comment on column public.garages.abonnement_statut is
  'Statut Stripe brut (trialing, active, past_due, canceled...). abonnement_actif en est déduit.';
comment on column public.garages.abonnement_maj_le is
  'Date de l''événement Stripe appliqué. Un événement plus ancien est ignoré.';

-- ── Le garage ne décide plus de son propre accès ────────────────────────────

-- `anon` autant que `authenticated` : sur le projet Test, le rôle anonyme a
-- reçu UPDATE sur toute la table. Aucune policy ne le laisse passer
-- (`auth.uid()` y est nul, donc aucune ligne ne correspond), mais un privilège
-- qui ne tient que par une policy tient à un fil. La Production, elle, ne
-- l'accorde déjà pas : cette ligne y est sans effet, et rapproche Test d'elle.
revoke update on public.garages from anon, authenticated;

grant update (
  nom_garage,
  email,
  telephone,
  adresse,
  modules_actifs,
  horaires,
  objectif_ca_mensuel,
  numero_whatsapp,
  lien_avis_google,
  canaux_notifications,
  theme,
  automatisation_active,
  gmail_connecte,
  gmail_adresse,
  rappel_confirmation_actif,
  delai_confirmation_rdv_h,
  profil_activite,
  siren,
  tva_sur_les_debits
) on public.garages to authenticated;

-- Restent hors de portée du garage, et c'est délibéré :
--   id, created_at            — identité de la ligne
--   owner_user_id             — donner son garage à un autre compte
--   essai_fin, abonnement_*   — son propre accès
--   forfait, stripe_*         — ce qu'il paie
--   dernier_numero_facture    — la numérotation des factures, dont
--                               20260904001000 a fait une donnée immuable
--   pilote_debut              — l'offre pilote, qui est une décision commerciale

-- ── Séquelle des lots de révocation service_role (PR #40, PR #50) ──────────
--
-- `garages` et `clients` portent des contraintes de ce genre :
--
--     check (profil_activite is null or profil_activite_valide(profil_activite))
--     check (siren is null or siren_valide(siren))
--
-- Une expression de CHECK s'évalue avec les droits de CELUI QUI ÉCRIT, et
-- PostgreSQL réévalue toutes les contraintes de la ligne à chaque UPDATE, même
-- portant sur une colonne sans rapport. Or les lots de durcissement ont retiré
-- `execute` à `service_role` sur toutes les fonctions neuves, celles-ci
-- comprises.
--
-- Conséquence, constatée sur les DEUX projets : aucune écriture par la clé de
-- service ne passe sur `garages` ni sur `clients`. Le message est
-- « permission denied for function siren_valide », qui ne laisse pas deviner
-- qu'il s'agit d'une contrainte de table. Le webhook Stripe est la première
-- chose à écrire avec cette clé, donc la première à buter dessus — mais tout
-- traitement serveur écrivant un client bute au même endroit.
--
-- Ces droits n'ouvrent rien : les deux fonctions sont des validateurs purs,
-- sans lecture ni écriture, et `service_role` est une clé serveur de confiance
-- qui contourne déjà les policies.
--
-- La règle générale, plutôt que deux lignes à retenir : une fonction appelée
-- par une contrainte de table doit être exécutable par tout rôle autorisé à
-- écrire cette table. La boucle l'applique, et la vérification finale la
-- réaffirme pour les fonctions qui viendront.
do $$
declare
  f record;
begin
  for f in
    select distinct p.oid::regprocedure as signature
    from pg_constraint c
    join pg_depend d on d.objid = c.oid and d.classid = 'pg_constraint'::regclass
    join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'c' and n.nspname = 'public'
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to service_role', f.signature);
    raise notice 'execute accordé à service_role sur %', f.signature;
  end loop;
end $$;

-- `using` filtre la ligne visée, `with check` filtre la ligne obtenue. Sans le
-- second, rien n'empêche une mise à jour de produire une ligne qu'on n'aurait
-- pas eu le droit de viser.
drop policy if exists garages_self_update on public.garages;
create policy garages_self_update on public.garages
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ── Vérification : cette migration part directement en Production ───────────
--
-- Elle décrit l'état visé et échoue bruyamment plutôt que de laisser passer un
-- écart. Un échec ici est son résultat utile, pas un incident.
do $$
declare
  manquantes text;
  fuite      text;
  perdues    text;
  muettes    text;
begin
  select string_agg(c.nom, ', ' order by c.nom) into manquantes
  from (values
    ('forfait'), ('abonnement_periodicite'), ('abonnement_statut'),
    ('stripe_customer_id'), ('stripe_subscription_id'), ('abonnement_maj_le')
  ) as c(nom)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages' and column_name = c.nom
  );
  if manquantes is not null then
    raise exception 'Colonnes d''abonnement absentes après migration : %', manquantes;
  end if;

  -- Le point entier de la migration. Si ceci passe, le webhook ne prouve rien.
  --
  -- `has_column_privilege` et pas `information_schema.column_privileges` : la
  -- vue d'information_schema ne montre que les lignes dont le rôle courant est
  -- donneur ou bénéficiaire, donc elle peut répondre « rien à signaler » par
  -- simple manque de visibilité. La fonction, elle, répond sur l'état réel.
  select string_agg(c.nom, ', ' order by c.nom) into fuite
  from (values
    ('id'), ('created_at'), ('owner_user_id'), ('essai_fin'), ('abonnement_actif'),
    ('abonnement_statut'), ('abonnement_periodicite'), ('abonnement_maj_le'),
    ('forfait'), ('stripe_customer_id'), ('stripe_subscription_id'),
    ('dernier_numero_facture'), ('pilote_debut')
  ) as c(nom)
  where has_column_privilege('authenticated', 'public.garages', c.nom, 'UPDATE');
  if fuite is not null then
    raise exception 'authenticated peut encore écrire des colonnes réservées : %', fuite;
  end if;

  -- L'inverse est tout aussi grave : avoir fermé les paramètres du garage.
  select string_agg(c.nom, ', ' order by c.nom) into perdues
  from (values
    ('nom_garage'), ('adresse'), ('telephone'), ('email'), ('horaires'),
    ('objectif_ca_mensuel'), ('lien_avis_google'), ('numero_whatsapp'),
    ('canaux_notifications'), ('theme'), ('automatisation_active'),
    ('rappel_confirmation_actif'), ('delai_confirmation_rdv_h'),
    ('siren'), ('tva_sur_les_debits')
  ) as c(nom)
  where not has_column_privilege('authenticated', 'public.garages', c.nom, 'UPDATE');
  if perdues is not null then
    raise exception 'L''écran Paramètres ne peut plus enregistrer : %', perdues;
  end if;

  -- anon n'a jamais eu à écrire ici, mais autant le constater plutôt que le
  -- supposer : c'est le rôle que porte la clé publique du navigateur.
  if has_column_privilege('anon', 'public.garages', 'abonnement_actif', 'UPDATE') then
    raise exception 'anon peut écrire abonnement_actif';
  end if;

  -- Le webhook écrit avec la clé de service. S'il perd ce droit, un paiement
  -- réussi n'ouvre plus rien.
  if not has_column_privilege('service_role', 'public.garages', 'abonnement_actif', 'UPDATE')
     or not has_column_privilege('service_role', 'public.garages', 'forfait', 'UPDATE') then
    raise exception 'service_role ne peut plus écrire l''abonnement : le webhook Stripe serait muet';
  end if;

  -- Générique : toute fonction appelée par une contrainte de table doit être
  -- exécutable par service_role, sans quoi la table entière devient
  -- inaccessible en écriture serveur — avec un message d'erreur qui désigne la
  -- fonction et jamais la contrainte.
  select string_agg(distinct t.signature::text, ', ') into muettes
  from (
    select p.oid::regprocedure as signature
    from pg_constraint c
    join pg_depend d on d.objid = c.oid and d.classid = 'pg_constraint'::regclass
    join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'c' and n.nspname = 'public'
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) t;
  if muettes is not null then
    raise exception 'Contraintes appelant des fonctions fermées à service_role : % — toute écriture serveur sur ces tables échouerait', muettes;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_self_update'
      and with_check like '%owner_user_id%'
  ) then
    raise exception 'garages_self_update est sans with_check : le garage peut encore se donner à un autre compte';
  end if;
end $$;

commit;
