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

alter table public.actions_ia enable row level security;
alter table public.atelier_jetons enable row level security;
alter table public.clients enable row level security;
alter table public.confirmations_jetons enable row level security;
alter table public.confirmations_rappels_file enable row level security;
alter table public.demandes enable row level security;
alter table public.devis enable row level security;
alter table public.devis_jetons enable row level security;
alter table public.devis_lignes enable row level security;
alter table public.email_connections enable row level security;
alter table public.erreurs_automatisation enable row level security;
alter table public.factures enable row level security;
alter table public.factures_jetons enable row level security;
alter table public.garages enable row level security;
alter table public.garages_secrets enable row level security;
alter table public.horaires_garage enable row level security;
alter table public.inspections enable row level security;
alter table public.inspections_historique enable row level security;
alter table public.inspections_jetons enable row level security;
alter table public.inspections_photos enable row level security;
alter table public.inspections_points enable row level security;
alter table public.liste_attente enable row level security;
alter table public.mecaniciens enable row level security;
alter table public.notifications_atelier enable row level security;
alter table public.notifications_devis enable row level security;
alter table public.notifications_factures enable row level security;
alter table public.notifications_proposition enable row level security;
alter table public.opportunites_actions enable row level security;
alter table public.ordres_reparation enable row level security;
alter table public.ordres_reparation_historique enable row level security;
alter table public.ordres_reparation_lignes enable row level security;
alter table public.prestations enable row level security;
alter table public.propositions_rdv enable row level security;
alter table public.rappels_manques enable row level security;
alter table public.rendez_vous enable row level security;
alter table public.revenue_recovery_brouillons enable row level security;
alter table public.revenue_recovery_evenements enable row level security;
alter table public.revenue_recovery_garages_autorises enable row level security;
alter table public.revenue_recovery_permissions enable row level security;
alter table public.revenue_recovery_tentatives enable row level security;
alter table public.travaux_differes enable row level security;
alter table public.travaux_differes_historique enable row level security;
alter table public.vehicules enable row level security;

create policy actions_ia_scope on public.actions_ia
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy clients_scope on public.clients
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy n8n_read_clients on public.clients
  as permissive
  for select
  to service_role
  using (true);

create policy demandes_scope on public.demandes
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy devis_scope on public.devis
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy devis_lignes_isolation on public.devis_lignes
  as permissive
  for all
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy "Lecture erreurs du garage proprietaire" on public.erreurs_automatisation
  as permissive
  for select
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy factures_scope on public.factures
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy garages_self_select on public.garages
  as permissive
  for select
  to public
  using ((owner_user_id = auth.uid()));

create policy garages_self_update on public.garages
  as permissive
  for update
  to public
  using ((owner_user_id = auth.uid()));

create policy n8n_read_horaires_garage on public.horaires_garage
  as permissive
  for select
  to service_role
  using (true);

create policy inspections_isolation on public.inspections
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy inspections_historique_isolation on public.inspections_historique
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy inspections_photos_isolation on public.inspections_photos
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy inspections_points_isolation on public.inspections_points
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy liste_attente_scope on public.liste_attente
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy mecaniciens_delete on public.mecaniciens
  as permissive
  for delete
  to authenticated
  using ((garage_id = current_garage_id()));

create policy mecaniciens_insert on public.mecaniciens
  as permissive
  for insert
  to authenticated
  with check ((garage_id = current_garage_id()));

create policy mecaniciens_select on public.mecaniciens
  as permissive
  for select
  to authenticated
  using ((garage_id = current_garage_id()));

create policy mecaniciens_update on public.mecaniciens
  as permissive
  for update
  to authenticated
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy notifications_atelier_scope on public.notifications_atelier
  as permissive
  for all
  to authenticated
  using ((rendez_vous_id IN ( SELECT rendez_vous.id
   FROM rendez_vous
  WHERE (rendez_vous.garage_id = current_garage_id()))))
  with check ((rendez_vous_id IN ( SELECT rendez_vous.id
   FROM rendez_vous
  WHERE (rendez_vous.garage_id = current_garage_id()))));

create policy opportunites_actions_isolation on public.opportunites_actions
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy ordres_reparation_insert on public.ordres_reparation
  as permissive
  for insert
  to authenticated
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy ordres_reparation_select on public.ordres_reparation
  as permissive
  for select
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy ordres_reparation_update on public.ordres_reparation
  as permissive
  for update
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy ordres_reparation_historique_select on public.ordres_reparation_historique
  as permissive
  for select
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy ordres_reparation_lignes_isolation on public.ordres_reparation_lignes
  as permissive
  for all
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy n8n_read_prestations on public.prestations
  as permissive
  for select
  to service_role
  using (true);

create policy prestations_scope on public.prestations
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy n8n_insert_propositions_rdv on public.propositions_rdv
  as permissive
  for insert
  to service_role
  with check (true);

create policy n8n_read_propositions_rdv on public.propositions_rdv
  as permissive
  for select
  to service_role
  using (true);

create policy n8n_update_propositions_rdv on public.propositions_rdv
  as permissive
  for update
  to service_role
  using (true)
  with check (true);

create policy propositions_rdv_scope on public.propositions_rdv
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy "Acces rappels du garage proprietaire" on public.rappels_manques
  as permissive
  for all
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy n8n_read_rendez_vous on public.rendez_vous
  as permissive
  for select
  to service_role
  using (true);

create policy n8n_write_rendez_vous on public.rendez_vous
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy rendez_vous_scope on public.rendez_vous
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));

create policy revenue_recovery_brouillons_isolation on public.revenue_recovery_brouillons
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy revenue_recovery_evenements_isolation on public.revenue_recovery_evenements
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy revenue_recovery_garages_autorises_lecture on public.revenue_recovery_garages_autorises
  as permissive
  for select
  to authenticated
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy revenue_recovery_permissions_isolation on public.revenue_recovery_permissions
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy revenue_recovery_tentatives_isolation on public.revenue_recovery_tentatives
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy travaux_differes_isolation on public.travaux_differes
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy travaux_differes_historique_isolation on public.travaux_differes_historique
  as permissive
  for all
  to public
  using ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))))
  with check ((garage_id IN ( SELECT garages.id
   FROM garages
  WHERE (garages.owner_user_id = auth.uid()))));

create policy vehicules_scope on public.vehicules
  as permissive
  for all
  to public
  using ((garage_id = current_garage_id()))
  with check ((garage_id = current_garage_id()));
