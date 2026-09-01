-- Restauration sécurisée des liens publics atelier/devis/facture (audit
-- 2026-09-01, suite de 20260901000200_confinement_rpc_publiques_atelier_
-- devis_facture.sql) — remplace les 3 parcours par UUID brut par le même
-- mécanisme de jeton opaque déjà en place pour /c/[token] (confirmations_jetons,
-- 20260830000100) et /i/[token] (inspections_jetons, 20260830000600).
--
-- Choix d'architecture : 3 tables distinctes (une par ressource), pas une
-- table commune. Raison : c'est la convention déjà établie deux fois dans
-- ce projet (confirmations_jetons, inspections_jetons) — une table par
-- ressource garde chaque FK propre (rendez_vous_id / devis_id / facture_id
-- au lieu d'une colonne resource_type + resource_id polymorphe, plus
-- difficile à contraindre et à auditer), permet un ON DELETE CASCADE
-- naturel par ressource, et un audit visuel immédiat (compter les lignes
-- d'une table = compter les jetons d'une ressource, sans filtre
-- supplémentaire). Le coût (3 tables quasi identiques) est mineur et déjà
-- accepté ailleurs dans ce projet.
--
-- Idempotent (create table if not exists), non destructif (aucun DROP).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- atelier_jetons — lecture du RDV + changement contrôlé du statut atelier
-- ---------------------------------------------------------------------
create table if not exists public.atelier_jetons (
  id uuid primary key default gen_random_uuid(),
  rendez_vous_id uuid not null references public.rendez_vous(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  jeton_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists atelier_jetons_rendez_vous_idx on public.atelier_jetons (rendez_vous_id);

comment on table public.atelier_jetons is
  'Jetons opaques du lien atelier (staff scannant un QR sur le véhicule, ou client). used_at non utilisé comme usage unique : plusieurs consultations/changements de statut sont attendus tant que le lien est valide.';

-- ---------------------------------------------------------------------
-- devis_jetons — consultation et réponse acceptée/refusée
-- ---------------------------------------------------------------------
create table if not exists public.devis_jetons (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  jeton_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists devis_jetons_devis_idx on public.devis_jetons (devis_id);

comment on table public.devis_jetons is
  'Jetons opaques du lien devis client. used_at marqué au moment de la réponse (accepté/refusé) — le lien reste consultable en lecture après, tant qu''il n''est pas expiré/révoqué.';

-- ---------------------------------------------------------------------
-- factures_jetons — consultation en lecture seule
-- ---------------------------------------------------------------------
create table if not exists public.factures_jetons (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  jeton_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists factures_jetons_facture_idx on public.factures_jetons (facture_id);

comment on table public.factures_jetons is
  'Jetons opaques du lien facture client, lecture seule. used_at marqué au premier accès, informatif uniquement (le lien reste réutilisable en lecture).';

-- ---------------------------------------------------------------------
-- Fermeture explicite des privilèges par défaut sur les 3 tables.
--
-- Leçon tirée de 20260831001100_revenue_recovery_fermer_privileges_defaut.sql :
-- pg_default_acl peut, selon le projet, accorder automatiquement tous les
-- privilèges à anon/authenticated/service_role sur toute table créée par
-- `postgres` dans `public`. On ne compte donc jamais sur l'absence de GRANT
-- implicite : REVOKE ALL explicite pour les 4 rôles d'abord, puis rien
-- n'est ré-accordé — l'accès passe exclusivement par les fonctions
-- SECURITY DEFINER de 20260901000400_liens_publics_rpc.sql, exactement
-- comme confirmations_jetons et inspections_jetons.
-- ---------------------------------------------------------------------
alter table public.atelier_jetons enable row level security;
alter table public.devis_jetons enable row level security;
alter table public.factures_jetons enable row level security;
-- Aucune policy sur les 3 tables : verrouillées pour anon/authenticated,
-- accès uniquement via les fonctions security definer ou en tant que
-- postgres/service_role en maintenance directe.

revoke all on table public.atelier_jetons from public, anon, authenticated, service_role;
revoke all on table public.devis_jetons from public, anon, authenticated, service_role;
revoke all on table public.factures_jetons from public, anon, authenticated, service_role;
-- Volontairement aucun GRANT ré-accordé à quiconque : les fonctions
-- SECURITY DEFINER n'ont pas besoin d'un GRANT sur la table pour y
-- lire/écrire, et aucun accès direct (dashboard ou public) n'est légitime.
