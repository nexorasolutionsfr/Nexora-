-- Contrôles fonctionnels des sept migrations, sur une base jetable
-- construite à partir du schéma de la Production.
--
-- POURQUOI CE FICHIER
--
-- Comparer deux listes de migrations ne prouve rien : elle dit que les
-- fichiers sont là, pas qu'ils s'appliquent sur le schéma réel ni que ce
-- qu'ils promettent tient. Ce script se joue APRÈS les sept migrations, sur
-- une copie du schéma de Production, et vérifie les garanties une par une.
--
-- MODE D'EMPLOI (le conteneur est jetable, il ne sert qu'à ça)
--
--   supabase db dump --linked -f prod-schema.sql        # Production, LECTURE SEULE
--   docker run -d --name nexora-jetable -e POSTGRES_PASSWORD=jetable \
--     -p 55432:5432 public.ecr.aws/supabase/postgres:17.6.1.166
--   psql … -f prod-schema.sql
--   psql … -f supabase/migrations/20260918000*.sql      # dans l'ordre
--   psql … -f docs/recette/controles-base-jetable-2026-09-13.sql
--
-- Chaque contrôle écrit une ligne dans `resultats`. La dernière requête
-- affiche le tableau et le compte des échecs.

\set ON_ERROR_STOP off
set client_min_messages to warning;

create table if not exists resultats (
  n serial primary key, bloc text, controle text, attendu text, obtenu text, verdict text
);
truncate resultats restart identity;

create or replace function noter(p_bloc text, p_controle text, p_attendu text, p_obtenu text)
returns void language sql as $$
  insert into resultats (bloc, controle, attendu, obtenu, verdict)
  values (p_bloc, p_controle, p_attendu, p_obtenu,
          case when p_attendu = p_obtenu then 'OK' else 'ÉCHEC' end);
$$;

-- ================================================================
-- JEU D'ESSAI — deux garages, deux comptes, rien de réel
-- ================================================================

-- Le schéma de Production impose un garage par propriétaire
-- (`garages_owner_user_id_uniq`) : le garage B a donc le sien. Et un membre
-- « mecanicien » doit pointer une fiche mécanicien
-- (`garage_membres_mecanicien_coherent`). Le jeu d'essai respecte les deux
-- plutôt que de les contourner.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dirigeant@jetable.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'mecano@jetable.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'dirigeant.b@jetable.invalid')
on conflict do nothing;

insert into garages (id, nom_garage, owner_user_id, acces_motif, abonnement_actif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Garage A', '11111111-1111-1111-1111-111111111111', 'illimite', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Garage B', '33333333-3333-3333-3333-333333333333', 'illimite', true);

insert into mecaniciens (id, garage_id, nom, actif) values
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Karim', true);

insert into garage_membres (garage_id, user_id, role, mecanicien_id, actif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'mecanicien',
   '99999999-0000-0000-0000-000000000001', true);

insert into parametres_envois (cle, valeur) values ('url_publique', 'https://jetable.invalid')
on conflict (cle) do update set valeur = excluded.valeur;

-- Piège du schéma de Production : `vehicules.client_id` et `vehicules.garage_id`
-- ont pour défaut `gen_random_uuid()`. Un insert qui les omet échoue sur la
-- clé étrangère, avec un identifiant sorti de nulle part. On les donne donc
-- toujours explicitement.
insert into clients (id, garage_id, nom, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nadia Lemoine', 'nadia@jetable.invalid'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sans Adresse', null),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'Client du garage B', 'b@jetable.invalid');

-- ================================================================
-- A. UNE PLAQUE APPARTIENT À UN GARAGE, PAS À NEXORA
-- ================================================================

