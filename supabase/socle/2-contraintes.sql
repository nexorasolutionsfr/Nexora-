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

alter table public.actions_ia
  add constraint actions_ia_pkey PRIMARY KEY (id);
alter table public.atelier_jetons
  add constraint atelier_jetons_pkey PRIMARY KEY (id);
alter table public.clients
  add constraint clients_pkey PRIMARY KEY (id);
alter table public.confirmations_jetons
  add constraint confirmations_jetons_pkey PRIMARY KEY (id);
alter table public.confirmations_rappels_file
  add constraint confirmations_rappels_file_pkey PRIMARY KEY (id);
alter table public.demandes
  add constraint demandes_pkey PRIMARY KEY (id);
alter table public.devis
  add constraint devis_pkey PRIMARY KEY (id);
alter table public.devis_jetons
  add constraint devis_jetons_pkey PRIMARY KEY (id);
alter table public.devis_lignes
  add constraint devis_lignes_pkey PRIMARY KEY (id);
alter table public.email_connections
  add constraint email_connections_pkey PRIMARY KEY (id);
alter table public.erreurs_automatisation
  add constraint erreurs_automatisation_pkey PRIMARY KEY (id);
alter table public.factures
  add constraint factures_pkey PRIMARY KEY (id);
alter table public.factures_jetons
  add constraint factures_jetons_pkey PRIMARY KEY (id);
alter table public.garages
  add constraint "Garages_pkey" PRIMARY KEY (id);
alter table public.garages_secrets
  add constraint garages_secrets_pkey PRIMARY KEY (garage_id);
alter table public.horaires_garage
  add constraint horaires_garages_pkey PRIMARY KEY (id);
alter table public.inspections
  add constraint inspections_pkey PRIMARY KEY (id);
alter table public.inspections_historique
  add constraint inspections_historique_pkey PRIMARY KEY (id);
alter table public.inspections_jetons
  add constraint inspections_jetons_pkey PRIMARY KEY (id);
alter table public.inspections_photos
  add constraint inspections_photos_pkey PRIMARY KEY (id);
alter table public.inspections_points
  add constraint inspections_points_pkey PRIMARY KEY (id);
alter table public.liste_attente
  add constraint liste_attente_pkey PRIMARY KEY (id);
alter table public.mecaniciens
  add constraint mecaniciens_pkey PRIMARY KEY (id);
alter table public.notifications_atelier
  add constraint notifications_atelier_pkey PRIMARY KEY (id);
alter table public.notifications_devis
  add constraint notifications_devis_pkey PRIMARY KEY (id);
alter table public.notifications_factures
  add constraint notifications_factures_pkey PRIMARY KEY (id);
alter table public.notifications_proposition
  add constraint notifications_proposition_pkey PRIMARY KEY (id);
alter table public.opportunites_actions
  add constraint opportunites_actions_pkey PRIMARY KEY (id);
alter table public.ordres_reparation
  add constraint ordres_reparation_pkey PRIMARY KEY (id);
alter table public.ordres_reparation_historique
  add constraint ordres_reparation_historique_pkey PRIMARY KEY (id);
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_pkey PRIMARY KEY (id);
alter table public.prestations
  add constraint prestations_pkey PRIMARY KEY (id);
alter table public.propositions_rdv
  add constraint propositions_rdv_pkey PRIMARY KEY (id);
alter table public.rappels_manques
  add constraint rappels_manques_pkey PRIMARY KEY (id);
alter table public.rendez_vous
  add constraint rendez_vous_pkey PRIMARY KEY (id);
alter table public.revenue_recovery_brouillons
  add constraint revenue_recovery_brouillons_pkey PRIMARY KEY (id);
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_pkey PRIMARY KEY (id);
alter table public.revenue_recovery_garages_autorises
  add constraint revenue_recovery_garages_autorises_pkey PRIMARY KEY (garage_id);
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_pkey PRIMARY KEY (id);
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_pkey PRIMARY KEY (id);
alter table public.travaux_differes
  add constraint travaux_differes_pkey PRIMARY KEY (id);
alter table public.travaux_differes_historique
  add constraint travaux_differes_historique_pkey PRIMARY KEY (id);
