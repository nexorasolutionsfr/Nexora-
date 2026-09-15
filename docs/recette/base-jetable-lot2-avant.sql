-- Base jetable, AVANT les migrations 20260920* : données synthétiques et
-- reproduction des deux défauts. Aucune donnée réelle.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c0de', 'jetable@nexora-recette.invalid');
insert into public.garages (id, nom_garage, email, telephone, owner_user_id, acces_motif)
values ('00000000-0000-4000-8000-0000000000a1', 'JETABLE', 'jetable@nexora-recette.invalid', '0100000000', '00000000-0000-4000-8000-00000000c0de', 'illimite');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c0d2', 'jetable2@nexora-recette.invalid');
insert into public.garages (id, nom_garage, email, telephone, owner_user_id, acces_motif)
values ('00000000-0000-4000-8000-0000000000a2', 'JETABLE AUTRE', 'jetable2@nexora-recette.invalid', '0100000001', '00000000-0000-4000-8000-00000000c0d2', 'illimite');

insert into public.clients (id, garage_id, nom, email) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Client Un', 'un@nexora-recette.invalid'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'Client Deux', 'deux@nexora-recette.invalid'),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000a2', 'Client Autre Garage', 'autre@nexora-recette.invalid');
insert into public.vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'Peugeot', '308', 'ZZ-001-ZZ'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'Peugeot', '208', 'ZZ-003-ZZ'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', 'Renault', 'Clio', 'ZZ-002-ZZ'),
  ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c9', 'Fiat', '500', 'ZZ-009-ZZ');

-- Deux visites terminées, chacune avec sa fiche atelier terminée.
insert into public.rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', now() - interval '2 days', now() - interval '2 days' + interval '1 hour'),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000e2', now() - interval '1 day', now() - interval '1 day' + interval '1 hour');
insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id) values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c2');
update public.ordres_reparation set statut = 'termine' where id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002');

-- Contrôles : un brouillon et un verrouillé, cohérents.
insert into public.inspections (id, garage_id, client_id, vehicule_id, statut) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'brouillon'),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'brouillon');
update public.inspections set verrouille_le = now() where id = '00000000-0000-4000-8000-00000000d002';

-- Défaut 2 AVANT : le véhicule d'un autre client est accepté, le client reste.
update public.inspections set vehicule_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-00000000d001';
select case when vehicule_id = '00000000-0000-4000-8000-0000000000e2' and client_id = '00000000-0000-4000-8000-0000000000c1'
            then 'REPRO contrôle : véhicule d''un autre client accepté, client d''origine conservé'
            else 'KO reproduction du contrôle incohérent' end
  from public.inspections where id = '00000000-0000-4000-8000-00000000d001';
-- On remet la ligne cohérente, comme sur Test.
update public.inspections set vehicule_id = '00000000-0000-4000-8000-0000000000e1' where id = '00000000-0000-4000-8000-00000000d001';
