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

CREATE TRIGGER devis_check_immuabilite_trigger BEFORE DELETE OR UPDATE ON public.devis FOR EACH ROW EXECUTE FUNCTION devis_check_immuabilite();
CREATE TRIGGER trg_notifier_devis_maj AFTER UPDATE ON public.devis FOR EACH ROW EXECUTE FUNCTION notifier_devis_maj();
CREATE TRIGGER trg_notifier_nouveau_devis AFTER INSERT ON public.devis FOR EACH ROW EXECUTE FUNCTION notifier_nouveau_devis();
CREATE TRIGGER devis_lignes_check_integrite_trigger BEFORE INSERT OR DELETE OR UPDATE ON public.devis_lignes FOR EACH ROW EXECUTE FUNCTION devis_lignes_check_integrite();
CREATE TRIGGER devis_lignes_recalculer_totaux_trigger AFTER INSERT OR DELETE OR UPDATE ON public.devis_lignes FOR EACH ROW EXECUTE FUNCTION devis_lignes_recalculer_totaux();
CREATE TRIGGER devis_lignes_updated_at BEFORE UPDATE ON public.devis_lignes FOR EACH ROW EXECUTE FUNCTION devis_lignes_set_updated_at();
CREATE TRIGGER factures_check_immuabilite_trigger BEFORE UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION factures_check_immuabilite();
CREATE TRIGGER factures_check_integrite_trigger BEFORE INSERT OR UPDATE OF ordre_reparation_id, garage_id, rendez_vous_id ON public.factures FOR EACH ROW EXECUTE FUNCTION factures_check_integrite();
CREATE TRIGGER trg_assigner_numero_facture BEFORE INSERT ON public.factures FOR EACH ROW EXECUTE FUNCTION assigner_numero_facture();
CREATE TRIGGER trg_notifier_facture_payee AFTER UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION notifier_facture_payee();
CREATE TRIGGER trg_notifier_nouvelle_facture AFTER INSERT ON public.factures FOR EACH ROW EXECUTE FUNCTION notifier_nouvelle_facture();
CREATE TRIGGER inspections_historique_trigger AFTER UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION inspections_log_historique();
CREATE TRIGGER inspections_updated_at BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION inspections_set_updated_at();
CREATE TRIGGER inspections_verrou_contenu BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION inspections_bloquer_contenu_si_verrouillee();
CREATE TRIGGER inspections_photos_verrou BEFORE INSERT OR DELETE OR UPDATE ON public.inspections_photos FOR EACH ROW EXECUTE FUNCTION inspections_photos_bloquer_si_verrouillee();
CREATE TRIGGER inspections_points_updated_at BEFORE UPDATE ON public.inspections_points FOR EACH ROW EXECUTE FUNCTION inspections_set_updated_at();
CREATE TRIGGER inspections_points_verrou BEFORE INSERT OR DELETE OR UPDATE ON public.inspections_points FOR EACH ROW EXECUTE FUNCTION inspections_points_bloquer_si_verrouillee();
CREATE TRIGGER opportunites_actions_avant_insert BEFORE INSERT ON public.opportunites_actions FOR EACH ROW EXECUTE FUNCTION opportunites_actions_forcer_identite();
CREATE TRIGGER ordres_reparation_check_integrite_trigger BEFORE INSERT OR UPDATE ON public.ordres_reparation FOR EACH ROW EXECUTE FUNCTION ordres_reparation_check_integrite();
CREATE TRIGGER ordres_reparation_log_historique_trigger AFTER INSERT OR UPDATE ON public.ordres_reparation FOR EACH ROW EXECUTE FUNCTION ordres_reparation_log_historique();
CREATE TRIGGER ordres_reparation_updated_at BEFORE UPDATE ON public.ordres_reparation FOR EACH ROW EXECUTE FUNCTION ordres_reparation_set_updated_at();
CREATE TRIGGER ordres_reparation_lignes_check_integrite_trigger BEFORE INSERT OR UPDATE ON public.ordres_reparation_lignes FOR EACH ROW EXECUTE FUNCTION ordres_reparation_lignes_check_integrite();
CREATE TRIGGER ordres_reparation_lignes_updated_at BEFORE UPDATE ON public.ordres_reparation_lignes FOR EACH ROW EXECUTE FUNCTION ordres_reparation_set_updated_at();
CREATE TRIGGER trg_notifier_proposition_maj AFTER UPDATE ON public.propositions_rdv FOR EACH ROW EXECUTE FUNCTION notifier_proposition_maj();
CREATE TRIGGER trg_notifier_vehicule_pret AFTER UPDATE OF statut_atelier ON public.rendez_vous FOR EACH ROW EXECUTE FUNCTION notifier_vehicule_pret();
CREATE TRIGGER revenue_recovery_brouillons_avant_insert BEFORE INSERT ON public.revenue_recovery_brouillons FOR EACH ROW EXECUTE FUNCTION revenue_recovery_brouillons_identite_insert();
CREATE TRIGGER revenue_recovery_brouillons_avant_update BEFORE UPDATE ON public.revenue_recovery_brouillons FOR EACH ROW EXECUTE FUNCTION revenue_recovery_brouillons_verrouiller();
CREATE TRIGGER revenue_recovery_evenements_avant_insert BEFORE INSERT ON public.revenue_recovery_evenements FOR EACH ROW EXECUTE FUNCTION revenue_recovery_evenements_forcer_identite();
CREATE TRIGGER revenue_recovery_garages_autorises_updated_at BEFORE UPDATE ON public.revenue_recovery_garages_autorises FOR EACH ROW EXECUTE FUNCTION revenue_recovery_garages_autorises_set_updated_at();
CREATE TRIGGER revenue_recovery_permissions_avant_insert BEFORE INSERT ON public.revenue_recovery_permissions FOR EACH ROW EXECUTE FUNCTION revenue_recovery_permissions_forcer_identite();
CREATE TRIGGER revenue_recovery_tentatives_avant_insert BEFORE INSERT ON public.revenue_recovery_tentatives FOR EACH ROW EXECUTE FUNCTION revenue_recovery_tentatives_forcer_identite();
CREATE TRIGGER travaux_differes_historique_trigger AFTER UPDATE ON public.travaux_differes FOR EACH ROW EXECUTE FUNCTION travaux_differes_log_historique();
CREATE TRIGGER travaux_differes_updated_at BEFORE UPDATE ON public.travaux_differes FOR EACH ROW EXECUTE FUNCTION travaux_differes_set_updated_at();
