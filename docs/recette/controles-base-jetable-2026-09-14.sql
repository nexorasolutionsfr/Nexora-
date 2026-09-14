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
  ('preparer_relances_travaux', 'uuid[], date'),
  ('reserver_relances_travaux', 'integer, uuid[]'),
  ('terminer_relance_travail', 'uuid, text, text'),
  ('devis_chiffrage_incomplet', 'uuid'),
  ('composer_relance_travail', 'uuid'),
  ('empreinte_relance_travail', 'uuid'))
select case when has_function_privilege('anon', format('public.%s(%s)', nom, sig), 'execute') then 'KO ' else 'OK ' end
       || 'anon ne peut pas exécuter ' || nom
  from f;

with f(nom, sig) as (values
  ('preparer_relances_travaux', 'uuid[], date'),
  ('reserver_relances_travaux', 'integer, uuid[]'),
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

select case when has_function_privilege('service_role', 'public.reserver_relances_travaux(integer, uuid[])', 'execute')
             and has_function_privilege('service_role', 'public.preparer_relances_travaux(uuid[], date)', 'execute')
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

rollback;

select case when count(*) = 0 then 'OK ' else 'KO ' end || 'jeu synthétique retiré (rollback)'
  from public.garages where id = '00000000-0000-4000-8000-0000000000a1';