do $$
declare v_msg text; v_ok boolean;
begin
  -- A1 : la plaque s'enregistre dans le garage A
  begin
    insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation)
    values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001', 'Renault', 'Clio', 'AA-123-AA');
    perform noter('A. Plaques', 'La plaque s''enregistre dans le garage A', 'acceptée', 'acceptée');
  exception when others then
    perform noter('A. Plaques', 'La plaque s''enregistre dans le garage A', 'acceptée', 'refusée : ' || sqlerrm);
  end;

  -- A2 : LE CAS QUI MOTIVE LA MIGRATION — la même plaque dans un autre garage
  begin
    insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation)
    values ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
            'cccccccc-0000-0000-0000-000000000003', 'Renault', 'Clio', 'AA-123-AA');
    perform noter('A. Plaques', 'La même plaque dans un AUTRE garage', 'acceptée', 'acceptée');
  exception when others then
    perform noter('A. Plaques', 'La même plaque dans un AUTRE garage', 'acceptée', 'refusée : ' || sqlerrm);
  end;

  -- A3 : le doublon DANS le garage reste refusé, ponctuation comprise
  begin
    insert into vehicules (garage_id, client_id, marque, modele, immatriculation)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
            'Peugeot', '208', 'aa123aa');
    perform noter('A. Plaques', 'Le doublon dans le MÊME garage (ponctuation ignorée)', 'refusée', 'acceptée');
  exception when others then
    v_msg := sqlerrm;
    perform noter('A. Plaques', 'Le doublon dans le MÊME garage (ponctuation ignorée)', 'refusée', 'refusée');
    -- le message doit nommer la plaque DÉJÀ ENREGISTRÉE, pas celle qui vient d'être tapée
    perform noter('A. Plaques', 'Le refus nomme la plaque déjà enregistrée', 'AA-123-AA citée',
                  case when v_msg like '%AA-123-AA%' then 'AA-123-AA citée' else 'absente : ' || v_msg end);
  end;

  -- A4 : les véhicules sans plaque ne se gênent pas entre eux
  begin
    insert into vehicules (garage_id, client_id, marque, modele, immatriculation)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Citroën', 'C3', null),
           ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Citroën', 'C4', '');
    perform noter('A. Plaques', 'Deux véhicules sans plaque dans le même garage', 'acceptés', 'acceptés');
  exception when others then
    perform noter('A. Plaques', 'Deux véhicules sans plaque dans le même garage', 'acceptés', 'refusés : ' || sqlerrm);
  end;
end $$;

-- L'ancienne contrainte globale ne doit plus exister
select noter('A. Plaques', 'L''ancienne contrainte globale a disparu', 'absente',
  case when exists (select 1 from pg_constraint where conname = 'vehicules_immatriculation_unique')
       then 'toujours là' else 'absente' end);

-- ================================================================
-- B. MARQUER « PRÊT » N'ARME AUCUN ENVOI
-- ================================================================

insert into rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut_atelier)
values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        now(), now() + interval '1 hour', 'intervention');

update rendez_vous set statut_atelier = 'pret' where id = 'eeeeeeee-0000-0000-0000-000000000001';

select noter('B. « Prêt » n''envoie rien', 'La notification naît désarmée', 'sans_lien',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'aucune ligne'));