alter table public.vehicules
  add constraint vehicules_pkey PRIMARY KEY (id);
alter table public.atelier_jetons
  add constraint atelier_jetons_jeton_hash_key UNIQUE (jeton_hash);
alter table public.confirmations_jetons
  add constraint confirmations_jetons_jeton_hash_key UNIQUE (jeton_hash);
alter table public.confirmations_rappels_file
  add constraint confirmations_rappels_file_rendez_vous_id_echeance_rdv_key UNIQUE (rendez_vous_id, echeance_rdv);
alter table public.devis_jetons
  add constraint devis_jetons_jeton_hash_key UNIQUE (jeton_hash);
alter table public.email_connections
  add constraint email_connections_garage_id_key UNIQUE (garage_id);
alter table public.factures_jetons
  add constraint factures_jetons_jeton_hash_key UNIQUE (jeton_hash);
alter table public.inspections_jetons
  add constraint inspections_jetons_jeton_hash_key UNIQUE (jeton_hash);
alter table public.ordres_reparation
  add constraint ordres_reparation_rendez_vous_unique UNIQUE (rendez_vous_id);
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_numero_sequence_unique UNIQUE (numero_sequence);
alter table public.vehicules
  add constraint vehicules_immatriculation_unique UNIQUE (immatriculation);
alter table public.confirmations_rappels_file
  add constraint confirmations_rappels_file_statut_check CHECK ((statut = ANY (ARRAY['prepare'::text, 'envoye'::text, 'erreur'::text])));
alter table public.demandes
  add constraint demandes_decision_check CHECK ((decision = ANY (ARRAY['validee'::text, 'refusee'::text])));
alter table public.devis_lignes
  add constraint devis_lignes_libelle_non_vide CHECK ((length(btrim(libelle)) > 0));
alter table public.devis_lignes
  add constraint devis_lignes_prix_positif CHECK ((prix_unitaire_ht >= (0)::numeric));
alter table public.devis_lignes
  add constraint devis_lignes_quantite_positive CHECK ((quantite > (0)::numeric));
alter table public.devis_lignes
  add constraint devis_lignes_taux_tva_borne CHECK (((taux_tva >= (0)::numeric) AND (taux_tva <= (100)::numeric)));
alter table public.devis_lignes
  add constraint devis_lignes_type_valide CHECK ((type = ANY (ARRAY['main_oeuvre'::text, 'piece'::text])));
alter table public.inspections
  add constraint inspections_niveau_carburant_check CHECK (((niveau_carburant IS NULL) OR (niveau_carburant = ANY (ARRAY['reserve'::text, 'un_quart'::text, 'moitie'::text, 'trois_quarts'::text, 'plein'::text]))));
alter table public.inspections
  add constraint inspections_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'en_attente_client'::text, 'consulte'::text, 'partiellement_valide'::text, 'valide'::text, 'refuse'::text, 'finalisee_sans_decision'::text])));
alter table public.inspections_points
  add constraint inspections_points_categorie_check CHECK ((categorie = ANY (ARRAY['exterieur'::text, 'pneus'::text, 'voyants'::text, 'objets'::text, 'autre'::text])));
alter table public.inspections_points
  add constraint inspections_points_decision_client_check CHECK (((decision_client IS NULL) OR (decision_client = ANY (ARRAY['valide'::text, 'refuse'::text]))));
alter table public.inspections_points
  add constraint inspections_points_decision_si_soumis CHECK (((decision_client IS NULL) OR (soumis_client = true)));
alter table public.inspections_points
  add constraint inspections_points_etat_check CHECK ((etat = ANY (ARRAY['ok'::text, 'a_surveiller'::text, 'a_valider_client'::text, 'dommage'::text])));
alter table public.inspections_points
  add constraint inspections_points_soumission_valide CHECK (((soumis_client = false) OR (etat = 'a_valider_client'::text)));
alter table public.notifications_devis
  add constraint notifications_devis_incomplet_motif_check CHECK (((incomplet_motif IS NULL) OR (incomplet_motif = ANY (ARRAY['devis_absent'::text, 'client_absent'::text, 'vehicule_absent'::text, 'garage_absent'::text, 'donnees_incompletes'::text]))));
