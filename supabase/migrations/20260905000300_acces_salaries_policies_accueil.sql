-- Accès salariés V1 — 3/6 : les droits du rôle « accueil ».
--
-- Ces policies sont strictement ADDITIVES. Postgres combine plusieurs
-- policies permissives par OU : aucune des policies existantes n'est
-- modifiée ni supprimée, et le propriétaire comme le dirigeant continuent
-- de passer par `current_garage_id()` exactement comme avant.
--
-- Périmètre de l'accueil, repris du contrat (section B.3) : clients,
-- véhicules, rendez-vous, demandes, devis, contrôle véhicule, ordres de
-- réparation et suivi opérationnel. En lecture seule : le catalogue de
-- prestations et la liste des mécaniciens, nécessaires pour remplir un
-- devis et affecter un ordre de réparation.
--
-- Volontairement ABSENTES de cette migration, donc refusées : `factures`,
-- `garages`, `garages_secrets`, `email_connections`,
-- `erreurs_automatisation`, `opportunites_actions`, `revenue_recovery_*`,
-- `garage_membres`. Facturation, réglages, statistiques, cockpit et
-- gestion des accès restent au seul dirigeant.
--
-- Voir docs/architecture/acces-salaries-v1.md, section B.3.

-- --- Dossier client et activité courante -----------------------------------

create policy clients_accueil on public.clients
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy vehicules_accueil on public.vehicules
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy rendez_vous_accueil on public.rendez_vous
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy demandes_accueil on public.demandes
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy propositions_rdv_accueil on public.propositions_rdv
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy liste_attente_accueil on public.liste_attente
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- --- Devis ------------------------------------------------------------------

create policy devis_accueil on public.devis
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy devis_lignes_accueil on public.devis_lignes
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- --- Contrôle véhicule ------------------------------------------------------

create policy inspections_accueil on public.inspections
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy inspections_points_accueil on public.inspections_points
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy inspections_photos_accueil on public.inspections_photos
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy inspections_historique_accueil on public.inspections_historique
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- --- Ordres de réparation ---------------------------------------------------

create policy ordres_reparation_accueil_select on public.ordres_reparation
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

create policy ordres_reparation_accueil_insert on public.ordres_reparation
  for insert to authenticated
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy ordres_reparation_accueil_update on public.ordres_reparation
  for update to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy ordres_reparation_lignes_accueil on public.ordres_reparation_lignes
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- Le journal reste en lecture seule pour tout le monde : il n'est écrit que
-- par le trigger ordres_reparation_log_historique.
create policy ordres_reparation_historique_accueil_select
  on public.ordres_reparation_historique
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

-- --- Suivi opérationnel -----------------------------------------------------

create policy travaux_differes_accueil on public.travaux_differes
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy travaux_differes_historique_accueil on public.travaux_differes_historique
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

create policy rappels_manques_accueil on public.rappels_manques
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- `notifications_atelier` n'a pas de colonne garage_id : sa policy
-- historique passe par le rendez-vous. On reprend exactement la même forme.
create policy notifications_atelier_accueil on public.notifications_atelier
  for all to authenticated
  using (
    rendez_vous_id in (
      select rv.id from public.rendez_vous rv
      where public.a_acces_garage(rv.garage_id, 'accueil')
    )
  )
  with check (
    rendez_vous_id in (
      select rv.id from public.rendez_vous rv
      where public.a_acces_garage(rv.garage_id, 'accueil')
    )
  );

-- --- Lectures nécessaires au travail de l'accueil ---------------------------

create policy prestations_accueil_select on public.prestations
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

create policy mecaniciens_accueil_select on public.mecaniciens
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

create policy actions_ia_accueil_select on public.actions_ia
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));
