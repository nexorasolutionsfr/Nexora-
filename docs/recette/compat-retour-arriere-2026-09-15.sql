-- Compatibilité du RETOUR ARRIÈRE APPLICATIF, sur la base jetable (schéma de
-- Production + migrations 20260919*).
--
-- Question : si, après publication et utilisation, on suspend le nouveau
-- traitement (workflow des relances inactif) et on redéploie l'application
-- précédente (`main` = 15eead5), sans toucher à la base, qu'est-ce qui casse ?
--
-- Méthode : 1) des données créées PAR LES NOUVELLES FONCTIONS (modèle, devis
-- repris d'un constat, insertion de modèle, suivi partagé, preuve figée,
-- constat du mécanicien, relance autorisée) ; 2) les appels réels du code de
-- `main` rejoués sous le rôle `authenticated` d'un dirigeant (mêmes tables,
-- mêmes colonnes, même chemin de photo `<garage>/<contrôle>/<uuid>.<ext>` avec
-- l'extension tirée du nom de fichier) ; 3) ce qui doit rester : données,
-- protections, aucun envoi réarmé. Tout est annulé à la fin (rollback).

\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------
-- 0. Jeu synthétique (admin)
-- ---------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c0d11', 'compat.dirigeant@nexora-recette.invalid'),
  ('00000000-0000-4000-8000-0000000c0d12', 'compat.mecano@nexora-recette.invalid');
insert into public.garages (id, nom_garage, email, telephone, owner_user_id, acces_motif)
values ('00000000-0000-4000-8000-0000000c0da1', 'COMPAT', 'compat@nexora-recette.invalid', '0100000000', '00000000-0000-4000-8000-0000000c0d11', 'illimite');
insert into public.garage_membres (garage_id, user_id, role)
values ('00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0d11', 'dirigeant');
insert into public.clients (id, garage_id, nom, email)
values ('00000000-0000-4000-8000-0000000c0dc1', '00000000-0000-4000-8000-0000000c0da1', 'Client Compat', 'client.compat@nexora-recette.invalid');
insert into public.vehicules (id, garage_id, client_id, marque, modele, immatriculation)
values ('00000000-0000-4000-8000-0000000c0de1', '00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0dc1', 'Renault', 'Clio', 'CP-001-AT');
insert into public.inspections (id, garage_id, client_id, vehicule_id, statut)
values ('00000000-0000-4000-8000-0000000c0db1', '00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0dc1', '00000000-0000-4000-8000-0000000c0de1', 'brouillon');
insert into public.inspections_points (id, inspection_id, garage_id, categorie, libelle, etat, commentaire, soumis_client)
values ('00000000-0000-4000-8000-0000000c0db2', '00000000-0000-4000-8000-0000000c0db1', '00000000-0000-4000-8000-0000000c0da1', 'exterieur', 'Pare-chocs fendu', 'dommage', 'Fente de 10 cm', false);
insert into storage.objects (bucket_id, name) values
  ('inspections-photos', '00000000-0000-4000-8000-0000000c0da1/00000000-0000-4000-8000-0000000c0db1/00000000-0000-4000-8000-0000000c0db3.png');
insert into public.inspections_photos (id, inspection_id, garage_id, point_id, storage_path)
values ('00000000-0000-4000-8000-0000000c0db4', '00000000-0000-4000-8000-0000000c0db1', '00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0db2',
        '00000000-0000-4000-8000-0000000c0da1/00000000-0000-4000-8000-0000000c0db1/00000000-0000-4000-8000-0000000c0db3.png');
insert into public.travaux_differes (id, garage_id, client_id, vehicule_id, intervention, niveau, statut, date_relance, source)
values ('00000000-0000-4000-8000-0000000c0df1', '00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0dc1', '00000000-0000-4000-8000-0000000c0de1', 'Pneus', 'normal', 'a_relancer', current_date - 1, 'manuel');

-- ---------------------------------------------------------------
-- 1. Données créées par les NOUVELLES fonctions, en session dirigeant
-- ---------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000c0d11';
set local role authenticated;