alter table public.notifications_devis
  add constraint notifications_devis_statut_traitement_check CHECK ((statut_traitement = ANY (ARRAY['en_attente'::text, 'envoye'::text, 'incomplet'::text, 'erreur'::text, 'abandonne'::text])));
alter table public.opportunites_actions
  add constraint opportunites_actions_action_check CHECK ((action = ANY (ARRAY['traite'::text, 'reporte'::text, 'reactiver'::text])));
alter table public.opportunites_actions
  add constraint opportunites_actions_reporte_complet CHECK (((action <> 'reporte'::text) OR ((motif IS NOT NULL) AND (length(TRIM(BOTH FROM motif)) > 0) AND (masquer_jusqu_au IS NOT NULL))));
alter table public.opportunites_actions
  add constraint opportunites_actions_source_type_check CHECK ((source_type = ANY (ARRAY['rappel'::text, 'demande'::text, 'proposition'::text, 'devis'::text, 'rdv_confirmation'::text, 'inspection'::text, 'travail_differe'::text, 'client_dormant'::text])));
alter table public.ordres_reparation
  add constraint ordres_reparation_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'confirme'::text, 'termine'::text, 'annule'::text])));
alter table public.ordres_reparation_historique
  add constraint ordres_reparation_historique_action_check CHECK ((action = ANY (ARRAY['creation'::text, 'changement_statut'::text, 'changement_mecanicien'::text, 'annulation'::text])));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_duree_check CHECK ((((type = 'main_oeuvre'::text) AND ((duree_minutes IS NULL) OR (duree_minutes > 0))) OR ((type = 'piece'::text) AND (duree_minutes IS NULL))));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_prix_unitaire_ht_check CHECK (((prix_unitaire_ht IS NULL) OR (prix_unitaire_ht >= (0)::numeric)));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_quantite_check CHECK ((quantite > (0)::numeric));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_statut_check CHECK ((statut = ANY (ARRAY['prevu'::text, 'fait'::text, 'annule'::text])));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_taux_tva_borne CHECK (((taux_tva >= (0)::numeric) AND (taux_tva <= (100)::numeric)));
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_type_check CHECK ((type = ANY (ARRAY['main_oeuvre'::text, 'piece'::text])));
alter table public.rendez_vous
  add constraint rendez_vous_statut_confirmation_check CHECK (((statut_confirmation IS NULL) OR (statut_confirmation = ANY (ARRAY['en_attente_confirmation'::text, 'confirme_par_client'::text, 'report_demande'::text, 'annule_par_client'::text]))));
alter table public.revenue_recovery_brouillons
  add constraint revenue_recovery_brouillons_canal_check CHECK ((canal = 'email'::text));
alter table public.revenue_recovery_brouillons
  add constraint revenue_recovery_brouillons_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'abandonne'::text, 'transforme_en_tentative'::text])));
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_type_evenement_check CHECK ((type_evenement = ANY (ARRAY['brouillon_cree'::text, 'brouillon_modifie'::text, 'brouillon_abandonne'::text, 'tentative_creee'::text, 'envoi_reussi'::text, 'envoi_echec'::text, 'reponse_recue'::text])));
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_autorise_justifie CHECK (((statut <> 'autorise'::text) OR ((base_eligibilite IS NOT NULL) AND (length(TRIM(BOTH FROM base_eligibilite)) > 0) AND (preuve_reference IS NOT NULL) AND (length(TRIM(BOTH FROM preuve_reference)) > 0))));
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_canal_check CHECK ((canal = 'email'::text));
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_statut_check CHECK ((statut = ANY (ARRAY['inconnu'::text, 'autorise'::text, 'oppose'::text, 'expire'::text, 'revoque'::text])));
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_canal_check CHECK ((canal = 'email'::text));
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_statut_check CHECK ((statut = ANY (ARRAY['en_preparation'::text, 'envoyee'::text, 'echec'::text])));
alter table public.travaux_differes
  add constraint travaux_differes_niveau_check CHECK ((niveau = ANY (ARRAY['normal'::text, 'important'::text, 'securite'::text])));
