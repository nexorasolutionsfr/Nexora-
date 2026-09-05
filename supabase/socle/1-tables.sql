-- ATTENTION — CE FICHIER N'EST PAS UNE MIGRATION.
--
-- Il decrit le socle tel qu'il EXISTE, releve en lecture seule sur le projet
-- PROD le 2026-09-05, par interrogation du catalogue Postgres. Il sert a
-- PROVISIONNER UN ENVIRONNEMENT NEUF (recette, bac a sable, reprise apres
-- sinistre), et a servir de reference ecrite au schema.
--
-- Ne jamais l'executer sur Test ni sur Production : ces bases portent deja ces
-- objets. Les `if not exists` le rendent inoffensif sur une base existante,
-- mais ce n'est pas une raison de l'y lancer.
--
-- Ordre d'execution : 1-tables, 2-contraintes, 3-index, 4-fonctions,
-- 5-triggers, 6-rls-policies.
--
-- Genere automatiquement. Ne pas modifier a la main : regenerer.

create table if not exists public.actions_ia (
  id uuid default gen_random_uuid() not null,
  garage_id uuid,
  type text,
  texte text,
  created_at timestamptz default now()
);

create table if not exists public.atelier_jetons (
  id uuid default gen_random_uuid() not null,
  rendez_vous_id uuid not null,
  garage_id uuid not null,
  jeton_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.clients (
  id uuid default gen_random_uuid() not null,
  garage_id uuid default gen_random_uuid() not null,
  nom text,
  email text,
  telephone text,
  created_at timestamptz default now()
);

create table if not exists public.confirmations_jetons (
  id uuid default gen_random_uuid() not null,
  rendez_vous_id uuid not null,
  garage_id uuid not null,
  jeton_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.confirmations_rappels_file (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  rendez_vous_id uuid not null,
  echeance_rdv timestamptz not null,
  destinataire_email text,
  lien_public text not null,
  statut text default 'prepare'::text not null,
  erreur_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.demandes (
  id uuid default gen_random_uuid() not null,
  garage_id uuid default gen_random_uuid(),
  client_id uuid default gen_random_uuid(),
  vehicule_id uuid,
  type_demande text,
  message_original text,
  urgence text,
  statut text,
  created_at timestamptz default now() not null,
  source text,
  canal text,
  source_id text,
  motif text,
  infos_manquantes text[],
  decided_at timestamptz,
  decision text
);

create table if not exists public.devis (
  id uuid default gen_random_uuid() not null,
  garage_id uuid,
  demande_id uuid,
  client_id uuid,
  vehicule_id uuid,
  prestation_id uuid,
  montant_ht numeric,
  montant_ttc numeric,
  statut text default 'en_attente'::text,
  message_garage text,
  date_validation timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.devis_jetons (
  id uuid default gen_random_uuid() not null,
  devis_id uuid not null,
  garage_id uuid not null,
  jeton_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.devis_lignes (
  id uuid default gen_random_uuid() not null,
  devis_id uuid not null,
  garage_id uuid not null,
  type text not null,
  libelle text not null,
  quantite numeric(10,3) not null,
  prix_unitaire_ht numeric(12,2) not null,
  taux_tva numeric(5,2) not null,
  position integer default 0 not null,
  prestation_id uuid,
  montant_ht numeric(12,2) generated always as (round((quantite * prix_unitaire_ht), 2)) stored,
  montant_tva numeric(12,2) generated always as (round(((round((quantite * prix_unitaire_ht), 2) * taux_tva) / (100)::numeric), 2)) stored,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.email_connections (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  provider text default 'google'::text not null,
  email_address text,
  access_token text,
  refresh_token text not null,
  token_expiry timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  last_history_id text
);

create table if not exists public.erreurs_automatisation (
  id uuid default gen_random_uuid() not null,
  garage_id uuid,
  workflow_nom text,
  noeud text,
  message text,
  resolu boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.factures (
  id uuid default gen_random_uuid() not null,
  garage_id uuid,
  client_id uuid,
  vehicule_id uuid,
  rendez_vous_id uuid,
  devis_id uuid,
  numero text,
  montant_ht numeric,
  montant_ttc numeric,
  statut text default 'a_payer'::text,
  created_at timestamptz default now(),
  date_paiement timestamptz,
  motif text,
  lignes jsonb default '[]'::jsonb,
  ordre_reparation_id uuid
);

create table if not exists public.factures_jetons (
  id uuid default gen_random_uuid() not null,
  facture_id uuid not null,
  garage_id uuid not null,
  jeton_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.garages (
  id uuid default gen_random_uuid() not null,
  nom_garage text not null,
  email text,
  telephone text,
  adresse text,
  modules_actifs jsonb,
  created_at timestamptz default now(),
  owner_user_id uuid,
  horaires jsonb,
  objectif_ca_mensuel numeric,
  numero_whatsapp text,
  lien_avis_google text,
  dernier_numero_facture integer default 0 not null,
  canaux_notifications jsonb default '{"devis": "email", "facture": "email", "vehicule_pret": "email", "confirmation_rdv": "email"}'::jsonb,
  theme text default 'clair'::text,
  automatisation_active boolean default false,
  gmail_connecte boolean default false,
  gmail_adresse text,
  pilote_debut timestamptz,
  rappel_confirmation_actif boolean default false not null,
  delai_confirmation_rdv_h integer default 24 not null
);

create table if not exists public.garages_secrets (
  garage_id uuid not null,
  stripe_secret_key text,
  updated_at timestamptz default now() not null
);

create table if not exists public.horaires_garage (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  jour_semaine integer not null,
  heure_ouverture time not null,
  heure_fermeture time not null,
  pause_debut time,
  pause_fin time,
  created_at timestamptz default now() not null
);

create table if not exists public.inspections (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  client_id uuid,
  vehicule_id uuid,
  rendez_vous_id uuid,
  client_nom_libre text,
  vehicule_libelle_libre text,
  immatriculation_libre text,
  kilometrage integer,
  niveau_carburant text,
  statut text default 'brouillon'::text not null,
  verrouille_le timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.inspections_historique (
  id uuid default gen_random_uuid() not null,
  inspection_id uuid not null,
  garage_id uuid not null,
  action text default 'changement_statut'::text not null,
  ancien_statut text,
  nouveau_statut text,
  motif text,
  created_at timestamptz default now() not null
);

create table if not exists public.inspections_jetons (
  id uuid default gen_random_uuid() not null,
  inspection_id uuid not null,
  garage_id uuid not null,
  jeton_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.inspections_photos (
  id uuid default gen_random_uuid() not null,
  inspection_id uuid not null,
  garage_id uuid not null,
  point_id uuid,
  storage_path text not null,
  created_at timestamptz default now() not null
);

create table if not exists public.inspections_points (
  id uuid default gen_random_uuid() not null,
  inspection_id uuid not null,
  garage_id uuid not null,
  categorie text not null,
  libelle text not null,
  etat text not null,
  commentaire text,
  soumis_client boolean default false not null,
  decision_client text,
  decision_le timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.liste_attente (
  id uuid default gen_random_uuid() not null,
  garage_id uuid,
  client_id uuid,
  prestation_id uuid,
  statut text default 'en_attente'::text,
  created_at timestamptz default now()
);

create table if not exists public.mecaniciens (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  nom text not null,
  couleur text default '#2a78d6'::text not null,
  actif boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.notifications_atelier (
  id uuid default gen_random_uuid() not null,
  rendez_vous_id uuid,
  type text default 'vehicule_pret'::text not null,
  envoye boolean default false not null,
  created_at timestamptz default now() not null
);

create table if not exists public.notifications_devis (
  id uuid default gen_random_uuid() not null,
  devis_id uuid,
  envoye boolean default false not null,
  created_at timestamptz default now() not null,
  type text default 'nouveau'::text not null,
  statut_traitement text default 'en_attente'::text not null,
  incomplet_motif text
);

create table if not exists public.notifications_factures (
  id uuid default gen_random_uuid() not null,
  facture_id uuid not null,
  type text default 'nouvelle'::text not null,
  envoye boolean default false not null,
  created_at timestamptz default now() not null
);

create table if not exists public.notifications_proposition (
  id uuid default gen_random_uuid() not null,
  proposition_id uuid,
  type text not null,
  envoye boolean default false not null,
  created_at timestamptz default now() not null
);

create table if not exists public.opportunites_actions (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  action text not null,
  motif text,
  masquer_jusqu_au timestamptz,
  effectue_par uuid not null,
  created_at timestamptz default now() not null
);

create table if not exists public.ordres_reparation (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  rendez_vous_id uuid not null,
  vehicule_id uuid not null,
  client_id uuid not null,
  devis_id uuid,
  mecanicien_id uuid,
  statut text default 'brouillon'::text not null,
  notes_internes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.ordres_reparation_historique (
  id uuid default gen_random_uuid() not null,
  ordre_reparation_id uuid not null,
  garage_id uuid not null,
  action text not null,
  ancien_statut text,
  nouveau_statut text,
  motif text,
  effectue_par uuid,
  created_at timestamptz default now() not null
);

create table if not exists public.ordres_reparation_lignes (
  id uuid default gen_random_uuid() not null,
  ordre_reparation_id uuid not null,
  garage_id uuid not null,
  type text not null,
  libelle text not null,
  quantite numeric default 1 not null,
  prix_unitaire_ht numeric,
  duree_minutes integer,
  prestation_id uuid,
  statut text default 'prevu'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  taux_tva numeric(5,2) default 20 not null
);

create table if not exists public.prestations (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  nom text not null,
  categorie text,
  duree_minutes integer not null,
  description text,
  created_at timestamptz default now() not null,
  prix_ht numeric
);

create table if not exists public.propositions_rdv (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  demande_id uuid not null,
  client_id uuid not null,
  vehicule_id uuid,
  prestation_id uuid,
  date_debut_proposee timestamptz not null,
  date_fin_proposee timestamptz not null,
  statut text default 'en_attente'::text not null,
  created_at timestamptz default now() not null,
  message_garage text,
  date_validation timestamptz
);

create table if not exists public.rappels_manques (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  telephone text,
  motif text,
  urgent boolean default false not null,
  statut text default 'a_rappeler'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.rendez_vous (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  demande_id uuid,
  client_id uuid not null,
  vehicule_id uuid,
  prestation_id uuid,
  date_debut timestamptz not null,
  date_fin timestamptz not null,
  statut text default 'en attente'::text not null,
  source text default 'nexora'::text not null,
  notes text,
  created_at timestamptz default now() not null,
  avis_demande boolean default false,
  mecanicien_id uuid,
  relance_envoyee boolean default false not null,
  statut_atelier text default 'a_venir'::text,
  lien_paiement text,
  statut_confirmation text,
  confirmation_envoyee_at timestamptz,
  confirmation_repondu_at timestamptz
);

create table if not exists public.revenue_recovery_brouillons (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  travail_differe_id uuid not null,
  canal text not null,
  contenu text not null,
  statut text default 'brouillon'::text not null,
  cree_par uuid not null,
  modifie_par uuid not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.revenue_recovery_evenements (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  travail_differe_id uuid,
  brouillon_id uuid,
  tentative_id uuid,
  type_evenement text not null,
  detail text,
  acteur uuid not null,
  created_at timestamptz default now() not null
);

create table if not exists public.revenue_recovery_garages_autorises (
  garage_id uuid not null,
  autorise boolean default false not null,
  motif text,
  autorise_le timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.revenue_recovery_permissions (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  client_id uuid,
  travail_differe_id uuid,
  canal text not null,
  statut text not null,
  base_eligibilite text,
  origine text not null,
  preuve_reference text,
  motif text,
  enregistre_par uuid not null,
  created_at timestamptz default now() not null,
  numero_sequence bigint generated always as identity not null
);

create table if not exists public.revenue_recovery_tentatives (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  travail_differe_id uuid,
  brouillon_id uuid,
  canal text not null,
  destinataire text not null,
  contenu_fige text not null,
  cle_idempotence text not null,
  statut text default 'en_preparation'::text not null,
  erreur text,
  cree_par uuid not null,
  created_at timestamptz default now() not null
);

create table if not exists public.travaux_differes (
  id uuid default gen_random_uuid() not null,
  garage_id uuid not null,
  client_id uuid not null,
  vehicule_id uuid,
  devis_id uuid,
  intervention text not null,
  montant_ttc numeric(10,2),
  niveau text default 'normal'::text not null,
  statut text default 'planifie'::text not null,
  date_relance date not null,
  motif text,
  source text default 'manuel'::text not null,
  recupere_le timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.travaux_differes_historique (
  id uuid default gen_random_uuid() not null,
  travail_id uuid not null,
  garage_id uuid not null,
  ancien_statut text,
  nouveau_statut text not null,
  ancienne_date_relance date,
  nouvelle_date_relance date,
  created_at timestamptz default now() not null
);

create table if not exists public.vehicules (
  id uuid default gen_random_uuid() not null,
  garage_id uuid default gen_random_uuid(),
  client_id uuid default gen_random_uuid(),
  marque text,
  modele text,
  annee integer,
  immatriculation text,
  kilometrage integer,
  created_at timestamptz default now() not null
);