do $$
declare r jsonb; v_devis uuid; v_devis2 uuid; v_modele uuid;
begin
  r := public.preparer_devis_depuis_constat(gen_random_uuid(), '00000000-0000-4000-8000-0000000c0db1',
                                           array['00000000-0000-4000-8000-0000000c0db2']::uuid[], null, null);
  v_devis := (r->>'devis_id')::uuid;
  update public.devis_lignes set prix_unitaire_ht = 120, prix_a_renseigner = false where devis_id = v_devis;
  v_modele := public.enregistrer_devis_comme_modele(v_devis, 'Pare-chocs (compat)');
  insert into public.devis (garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
  values ('00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0dc1', '00000000-0000-4000-8000-0000000c0de1', 0, 0, 'en_attente')
  returning id into v_devis2;
  perform public.inserer_modele_dans_devis(gen_random_uuid(), v_devis2, v_modele, null);
  insert into public.opportunites_actions (garage_id, source_type, source_id, action)
  values ('00000000-0000-4000-8000-0000000c0da1', 'devis', v_devis2, 'traite');
  update public.devis set statut = 'accepte' where id = v_devis;
  perform set_config('compat.devis_accepte', v_devis::text, true);
  perform set_config('compat.devis_modele', v_devis2::text, true);
  raise notice 'OK compat : données créées par les nouvelles fonctions (reprise, modèle, insertion, suivi, acceptation)';
exception when others then
  raise notice 'KO compat : création par les nouvelles fonctions — %', sqlerrm;
end $$;

reset role;
select public.preparer_relances_travaux(array['00000000-0000-4000-8000-0000000c0da1']::uuid[]) is not null as _;
set local role authenticated;
do $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from public.relances_travaux where travail_differe_id = '00000000-0000-4000-8000-0000000c0df1';
  r := public.autoriser_envoi_relance_travail(v_id, 'client.compat@nexora-recette.invalid');
  if (r->>'ok')::boolean then raise notice 'OK compat : relance préparée puis autorisée (en attente d''un workflow)';
  else raise notice 'KO compat : autorisation de relance — %', r; end if;
end $$;
reset role;

create temp table compat_avant as
select (select count(*) from public.modeles_travaux where garage_id = '00000000-0000-4000-8000-0000000c0da1') as modeles,
       (select count(*) from public.devis_preuves where garage_id = '00000000-0000-4000-8000-0000000c0da1') as preuves,
       (select count(*) from public.devis_insertions_modeles where garage_id = '00000000-0000-4000-8000-0000000c0da1') as insertions,
       (select count(*) from public.devis_reprises where garage_id = '00000000-0000-4000-8000-0000000c0da1') as reprises,
       (select count(*) from public.opportunites_actions where garage_id = '00000000-0000-4000-8000-0000000c0da1') as suivis,
       (select count(*) from public.inspections_points where garage_id = '00000000-0000-4000-8000-0000000c0da1') as constats,
       (select count(*) from public.relances_travaux where garage_id = '00000000-0000-4000-8000-0000000c0da1' and statut = 'en_attente') as relances_en_attente,
       (select count(*) from public.notifications_devis n join public.devis d on d.id = n.devis_id
         where d.garage_id = '00000000-0000-4000-8000-0000000c0da1' and n.statut = 'en_attente') as notifs_en_attente;
select case when modeles = 1 and preuves = 1 and insertions = 1 and reprises = 1 and suivis = 1 and relances_en_attente = 1 and notifs_en_attente = 0
       then 'OK ' else 'KO ' end || 'compat : état de départ mesuré ' || row_to_json(compat_avant)::text
  from compat_avant;
grant select on compat_avant to authenticated;

-- ---------------------------------------------------------------
-- 2. L'application précédente (`main`) rejouée, en session dirigeant.
--    Suspension du nouveau traitement = aucun appel aux relances ni au
--    workflow ; `main` n'en contient aucun.
-- ---------------------------------------------------------------
set local role authenticated;

do $$
declare v_devis uuid; v_ligne uuid;
begin
  -- DevisView (main) : création d'un devis puis de ses lignes, colonnes d'origine seulement
  insert into public.devis (garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
  values ('00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0dc1', '00000000-0000-4000-8000-0000000c0de1', 0, 0, 'en_attente')
  returning id into v_devis;
  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position)
  values (v_devis, '00000000-0000-4000-8000-0000000c0da1', 'main_oeuvre', 'Vidange', 1, 70, 20, 0) returning id into v_ligne;
  update public.devis_lignes set prix_unitaire_ht = 75 where id = v_ligne;
  perform set_config('compat.devis_main', v_devis::text, true);
  raise notice 'OK main : créer un devis, ajouter et modifier une ligne';
exception when others then raise notice 'KO main : devis et lignes — %', sqlerrm;
end $$;

do $$ begin
  -- Le devis issu d'un modèle reste modifiable par l'ancien écran
  update public.devis_lignes set quantite = 2 where devis_id = current_setting('compat.devis_modele')::uuid;
  raise notice 'OK main : modifier les lignes d''un devis créé par insertion de modèle';
exception when others then raise notice 'KO main : lignes issues d''un modèle — %', sqlerrm;
end $$;

do $$
declare n integer;
begin
  -- InspectionCaptureFlow (main) : `${garageId}/${inspection.id}/${uuid}.${ext}`, ext = extension du nom, en minuscules
  insert into storage.objects (bucket_id, name) values
    ('inspections-photos', '00000000-0000-4000-8000-0000000c0da1/00000000-0000-4000-8000-0000000c0db1/00000000-0000-4000-8000-0000000c0db5.heif');
  insert into public.inspections_photos (inspection_id, garage_id, point_id, storage_path)
  values ('00000000-0000-4000-8000-0000000c0db1', '00000000-0000-4000-8000-0000000c0da1', '00000000-0000-4000-8000-0000000c0db2',
          '00000000-0000-4000-8000-0000000c0da1/00000000-0000-4000-8000-0000000c0db1/00000000-0000-4000-8000-0000000c0db5.heif');
  select count(*) into n from storage.objects
   where bucket_id = 'inspections-photos' and name like '00000000-0000-4000-8000-0000000c0da1/%';
  if n >= 2 then raise notice 'OK main : dépôt et lecture d''une photo .heif (extension hors liste du mécanicien)';
  else raise notice 'KO main : photo déposée invisible (% objet)', n; end if;
exception when others then raise notice 'KO main : dépôt de photo — %', sqlerrm;
end $$;

do $$ begin
  -- `supabase.storage.remove` (main) passe par l'API Storage, qui supprime sous
  -- le rôle de l'utilisateur, politiques appliquées, après avoir levé la garde
  -- `storage.protect_delete` de la Production. On fait exactement cela.
  delete from public.inspections_photos where storage_path like '%0c0db5.heif';
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where name like '%0c0db5.heif';
  perform set_config('storage.allow_delete_query', 'false', true);
  raise notice 'OK main : supprimer une photo non jointe à un devis décidé';
exception when others then raise notice 'KO main : suppression d''une photo libre — %', sqlerrm;
end $$;

do $$ begin
  begin
    delete from public.inspections_photos where id = '00000000-0000-4000-8000-0000000c0db4';
    raise notice 'KO main : la photo figée d''un devis accepté a pu être supprimée';
  exception when others then
    raise notice 'OK main : la photo figée reste protégée (l''ancien écran affiche son erreur générique)';
  end;
end $$;

do $$
declare n integer;
begin
  -- useOpportunites (main) : lecture et écriture du suivi
  select count(*) into n from public.opportunites_actions where garage_id = '00000000-0000-4000-8000-0000000c0da1';
  insert into public.opportunites_actions (garage_id, source_type, source_id, action)
  values ('00000000-0000-4000-8000-0000000c0da1', 'travail_differe', '00000000-0000-4000-8000-0000000c0df1', 'traite');
  if n >= 1 then raise notice 'OK main : le suivi existant se lit et s''écrit'; else raise notice 'KO main : suivi existant invisible'; end if;
exception when others then raise notice 'KO main : suivi — %', sqlerrm;
end $$;

do $$ begin
  -- « Il a accepté » (main) sur le devis créé par l'ancien écran : le gel de preuve s'applique sans gêner
  update public.devis set statut = 'accepte' where id = current_setting('compat.devis_main')::uuid;
  raise notice 'OK main : enregistrer une acceptation au comptoir';
exception when others then raise notice 'KO main : acceptation au comptoir — %', sqlerrm;
end $$;

do $$
declare n_modeles integer; n_lignes integer;
begin
  -- Lecture brute par l'ancien écran : colonnes d'origine présentes, colonnes nouvelles ignorées
  select count(*) into n_modeles from public.devis where garage_id = '00000000-0000-4000-8000-0000000c0da1';
  select count(*) into n_lignes from public.devis_lignes where garage_id = '00000000-0000-4000-8000-0000000c0da1';
  if n_modeles = 3 and n_lignes >= 3 then raise notice 'OK main : liste des devis et lignes lisible (3 devis)';
  else raise notice 'KO main : devis % / lignes %', n_modeles, n_lignes; end if;
end $$;
reset role;

-- Lien public (page `main`) : mêmes clés qu'avant, les nouvelles s'ajoutent
insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
values (current_setting('compat.devis_accepte')::uuid, '00000000-0000-4000-8000-0000000c0da1', encode(extensions.digest('jeton-compat', 'sha256'), 'hex'), now() + interval '1 day');
select case when (public.lire_devis_par_jeton('jeton-compat')->>'ok')::boolean
             and public.lire_devis_par_jeton('jeton-compat')->'lignes'->0 ?& array['libelle', 'quantite', 'prix_unitaire_ht', 'taux_tva', 'montant_ht']
       then 'OK ' else 'KO ' end || 'main : le lien public se lit avec les clés d''origine';

-- ---------------------------------------------------------------
-- 3. Ce qui doit rester
-- ---------------------------------------------------------------
select case when (select count(*) from public.modeles_travaux where garage_id = '00000000-0000-4000-8000-0000000c0da1') = a.modeles
             and (select count(*) from public.devis_insertions_modeles where garage_id = '00000000-0000-4000-8000-0000000c0da1') = a.insertions
             and (select count(*) from public.devis_reprises where garage_id = '00000000-0000-4000-8000-0000000c0da1') = a.reprises
             and (select count(*) from public.inspections_points where garage_id = '00000000-0000-4000-8000-0000000c0da1') = a.constats
       then 'OK ' else 'KO ' end || 'après retour applicatif : modèles, insertions, reprises et constats intacts'
  from compat_avant a;
select case when (select count(*) from public.devis_preuves where devis_id = current_setting('compat.devis_accepte')::uuid) = 1
             and exists (select 1 from public.inspections_photos where id = '00000000-0000-4000-8000-0000000c0db4')
       then 'OK ' else 'KO ' end || 'après retour applicatif : preuve figée et photo d''origine intactes';
select case when (select count(*) from public.opportunites_actions where garage_id = '00000000-0000-4000-8000-0000000c0da1') = a.suivis + 1
       then 'OK ' else 'KO ' end || 'après retour applicatif : suivi conservé (et complété)'
  from compat_avant a;
select case when (select count(*) from public.notifications_devis n join public.devis d on d.id = n.devis_id
                   where d.garage_id = '00000000-0000-4000-8000-0000000c0da1' and n.statut in ('en_attente', 'envoi_en_cours')) = 0
             and (select count(*) from public.relances_travaux where garage_id = '00000000-0000-4000-8000-0000000c0da1' and statut in ('en_attente', 'envoi_en_cours')) = a.relances_en_attente
       then 'OK ' else 'KO ' end || 'aucun envoi réarmé : 0 notification de devis en attente, relance inchangée (aucune réservation sans workflow)'
  from compat_avant a;
select case when count(*) = 3 then 'OK ' else 'KO ' end || 'protections en place : 3 politiques inspections_photos_storage_*'
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'inspections_photos_storage_%';

rollback;

select case when count(*) = 0 then 'OK ' else 'KO ' end || 'compat : jeu synthétique retiré (rollback)'
  from public.garages where id = '00000000-0000-4000-8000-0000000c0da1';