alter table public.travaux_differes
  add constraint travaux_differes_statut_check CHECK ((statut = ANY (ARRAY['planifie'::text, 'a_relancer'::text, 'contacte_en_attente'::text, 'recupere'::text, 'refus_definitif'::text])));
alter table public.actions_ia
  add constraint actions_ia_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.atelier_jetons
  add constraint atelier_jetons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.atelier_jetons
  add constraint atelier_jetons_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id) ON DELETE CASCADE;
alter table public.clients
  add constraint clients_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.confirmations_jetons
  add constraint confirmations_jetons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.confirmations_jetons
  add constraint confirmations_jetons_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id);
alter table public.confirmations_rappels_file
  add constraint confirmations_rappels_file_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.confirmations_rappels_file
  add constraint confirmations_rappels_file_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id);
alter table public.demandes
  add constraint demandes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.demandes
  add constraint demandes_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.demandes
  add constraint demandes_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table public.devis
  add constraint devis_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.devis
  add constraint devis_demande_id_fkey FOREIGN KEY (demande_id) REFERENCES demandes(id);
alter table public.devis
  add constraint devis_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.devis
  add constraint devis_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id);
alter table public.devis
  add constraint devis_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table public.devis_jetons
  add constraint devis_jetons_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE;
alter table public.devis_jetons
  add constraint devis_jetons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.devis_lignes
  add constraint devis_lignes_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE;
alter table public.devis_lignes
  add constraint devis_lignes_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE RESTRICT;
alter table public.devis_lignes
  add constraint devis_lignes_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id) ON DELETE SET NULL;
alter table public.email_connections
  add constraint email_connections_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.erreurs_automatisation
  add constraint erreurs_automatisation_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.factures
  add constraint factures_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.factures
  add constraint factures_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id);
alter table public.factures
  add constraint factures_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.factures
  add constraint factures_ordre_reparation_id_fkey FOREIGN KEY (ordre_reparation_id) REFERENCES ordres_reparation(id) ON DELETE SET NULL;
alter table public.factures
  add constraint factures_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id);
alter table public.factures
  add constraint factures_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table public.factures_jetons
  add constraint factures_jetons_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
alter table public.factures_jetons
  add constraint factures_jetons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.garages
  add constraint garages_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);
alter table public.garages_secrets
  add constraint garages_secrets_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections
  add constraint inspections_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.inspections
  add constraint inspections_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections
  add constraint inspections_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id) ON DELETE SET NULL;
alter table public.inspections
  add constraint inspections_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL;
alter table public.inspections_historique
  add constraint inspections_historique_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections_historique
  add constraint inspections_historique_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
alter table public.inspections_jetons
  add constraint inspections_jetons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections_jetons
  add constraint inspections_jetons_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
alter table public.inspections_photos
  add constraint inspections_photos_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections_photos
  add constraint inspections_photos_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
alter table public.inspections_photos
  add constraint inspections_photos_point_id_fkey FOREIGN KEY (point_id) REFERENCES inspections_points(id) ON DELETE CASCADE;
alter table public.inspections_points
  add constraint inspections_points_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.inspections_points
  add constraint inspections_points_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
alter table public.liste_attente
  add constraint liste_attente_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.liste_attente
  add constraint liste_attente_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.liste_attente
  add constraint liste_attente_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id);
alter table public.mecaniciens
  add constraint mecaniciens_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.notifications_atelier
  add constraint notifications_atelier_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id) ON DELETE CASCADE;
alter table public.notifications_devis
  add constraint notifications_devis_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE;
alter table public.notifications_factures
  add constraint notifications_factures_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
alter table public.notifications_proposition
  add constraint notifications_proposition_proposition_id_fkey FOREIGN KEY (proposition_id) REFERENCES propositions_rdv(id) ON DELETE CASCADE;
alter table public.opportunites_actions
  add constraint opportunites_actions_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.ordres_reparation
  add constraint ordres_reparation_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
alter table public.ordres_reparation
  add constraint ordres_reparation_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE SET NULL;
alter table public.ordres_reparation
  add constraint ordres_reparation_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE RESTRICT;
