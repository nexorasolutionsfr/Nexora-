-- Revenue Recovery V1 — fondations (lot 2/2 : tentatives figées + idempotence).
-- Migration additive, idempotente, non destructive.
--
-- Une tentative porte le contenu réellement destiné à être envoyé, figé à
-- l'insertion : jamais modifiable ensuite, contrairement au brouillon
-- (migration précédente). Aucun envoi n'a lieu dans cette migration ni dans
-- cette session — cette table prépare seulement l'idempotence du futur
-- envoi réel (lot ultérieur, hors périmètre ici).

create table if not exists public.revenue_recovery_tentatives (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  -- RESTRICT : une tentative représente un fait réel potentiel (un email en
  -- préparation ou envoyé) qui ne doit jamais disparaître silencieusement
  -- avec son travail différé source. Voir note "suppression / anonymisation"
  -- en fin de fichier.
  travail_differe_id uuid not null references public.travaux_differes(id) on delete restrict,
  brouillon_id uuid references public.revenue_recovery_brouillons(id) on delete set null,
  canal text not null check (canal in ('email')),
  destinataire text not null,
  contenu_fige text not null,
  -- Clé d'idempotence applicative (fournie par le client lors d'une future
  -- requête de préparation) : défense en profondeur en plus de l'index
  -- unique partiel ci-dessous, pour couvrir les retries après un timeout
  -- réseau ambigu ou un redémarrage serveur.
  cle_idempotence text not null,
  statut text not null default 'en_preparation' check (statut in ('en_preparation', 'envoyee', 'echec')),
  erreur text,
  cree_par uuid not null,
  created_at timestamptz not null default now()
);

-- Idempotence imposée par la base, pas par un bouton désactivé côté
-- client : un seul travail différé ne peut avoir plus d'une tentative
-- "vivante" (en préparation ou envoyée) à la fois. Un double clic, deux
-- onglets ouverts, ou une requête rejouée après timeout tombent tous sur
-- cette contrainte, pas sur une logique applicative contournable.
create unique index if not exists revenue_recovery_tentatives_actif_unique
  on public.revenue_recovery_tentatives (travail_differe_id)
  where statut in ('en_preparation', 'envoyee');

-- Défense en profondeur : la même clé d'idempotence n'est jamais réutilisée
-- deux fois pour le même garage, quel que soit le travail différé visé.
create unique index if not exists revenue_recovery_tentatives_cle_idempotence_unique
  on public.revenue_recovery_tentatives (garage_id, cle_idempotence);

comment on table public.revenue_recovery_tentatives is
  'Tentative d''envoi, contenu figé à la création. Aucune colonne de contenu ne doit jamais être modifiée après insertion. Le futur passage à envoyee/echec (lot d''envoi, hors périmètre ici) devra passer par un mécanisme serveur dédié, jamais par un GRANT update ouvert à authenticated.';

create or replace function public.revenue_recovery_tentatives_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.cree_par := auth.uid();
  new.created_at := now();
  -- Cohérence inter-garages : travail_differe_id (et brouillon_id, si
  -- fourni) doivent appartenir au même garage_id — même contrôle que sur
  -- revenue_recovery_permissions/brouillons, le RLS seul ne le garantit pas.
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  return new;
end;
$$;

drop trigger if exists revenue_recovery_tentatives_avant_insert on public.revenue_recovery_tentatives;
create trigger revenue_recovery_tentatives_avant_insert
  before insert on public.revenue_recovery_tentatives
  for each row
  execute function public.revenue_recovery_tentatives_forcer_identite();

alter table public.revenue_recovery_tentatives enable row level security;

drop policy if exists revenue_recovery_tentatives_isolation on public.revenue_recovery_tentatives;
create policy revenue_recovery_tentatives_isolation on public.revenue_recovery_tentatives
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

-- Volontairement AUCUN grant update/delete à authenticated : le contenu
-- figé ne doit jamais bouger depuis l'application. La transition de statut
-- (lot d'envoi futur) devra passer par un mécanisme serveur dédié (ex. une
-- fonction SECURITY DEFINER restreinte), pas par un UPDATE ouvert —
-- décision explicitement laissée au lot suivant.
grant select, insert on public.revenue_recovery_tentatives to authenticated;

-- Suppression / anonymisation (risque ouvert, assumé) : RESTRICT sur
-- travail_differe_id signifie que la suppression d'un travail différé
-- échouera dès qu'une tentative le référence — et transitivement, la
-- suppression d'un client échouera dès que l'un de ses travaux différés
-- porte une tentative (travaux_differes.client_id est en CASCADE depuis le
-- client, mais cascaderait alors sur une ligne désormais protégée). Aucune
-- conséquence aujourd'hui (table vide, aucun envoi réel n'a encore eu
-- lieu), mais une procédure d'anonymisation dédiée (conserver la preuve
-- d'envoi, détacher l'identité) sera nécessaire avant le lot d'envoi réel —
-- décision explicitement non prise dans ce lot, à trancher avant le Lot 4
-- du dossier de décision.
