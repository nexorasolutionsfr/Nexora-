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

create unique index if not exists atelier_jetons_actif_unique ON public.atelier_jetons USING btree (rendez_vous_id) WHERE (revoked_at IS NULL);
create index if not exists atelier_jetons_rendez_vous_idx ON public.atelier_jetons USING btree (rendez_vous_id);
create unique index if not exists devis_jetons_actif_unique ON public.devis_jetons USING btree (devis_id) WHERE (revoked_at IS NULL);
create index if not exists devis_jetons_devis_idx ON public.devis_jetons USING btree (devis_id);
create index if not exists devis_lignes_devis_idx ON public.devis_lignes USING btree (devis_id);
create index if not exists devis_lignes_garage_idx ON public.devis_lignes USING btree (garage_id);
create index if not exists devis_lignes_position_idx ON public.devis_lignes USING btree (devis_id, "position");
create index if not exists factures_ordre_reparation_idx ON public.factures USING btree (ordre_reparation_id);
create unique index if not exists factures_jetons_actif_unique ON public.factures_jetons USING btree (facture_id) WHERE (revoked_at IS NULL);
create index if not exists factures_jetons_facture_idx ON public.factures_jetons USING btree (facture_id);
create unique index if not exists garages_owner_user_id_uniq ON public.garages USING btree (owner_user_id);
create index if not exists inspections_client_idx ON public.inspections USING btree (client_id);
create index if not exists inspections_garage_statut_idx ON public.inspections USING btree (garage_id, statut, created_at);
create index if not exists inspections_historique_inspection_idx ON public.inspections_historique USING btree (inspection_id, created_at);
create index if not exists inspections_jetons_inspection_idx ON public.inspections_jetons USING btree (inspection_id);
create index if not exists inspections_photos_inspection_idx ON public.inspections_photos USING btree (inspection_id);
create index if not exists inspections_points_inspection_idx ON public.inspections_points USING btree (inspection_id);
create index if not exists notifications_devis_statut_traitement_idx ON public.notifications_devis USING btree (statut_traitement);
create index if not exists opportunites_actions_source_idx ON public.opportunites_actions USING btree (garage_id, source_type, source_id, created_at DESC);
create index if not exists ordres_reparation_devis_idx ON public.ordres_reparation USING btree (devis_id);
create index if not exists ordres_reparation_garage_idx ON public.ordres_reparation USING btree (garage_id);
create index if not exists ordres_reparation_mecanicien_idx ON public.ordres_reparation USING btree (mecanicien_id);
create index if not exists ordres_reparation_historique_garage_idx ON public.ordres_reparation_historique USING btree (garage_id);
create index if not exists ordres_reparation_historique_ordre_idx ON public.ordres_reparation_historique USING btree (ordre_reparation_id, created_at);
create index if not exists ordres_reparation_lignes_garage_idx ON public.ordres_reparation_lignes USING btree (garage_id);
create index if not exists ordres_reparation_lignes_ordre_idx ON public.ordres_reparation_lignes USING btree (ordre_reparation_id);
create unique index if not exists revenue_recovery_brouillons_actif_unique ON public.revenue_recovery_brouillons USING btree (travail_differe_id) WHERE (statut = 'brouillon'::text);
create index if not exists revenue_recovery_evenements_travail_idx ON public.revenue_recovery_evenements USING btree (garage_id, travail_differe_id, created_at);
create index if not exists revenue_recovery_permissions_lookup_idx ON public.revenue_recovery_permissions USING btree (garage_id, client_id, canal, created_at DESC);
create unique index if not exists revenue_recovery_tentatives_actif_unique ON public.revenue_recovery_tentatives USING btree (travail_differe_id) WHERE (statut = ANY (ARRAY['en_preparation'::text, 'envoyee'::text]));
create unique index if not exists revenue_recovery_tentatives_cle_idempotence_unique ON public.revenue_recovery_tentatives USING btree (garage_id, cle_idempotence);
create index if not exists travaux_differes_client_idx ON public.travaux_differes USING btree (client_id);
create index if not exists travaux_differes_garage_statut_idx ON public.travaux_differes USING btree (garage_id, statut, date_relance);
create index if not exists travaux_differes_historique_travail_idx ON public.travaux_differes_historique USING btree (travail_id, created_at);