alter table public.ordres_reparation
  add constraint ordres_reparation_mecanicien_id_fkey FOREIGN KEY (mecanicien_id) REFERENCES mecaniciens(id) ON DELETE SET NULL;
alter table public.ordres_reparation
  add constraint ordres_reparation_rendez_vous_id_fkey FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id) ON DELETE RESTRICT;
alter table public.ordres_reparation
  add constraint ordres_reparation_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE RESTRICT;
alter table public.ordres_reparation_historique
  add constraint ordres_reparation_historique_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE RESTRICT;
alter table public.ordres_reparation_historique
  add constraint ordres_reparation_historique_ordre_reparation_id_fkey FOREIGN KEY (ordre_reparation_id) REFERENCES ordres_reparation(id) ON DELETE RESTRICT;
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE RESTRICT;
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_ordre_reparation_id_fkey FOREIGN KEY (ordre_reparation_id) REFERENCES ordres_reparation(id) ON DELETE CASCADE;
alter table public.ordres_reparation_lignes
  add constraint ordres_reparation_lignes_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id) ON DELETE SET NULL;
alter table public.propositions_rdv
  add constraint propositions_rdv_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.propositions_rdv
  add constraint propositions_rdv_demande_id_fkey FOREIGN KEY (demande_id) REFERENCES demandes(id);
alter table public.propositions_rdv
  add constraint propositions_rdv_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id);
alter table public.propositions_rdv
  add constraint propositions_rdv_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table public.rappels_manques
  add constraint rappels_manques_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.rendez_vous
  add constraint rendez_vous_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.rendez_vous
  add constraint rendez_vous_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
alter table public.rendez_vous
  add constraint rendez_vous_mecanicien_id_fkey FOREIGN KEY (mecanicien_id) REFERENCES mecaniciens(id) ON DELETE SET NULL;
alter table public.rendez_vous
  add constraint rendez_vous_prestation_id_fkey FOREIGN KEY (prestation_id) REFERENCES prestations(id);
alter table public.rendez_vous
  add constraint rendez_vous_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id);
alter table public.revenue_recovery_brouillons
  add constraint revenue_recovery_brouillons_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.revenue_recovery_brouillons
  add constraint revenue_recovery_brouillons_travail_differe_id_fkey FOREIGN KEY (travail_differe_id) REFERENCES travaux_differes(id) ON DELETE CASCADE;
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_brouillon_id_fkey FOREIGN KEY (brouillon_id) REFERENCES revenue_recovery_brouillons(id) ON DELETE SET NULL;
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_tentative_id_fkey FOREIGN KEY (tentative_id) REFERENCES revenue_recovery_tentatives(id) ON DELETE SET NULL;
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_travail_differe_id_fkey FOREIGN KEY (travail_differe_id) REFERENCES travaux_differes(id) ON DELETE SET NULL;
alter table public.revenue_recovery_garages_autorises
  add constraint revenue_recovery_garages_autorises_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_travail_differe_id_fkey FOREIGN KEY (travail_differe_id) REFERENCES travaux_differes(id) ON DELETE SET NULL;
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_brouillon_id_fkey FOREIGN KEY (brouillon_id) REFERENCES revenue_recovery_brouillons(id) ON DELETE SET NULL;
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_travail_differe_id_fkey FOREIGN KEY (travail_differe_id) REFERENCES travaux_differes(id) ON DELETE SET NULL;
alter table public.travaux_differes
  add constraint travaux_differes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.travaux_differes
  add constraint travaux_differes_devis_id_fkey FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE SET NULL;
alter table public.travaux_differes
  add constraint travaux_differes_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.travaux_differes
  add constraint travaux_differes_vehicule_id_fkey FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL;
alter table public.travaux_differes_historique
  add constraint travaux_differes_historique_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE;
alter table public.travaux_differes_historique
  add constraint travaux_differes_historique_travail_id_fkey FOREIGN KEY (travail_id) REFERENCES travaux_differes(id) ON DELETE CASCADE;
alter table public.vehicules
  add constraint vehicules_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.vehicules
  add constraint vehicules_garage_id_fkey FOREIGN KEY (garage_id) REFERENCES garages(id);