select noter('B. « Prêt » n''envoie rien', 'Aucun destinataire validé à la naissance', 'NULL',
  coalesce((select destinataire_valide from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'NULL'));

-- Le traitement n8n, tel qu'il appelle vraiment la file, ne doit rien trouver.
select noter('B. « Prêt » n''envoie rien', 'Le traitement ne réserve rien (file désarmée)', '0 ligne',
  (select count(*)::text || ' ligne' || case when count(*) > 1 then 's' else '' end
     from reserver_notifications('atelier', 10, array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[])));

-- Un aller-retour prêt → intervention → prêt n'empile pas une seconde ligne
update rendez_vous set statut_atelier = 'intervention' where id = 'eeeeeeee-0000-0000-0000-000000000001';
update rendez_vous set statut_atelier = 'pret' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select noter('B. « Prêt » n''envoie rien', 'Un aller-retour n''empile pas deux lignes', '1',
  (select count(*)::text from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'));

-- ================================================================
-- C. L'AUTORISATION EST LE SEUL CHEMIN, ET ELLE SE MÉFIE
-- ================================================================
--
-- À partir d'ici on se met dans la peau du dirigeant : `auth.uid()` renseigné,
-- rôle `authenticated`. C'est le chemin que prend l'écran.

set local role postgres;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

select noter('C. Autorisation', 'L''aperçu nomme le destinataire réel', 'nadia@jetable.invalid',
  coalesce(apercu_message_atelier('eeeeeeee-0000-0000-0000-000000000001')->>'destinataire', 'aucun'));

select noter('C. Autorisation', 'L''aperçu cite la plaque du véhicule', 'AA-123-AA citée',
  case when apercu_message_atelier('eeeeeeee-0000-0000-0000-000000000001')->>'texte' like '%AA-123-AA%'
       then 'AA-123-AA citée' else 'absente' end);

-- C1 : une adresse qui n'est pas celle d'aujourd'hui est refusée
select noter('C. Autorisation', 'Une autre adresse que celle affichée est refusée', 'destinataire_different',
  coalesce(autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001', 'quelquun.dautre@jetable.invalid')->>'raison', 'acceptée'));

-- C2 : l'adresse vue à l'écran arme la ligne
select noter('C. Autorisation', 'L''adresse affichée autorise l''envoi', 'true',
  coalesce(autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001', 'nadia@jetable.invalid')->>'ok', 'false'));

select noter('C. Autorisation', 'La ligne passe en attente d''envoi', 'en_attente',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'aucune'));

select noter('C. Autorisation', 'Le destinataire validé est enregistré', 'nadia@jetable.invalid',
  coalesce((select destinataire_valide from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'NULL'));

select noter('C. Autorisation', 'L''empreinte du message est enregistrée', 'présente',
  case when (select empreinte_document from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001') is not null
       then 'présente' else 'absente' end);

-- C3 : double clic — la deuxième confirmation ne réarme pas, elle retombe sur la même ligne
select noter('C. Autorisation', 'Le double clic ne crée pas un second envoi', 'true',
  coalesce(autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001', 'nadia@jetable.invalid')->>'deja_autorise', 'false'));

select noter('C. Autorisation', 'Toujours une seule ligne après double clic', '1',
  (select count(*)::text from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'));

-- C4 : l'état se lit, et il dit depuis quand
select noter('C. Autorisation', 'L''état lu par l''écran', 'en_attente_envoi',
  coalesce(etat_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001')->>'etat', 'illisible'));

select noter('C. Autorisation', 'L''état dit depuis quand (migration 700)', 'présent',
  case when etat_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001') ? 'depuis'
       then 'présent' else 'absent' end);

-- C5 : un client sans adresse ne déclenche pas un envoi dans le vide
reset role;
insert into rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut_atelier)
values ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000002', null, now(), now() + interval '1 hour', 'intervention');
update rendez_vous set statut_atelier = 'pret' where id = 'eeeeeeee-0000-0000-0000-000000000002';
set role authenticated;

select noter('C. Autorisation', 'Un client sans adresse : refus explicite', 'destinataire_absent',
  coalesce(autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000002', '')->>'raison', 'acceptée'));

-- C6 : une voiture qui n'est pas prête ne s'annonce pas prête
reset role;
insert into rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut_atelier)
values ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
        now(), now() + interval '1 hour', 'intervention');
set role authenticated;

select noter('C. Autorisation', 'Une voiture pas prête : refus explicite', 'vehicule_pas_pret',
  coalesce(autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000003', 'nadia@jetable.invalid')->>'raison', 'acceptée'));

-- C7 : LE MÉCANICIEN NOTE, IL N'ÉCRIT PAS AU CLIENT
set local role postgres;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $$
declare v_obtenu text;
begin
  begin
    perform autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000001', 'nadia@jetable.invalid');
    v_obtenu := 'autorisé';
  exception when insufficient_privilege then v_obtenu := 'accès refusé';
            when others then v_obtenu := 'refusé : ' || sqlerrm;
  end;
  perform noter('C. Autorisation', 'Le mécanicien ne peut pas autoriser un envoi', 'accès refusé', v_obtenu);
end $$;

set local role postgres;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ================================================================
-- D. CE QUI A ÉTÉ VALIDÉ NE PART PAS SI QUELQUE CHOSE A CHANGÉ
-- ================================================================
--
-- Trois divergences, trois motifs distincts. Dans les trois cas la ligne est
-- mise de côté, et ce que le garage avait validé — destinataire et empreinte —
-- reste lisible : c'est la preuve sur laquelle portera la revalidation.

reset role;

insert into clients (id, garage_id, nom, email) values
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Message Change', 'message@jetable.invalid'),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Adresse Change', 'avant@jetable.invalid'),
  ('cccccccc-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Plus Prete', 'plus.prete@jetable.invalid');

insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000004', 'Ford', 'Fiesta', 'BB-004-BB'),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000005', 'Ford', 'Focus',  'BB-005-BB'),
  ('dddddddd-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000006', 'Ford', 'Kuga',   'BB-006-BB');

insert into rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut_atelier) values
  ('eeeeeeee-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004', now(), now() + interval '1 hour', 'intervention'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000005', now(), now() + interval '1 hour', 'intervention'),
  ('eeeeeeee-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000006', now(), now() + interval '1 hour', 'intervention');

update rendez_vous set statut_atelier = 'pret'
 where id in ('eeeeeeee-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000006');

set role authenticated;
select autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000004', 'message@jetable.invalid');
select autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000005', 'avant@jetable.invalid');
select autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000006', 'plus.prete@jetable.invalid');
reset role;

-- On garde une trace de ce qui a été validé, pour vérifier après coup qu'on
-- ne l'a pas réécrit.
create temporary table valide_avant as
  select rendez_vous_id, destinataire_valide, empreinte_document
    from notifications_atelier
   where rendez_vous_id in ('eeeeeeee-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000006');

-- Les trois divergences
update vehicules set modele = 'Fiesta ST' where id = 'dddddddd-0000-0000-0000-000000000004';   -- le message change
update clients  set email  = 'apres@jetable.invalid' where id = 'cccccccc-0000-0000-0000-000000000005'; -- le destinataire change
update rendez_vous set statut_atelier = 'intervention' where id = 'eeeeeeee-0000-0000-0000-000000000006'; -- la voiture n'est plus prête

-- Le traitement passe. C'est lui qui met de côté.
set role service_role;
create temporary table reserve as
  select * from reserver_notifications('atelier', 10, array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
reset role;

select noter('D. Divergence', 'Message changé : mis de côté', 'bloque',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000004'), 'aucune'));
select noter('D. Divergence', 'Message changé : le motif le dit', 'le message a changé depuis la validation : nouvelle validation nécessaire',
  coalesce((select derniere_erreur from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000004'), 'aucun'));

select noter('D. Divergence', 'Destinataire changé : mis de côté', 'bloque',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000005'), 'aucune'));
select noter('D. Divergence', 'Destinataire changé : le motif le dit', 'le destinataire a changé depuis la validation : nouvelle validation nécessaire',
  coalesce((select derniere_erreur from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000005'), 'aucun'));

select noter('D. Divergence', 'Voiture plus prête : mise de côté', 'bloque',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'), 'aucune'));
select noter('D. Divergence', 'Voiture plus prête : le motif le dit', 'le véhicule n''est plus noté prêt : nouvelle validation nécessaire',
  coalesce((select derniere_erreur from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'), 'aucun'));

-- AUCUNE DES TROIS N'A ÉTÉ EXPÉDIÉE
select noter('D. Divergence', 'Aucune des trois n''a été réservée', 'aucune',
  case when exists (select 1 from reserve r where r.doc_id in
         ('eeeeeeee-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000006'))
       then 'au moins une' else 'aucune' end);

-- CE QUI AVAIT ÉTÉ VALIDÉ N'A PAS ÉTÉ RÉÉCRIT
select noter('D. Divergence', 'Le destinataire validé n''est pas écrasé', 'intact',
  case when exists (
    select 1 from valide_avant a join notifications_atelier n using (rendez_vous_id)
     where a.destinataire_valide is distinct from n.destinataire_valide)
  then 'réécrit' else 'intact' end);
select noter('D. Divergence', 'L''empreinte validée n''est pas écrasée', 'intacte',
  case when exists (
    select 1 from valide_avant a join notifications_atelier n using (rendez_vous_id)
     where a.empreinte_document is distinct from n.empreinte_document)
  then 'réécrite' else 'intacte' end);

-- La ligne restée conforme, elle, part normalement.
select noter('D. Divergence', 'La ligne inchangée est bien réservée', 'envoi_en_cours',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'), 'aucune'));

-- ================================================================
-- E. RIEN NE SE REMET EN FILE TOUT SEUL
-- ================================================================

set role service_role;
create temporary table reserve2 as
  select * from reserver_notifications('atelier', 10, array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
reset role;

select noter('E. Pas de reprise', 'Un second passage ne reprend aucune ligne mise de côté', '0',
  (select count(*)::text from reserve2));

select noter('E. Pas de reprise', 'Les trois lignes restent de côté', '3',
  (select count(*)::text from notifications_atelier where statut = 'bloque'));

select noter('E. Pas de reprise', 'Un envoi en cours n''est jamais rejoué', '1 tentative',
  (select tentatives::text || ' tentative' from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000001'));

-- Une voiture qui redevient prête ne réveille pas la ligne mise de côté :
-- elle attend une revalidation à la main, et n'en ouvre pas une seconde.
update rendez_vous set statut_atelier = 'pret' where id = 'eeeeeeee-0000-0000-0000-000000000006';
select noter('E. Pas de reprise', 'Redevenir prête ne réarme pas la ligne bloquée', 'bloque',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'), 'aucune'));
select noter('E. Pas de reprise', 'Redevenir prête n''ouvre pas une seconde ligne', '1',
  (select count(*)::text from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'));

-- La revalidation à la main, elle, refait partir la ligne bloquée — et une
-- seule : c'est le geste que l'écran propose après avoir montré le motif.
set role authenticated;
select autoriser_envoi_atelier('eeeeeeee-0000-0000-0000-000000000006', 'plus.prete@jetable.invalid');
reset role;
select noter('E. Pas de reprise', 'La revalidation à la main réarme la ligne bloquée', 'en_attente',
  coalesce((select statut from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'), 'aucune'));
select noter('E. Pas de reprise', 'La revalidation ne duplique pas la ligne', '1',
  (select count(*)::text from notifications_atelier where rendez_vous_id = 'eeeeeeee-0000-0000-0000-000000000006'));

-- ================================================================
-- F. QUI A LE DROIT D'APPELER QUOI
-- ================================================================
--
-- La migration 600 REMPLACE `reserver_notifications`. Le risque est qu'un
-- remplacement rouvre la fonction : elle est SECURITY DEFINER, et un compte
-- connecté — ou la clé publique du site — pourrait alors consommer les files
-- de TOUS les garages. `create or replace` conserve les droits ; ce contrôle
-- le vérifie plutôt que de le supposer.
--
-- Il suppose que la copie a été ramenée à l'état de droits que la Production
-- déclare (étape 4 de base-jetable-2026-09-13.sh). Le dump ne réplique pas les
-- révocations par rôle : sans cette étape, ce contrôle mesure l'image, pas la
-- Production.

select noter('F. Droits', 'Un compte connecté ne peut pas réserver la file', 'refusé',
  case when has_function_privilege('authenticated', 'public.reserver_notifications(text,integer,uuid[])', 'execute')
       then 'autorisé' else 'refusé' end);
select noter('F. Droits', 'Le traitement (service_role) peut réserver la file', 'autorisé',
  case when has_function_privilege('service_role', 'public.reserver_notifications(text,integer,uuid[])', 'execute')
       then 'autorisé' else 'refusé' end);
select noter('F. Droits', 'Un compte connecté peut autoriser un envoi', 'autorisé',
  case when has_function_privilege('authenticated', 'public.autoriser_envoi_atelier(uuid,text)', 'execute')
       then 'autorisé' else 'refusé' end);
select noter('F. Droits', 'Le public ne peut pas autoriser un envoi', 'refusé',
  case when has_function_privilege('anon', 'public.autoriser_envoi_atelier(uuid,text)', 'execute')
       then 'autorisé' else 'refusé' end);

-- ================================================================
-- RÉSULTAT
-- ================================================================

\echo ''
select bloc, controle, attendu, obtenu, verdict from resultats order by n;
\echo ''
select count(*) filter (where verdict = 'OK') as reussis,
       count(*) filter (where verdict = 'ÉCHEC') as echecs,
       count(*) as total
  from resultats;
