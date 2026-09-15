-- Contrôles des migrations 20260919000100 → 000400, sur la base jetable
-- construite depuis le schéma de Production. Chaque ligne affichée commence
-- par OK ou KO. Joués en supabase_admin : on mesure la structure, les droits
-- et la mécanique sans session ; le comportement par rôle est prouvé sur Test
-- par les scripts scripts/recette/*-serveur.mjs.

\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'devis.rendez_vous_id existe'
  from information_schema.columns where table_schema='public' and table_name='devis' and column_name='rendez_vous_id';
select case when count(*) = 4 then 'OK ' else 'KO ' end || 'devis_lignes : 4 colonnes de provenance/état (constat)'
  from information_schema.columns where table_schema='public' and table_name='devis_lignes'
   and column_name in ('inspection_point_id','reprise_id','note_constat','prix_a_renseigner');
select case when count(*) = 2 then 'OK ' else 'KO ' end || 'devis_lignes : 2 colonnes de provenance (modèle)'
  from information_schema.columns where table_schema='public' and table_name='devis_lignes'
   and column_name in ('modele_id','insertion_id');
select case when count(*) = 5 then 'OK ' else 'KO ' end || 'tables nouvelles présentes (5)'
  from pg_tables where schemaname='public'
   and tablename in ('devis_reprises','modeles_travaux','modeles_travaux_lignes','devis_insertions_modeles','relances_travaux');
select case when bool_and(c.relrowsecurity) then 'OK ' else 'KO ' end || 'RLS activée sur les 5 tables nouvelles'
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('devis_reprises','modeles_travaux','modeles_travaux_lignes','devis_insertions_modeles','relances_travaux');
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'opportunites_actions_isolation (propriétaire seul) retirée'
  from pg_policies where schemaname='public' and tablename='opportunites_actions' and policyname='opportunites_actions_isolation';
select case when count(*) = 2 then 'OK ' else 'KO ' end || 'opportunites_actions : politiques équipe select + insert'
  from pg_policies where schemaname='public' and tablename='opportunites_actions' and policyname like 'opportunites_actions_equipe_%';

-- ---------------------------------------------------------------
-- 2. Droits d'exécution (l'image, comme Supabase hébergé, accorde par défaut
--    l'exécution à anon et authenticated sur toute fonction créée)
-- ---------------------------------------------------------------
with f(nom, sig) as (values
  ('preparer_devis_depuis_constat', 'uuid, uuid, uuid[], uuid, uuid'),
  ('inserer_modele_dans_devis', 'uuid, uuid, uuid, uuid'),
  ('enregistrer_devis_comme_modele', 'uuid, text'),
  ('modifier_relance_travail', 'uuid, text, text'),
  ('autoriser_envoi_relance_travail', 'uuid, text'),
  ('annuler_relance_travail', 'uuid, text'),
  ('preparer_relances_travaux', 'uuid[], date, uuid[]'),
  ('reserver_relances_travaux', 'integer, uuid[], uuid[]'),
  ('terminer_relance_travail', 'uuid, text, text'),
  ('devis_chiffrage_incomplet', 'uuid'),
  ('composer_relance_travail', 'uuid'),
  ('empreinte_relance_travail', 'uuid'))
select case when has_function_privilege('anon', format('public.%s(%s)', nom, sig), 'execute') then 'KO ' else 'OK ' end
       || 'anon ne peut pas exécuter ' || nom
  from f;

with f(nom, sig) as (values
  ('preparer_relances_travaux', 'uuid[], date, uuid[]'),
  ('reserver_relances_travaux', 'integer, uuid[], uuid[]'),
  ('terminer_relance_travail', 'uuid, text, text'),
  ('devis_chiffrage_incomplet', 'uuid'),
  ('composer_relance_travail', 'uuid'),
  ('empreinte_relance_travail', 'uuid'))
select case when has_function_privilege('authenticated', format('public.%s(%s)', nom, sig), 'execute') then 'KO ' else 'OK ' end
       || 'authenticated ne peut pas exécuter ' || nom || ' (réservée au service)'
  from f;

with f(nom, sig) as (values
  ('preparer_devis_depuis_constat', 'uuid, uuid, uuid[], uuid, uuid'),
  ('inserer_modele_dans_devis', 'uuid, uuid, uuid, uuid'),
  ('enregistrer_devis_comme_modele', 'uuid, text'),
  ('autoriser_envoi_relance_travail', 'uuid, text'))
select case when has_function_privilege('authenticated', format('public.%s(%s)', nom, sig), 'execute') then 'OK ' else 'KO ' end
       || 'authenticated peut exécuter ' || nom
  from f;

select case when has_function_privilege('service_role', 'public.reserver_relances_travaux(integer, uuid[], uuid[])', 'execute')
             and has_function_privilege('service_role', 'public.preparer_relances_travaux(uuid[], date, uuid[])', 'execute')
       then 'OK ' else 'KO ' end || 'service_role exécute préparation et réservation des relances';

select case when has_table_privilege('anon', 'public.relances_travaux', 'select') then 'KO ' else 'OK ' end || 'anon ne lit pas relances_travaux';

-- Les tables écrites UNIQUEMENT par fonction : aucun privilège d'écriture
-- directe pour `authenticated` (la RLS le refuserait aussi ; on ne s'en
-- remet pas à une seule barrière). Trouvé par ce contrôle, fermé par
-- 20260919000500.
with t(nom) as (values ('devis_reprises'), ('devis_insertions_modeles'), ('relances_travaux')),
     p(droit) as (values ('insert'), ('update'), ('delete'))
select case when has_table_privilege('authenticated', format('public.%s', t.nom), p.droit) then 'KO ' else 'OK ' end
       || 'authenticated sans ' || p.droit || ' direct sur ' || t.nom
  from t cross join p;
with t(nom) as (values ('devis_reprises'), ('devis_insertions_modeles'), ('relances_travaux'))
select case when has_table_privilege('authenticated', format('public.%s', t.nom), 'select') then 'OK ' else 'KO ' end
       || 'authenticated garde la lecture de ' || t.nom
  from t;

-- ---------------------------------------------------------------
-- 2 bis. Migrations 000600 → 000900
-- ---------------------------------------------------------------
select case when to_regprocedure('public.reserver_relances_travaux(integer, uuid[])') is null
             and to_regprocedure('public.preparer_relances_travaux(uuid[], date)') is null
       then 'OK ' else 'KO ' end || 'anciennes signatures des relances supprimées (aucun appel ambigu)';
with f(sig) as (values
  ('public.reserver_relances_travaux(integer, uuid[], uuid[])'),
  ('public.preparer_relances_travaux(uuid[], date, uuid[])'),
  ('public.chemins_preuves_devis(text)'))
select case when has_function_privilege('service_role', sig, 'execute')
             and not has_function_privilege('authenticated', sig, 'execute')
             and not has_function_privilege('anon', sig, 'execute')
       then 'OK ' else 'KO ' end || 'réservée au service : ' || sig
  from f;
select case when not has_function_privilege('anon', 'public.preuves_devis(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.preuves_devis(uuid)', 'execute')
       then 'OK ' else 'KO ' end || 'preuves_devis fermée aux rôles applicatifs';
with f(sig) as (values
  ('public.atelier_mes_constats(uuid)'),
  ('public.atelier_ajouter_constat(uuid, text, text, text, text)'),
  ('public.atelier_ajouter_photo(uuid, text)'),
  ('public.atelier_photo_visible(text)'),
  ('public.atelier_depot_photo_autorise(text)'))
select case when has_function_privilege('authenticated', sig, 'execute') and not has_function_privilege('anon', sig, 'execute')
       then 'OK ' else 'KO ' end || 'mécanicien (authenticated seul) : ' || sig
  from f;
select case when count(*) = 3 then 'OK ' else 'KO ' end || 'stockage inspections-photos : 3 politiques (lecture, dépôt, suppression)'
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'inspections_photos_storage_%';
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'plus aucune politique de stockage réservée au seul propriétaire'
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'inspections_photos_storage_%'
   and (coalesce(qual, '') || coalesce(with_check, '')) like '%owner_user_id%';
select case when coalesce(bool_and(qual like '%photo_figee%'), false) then 'OK ' else 'KO ' end || 'suppression de stockage refusée pour une photo figée'
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'inspections_photos_storage_delete';
select case when c.relrowsecurity and not has_table_privilege('authenticated', 'public.devis_preuves', 'insert') and has_table_privilege('authenticated', 'public.devis_preuves', 'select')
       then 'OK ' else 'KO ' end || 'devis_preuves : RLS, lecture seule pour authenticated'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'devis_preuves';
select case when count(*) = 2 then 'OK ' else 'KO ' end || 'triggers de gel et de protection des preuves présents'
  from pg_trigger where not tgisinternal and tgname in ('devis_figer_preuves_trigger', 'inspections_photos_proteger_preuve_trigger');
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'fonctions mécanicien : search_path fixé (public, pg_temp)'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and p.proname in ('atelier_mes_constats', 'atelier_ajouter_constat', 'atelier_ajouter_photo', 'atelier_photo_visible', 'atelier_depot_photo_autorise',
                     'preuves_devis', 'chemins_preuves_devis', 'photo_figee', 'devis_figer_preuves', 'inspections_photos_proteger_preuve')
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- Les fonctions SECURITY DEFINER nouvelles ont un search_path figé.
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'toutes les fonctions SECURITY DEFINER nouvelles ont search_path fixé'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and p.proname in ('preparer_devis_depuis_constat','inserer_modele_dans_devis','enregistrer_devis_comme_modele',
                     'modifier_relance_travail','autoriser_envoi_relance_travail','annuler_relance_travail',
                     'preparer_relances_travaux','reserver_relances_travaux','terminer_relance_travail',
                     'devis_chiffrage_incomplet','composer_relance_travail','empreinte_relance_travail',
                     'creer_jeton_devis','autoriser_envoi_devis','lire_devis_par_jeton','repondre_devis_par_jeton','empreinte_devis')
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- ---------------------------------------------------------------
-- 3. Mécanique, sur un jeu synthétique (admin, sans session)
-- ---------------------------------------------------------------
begin;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c0de', 'jetable@nexora-recette.invalid');
insert into public.garages (id, nom_garage, email, telephone, owner_user_id, acces_motif)
values ('00000000-0000-4000-8000-0000000000a1', 'JETABLE', 'jetable@nexora-recette.invalid', '0100000000', '00000000-0000-4000-8000-00000000c0de', 'illimite');
insert into public.clients (id, garage_id, nom, email)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Client Jetable', 'client@nexora-recette.invalid');
insert into public.vehicules (id, garage_id, client_id, marque, modele, immatriculation)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'Peugeot', '308', 'ZZ-999-ZZ');

-- 3a. Contrainte « prix à renseigner ⇒ prix 0 »
insert into public.devis (id, garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 0, 0, 'en_attente');
insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, prix_a_renseigner)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'main_oeuvre', 'À chiffrer', 1, 0, 20, true);
select case when public.devis_chiffrage_incomplet('00000000-0000-4000-8000-0000000000d1') then 'OK ' else 'KO ' end || 'devis_chiffrage_incomplet vrai avec une ligne à renseigner';

savepoint avant_contrainte;
do $$ begin
  begin
    insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, prix_a_renseigner)
    values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'piece', 'Faux', 1, 12, 20, true);
    raise notice 'KO contrainte prix_a_renseigner_zero non appliquée';
  exception when check_violation then
    raise notice 'OK contrainte prix_a_renseigner_zero appliquée';
  end;
end $$;

-- 3b. Relances : préparation idempotente, report, clôture
insert into public.travaux_differes (id, garage_id, client_id, vehicule_id, intervention, niveau, statut, date_relance, source)
values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'Pneus', 'normal', 'a_relancer', current_date - 2, 'manuel');

select case when count(*) = 1 then 'OK ' else 'KO ' end || 'préparation : une relance au premier passage'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[]) where action = 'preparee';
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'préparation : rien au second passage'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
update public.travaux_differes set date_relance = current_date + 10 where id = '00000000-0000-4000-8000-0000000000f1';
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'report : la relance devient obsolète'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[]) where action = 'obsolete';
update public.travaux_differes set date_relance = current_date - 1 where id = '00000000-0000-4000-8000-0000000000f1';
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'nouvelle échéance : nouvelle relance préparée'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[]) where action = 'preparee';
update public.travaux_differes set statut = 'refus_definitif' where id = '00000000-0000-4000-8000-0000000000f1';
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'refus définitif : la relance à relire est annulée'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[]) where action = 'annulee';
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'réservation : rien sans autorisation'
  from public.reserver_relances_travaux(10, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);

-- 3c. La préparation ne touche pas les autres garages (borne p_garages)
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'préparation bornée : aucun garage hors liste'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000ff']::uuid[]);

-- 3d. Réservation bornée à des lignes précises, dans l'instruction (000600)
insert into public.travaux_differes (id, garage_id, client_id, vehicule_id, intervention, niveau, statut, date_relance, source) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'Mien', 'normal', 'a_relancer', current_date - 1, 'manuel'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'Hors', 'normal', 'a_relancer', current_date - 1, 'manuel');
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'préparation bornée à p_travaux : un seul travail préparé'
  from public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[], current_date, array['00000000-0000-4000-8000-0000000000f2']::uuid[]) where action = 'preparee';
select public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[], current_date, array['00000000-0000-4000-8000-0000000000f3']::uuid[]) is not null as _;
update public.relances_travaux set statut = 'en_attente', destinataire_valide = 'client@nexora-recette.invalid'
 where travail_differe_id in ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3');
update public.relances_travaux set empreinte_document = public.empreinte_relance_travail(id)
 where travail_differe_id in ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3');
select case when count(*) = 1 and bool_and(r.garage_id is not null) then 'OK ' else 'KO ' end || 'réservation bornée à p_relances : une seule ligne prise'
  from public.reserver_relances_travaux(10, array['00000000-0000-4000-8000-0000000000a1']::uuid[],
       array(select id from public.relances_travaux where travail_differe_id = '00000000-0000-4000-8000-0000000000f2')) r;
select case when statut = 'en_attente' and tentatives = 0 then 'OK ' else 'KO ' end || 'la ligne hors périmètre reste en_attente, 0 tentative'
  from public.relances_travaux where travail_differe_id = '00000000-0000-4000-8000-0000000000f3';
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'p_relances vide : rien réservé'
  from public.reserver_relances_travaux(10, array['00000000-0000-4000-8000-0000000000a1']::uuid[], '{}'::uuid[]);

-- 3e. Gel de la preuve au passage à « accepté », protection, identifiants opaques (000800, 000900)
insert into public.inspections (id, garage_id, client_id, vehicule_id, statut)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'brouillon');
insert into public.inspections_points (id, inspection_id, garage_id, categorie, libelle, etat, commentaire, soumis_client)
values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'pneus', 'Plaquettes', 'dommage', 'Usées', false);
insert into public.inspections_photos (id, inspection_id, garage_id, point_id, storage_path)
values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000b4.png');
insert into public.devis (id, garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 0, 0, 'en_attente');
insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, inspection_point_id, note_constat)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', 'main_oeuvre', 'Plaquettes', 1, 90, 20, '00000000-0000-4000-8000-0000000000b2', 'Usées');
insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', encode(extensions.digest('jeton-jetable', 'sha256'), 'hex'), now() + interval '1 day');

select case when (public.lire_devis_par_jeton('jeton-jetable')->'lignes'->0->'preuve'->'photos'->>0) = '00000000-0000-4000-8000-0000000000b3'
             and position('/' in (public.lire_devis_par_jeton('jeton-jetable'))::text) = 0
       then 'OK ' else 'KO ' end || 'lecture publique : identifiant opaque, aucun chemin (devis en attente)';
select case when count(*) = 1 and bool_and(chemin like '%/%') then 'OK ' else 'KO ' end || 'chemins_preuves_devis : le chemin, pour le service seulement'
  from public.chemins_preuves_devis('jeton-jetable');
update public.devis set statut = 'accepte' where id = '00000000-0000-4000-8000-0000000000d2';
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'acceptation : la photo est figée dans devis_preuves'
  from public.devis_preuves where devis_id = '00000000-0000-4000-8000-0000000000d2';
select case when public.photo_figee('00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000b4.png')
       then 'OK ' else 'KO ' end || 'photo_figee vrai pour le chemin de la preuve';
do $$ begin
  begin
    delete from public.inspections_photos where id = '00000000-0000-4000-8000-0000000000b3';
    raise notice 'KO suppression d''une photo figée acceptée';
  exception when raise_exception then
    raise notice 'OK suppression d''une photo figée refusée';
  end;
end $$;
insert into public.inspections_photos (inspection_id, garage_id, point_id, storage_path)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000b5.png');
select case when jsonb_array_length(public.lire_devis_par_jeton('jeton-jetable')->'lignes'->0->'preuve'->'photos') = 1
       then 'OK ' else 'KO ' end || 'photo ajoutée après acceptation : le devis public n''en montre qu''une (figée)';

-- 3f. Fiabilisation (001000) : l'empreinte suit ce que le client lit ; l'opposition bloque les relances
insert into public.devis (id, garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 0, 0, 'en_attente');
insert into public.devis_lignes (id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, inspection_point_id, note_constat)
values ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', 'main_oeuvre', 'Plaquettes', 1, 90, 20, '00000000-0000-4000-8000-0000000000b2', 'Usées');
create temp table empreintes (etape text, valeur text);
insert into empreintes select 'depart', public.empreinte_devis('00000000-0000-4000-8000-0000000000d3');
update public.devis_lignes set libelle = 'Disques et plaquettes' where id = '00000000-0000-4000-8000-0000000000d4';
insert into empreintes select 'libelle', public.empreinte_devis('00000000-0000-4000-8000-0000000000d3');
update public.devis_lignes set note_constat = 'Usées, disque rayé' where id = '00000000-0000-4000-8000-0000000000d4';
insert into empreintes select 'constat', public.empreinte_devis('00000000-0000-4000-8000-0000000000d3');
insert into public.inspections_photos (inspection_id, garage_id, point_id, storage_path)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2',
        '00000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000b6.png');
insert into empreintes select 'photo', public.empreinte_devis('00000000-0000-4000-8000-0000000000d3');
insert into empreintes select 'relecture', public.empreinte_devis('00000000-0000-4000-8000-0000000000d3');
select case when count(distinct valeur) filter (where etape in ('depart', 'libelle', 'constat', 'photo')) = 4
             and (select valeur from empreintes where etape = 'photo') = (select valeur from empreintes where etape = 'relecture')
       then 'OK ' else 'KO ' end || 'empreinte_devis change avec le libellé, le constat et les photos, et reste stable sans changement'
  from empreintes;
select case when not has_function_privilege('anon', 'public.client_oppose_relances(uuid, uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.client_oppose_relances(uuid, uuid)', 'execute')
       then 'OK ' else 'KO ' end || 'client_oppose_relances fermée aux rôles applicatifs';
insert into public.travaux_differes (id, garage_id, client_id, vehicule_id, intervention, niveau, statut, date_relance, source)
values ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'Opposé', 'normal', 'a_relancer', current_date - 1, 'manuel');
select public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000000a1']::uuid[], current_date, array['00000000-0000-4000-8000-0000000000f4']::uuid[]) is not null as _;
update public.relances_travaux set statut = 'en_attente', destinataire_valide = 'client@nexora-recette.invalid'
 where travail_differe_id = '00000000-0000-4000-8000-0000000000f4';
update public.relances_travaux set empreinte_document = public.empreinte_relance_travail(id)
 where travail_differe_id = '00000000-0000-4000-8000-0000000000f4';
-- Le journal force `enregistre_par = auth.uid()` : l'opposition s'enregistre sous l'identité du propriétaire.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-00000000c0de';
insert into public.revenue_recovery_permissions (garage_id, client_id, canal, statut, origine, enregistre_par)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'email', 'oppose', 'contrôle base jetable', '00000000-0000-4000-8000-00000000c0de');
select case when count(*) = 0 then 'OK ' else 'KO ' end || 'opposition après autorisation : la réservation ne prend rien'
  from public.reserver_relances_travaux(10, array['00000000-0000-4000-8000-0000000000a1']::uuid[],
       array(select id from public.relances_travaux where travail_differe_id = '00000000-0000-4000-8000-0000000000f4'));
select case when statut = 'bloque' and derniere_erreur like '%opposé%' then 'OK ' else 'KO ' end || 'opposition après autorisation : relance mise de côté avec son motif'
  from public.relances_travaux where travail_differe_id = '00000000-0000-4000-8000-0000000000f4';

rollback;

select case when count(*) = 0 then 'OK ' else 'KO ' end || 'jeu synthétique retiré (rollback)'
  from public.garages where id = '00000000-0000-4000-8000-0000000000a1';
