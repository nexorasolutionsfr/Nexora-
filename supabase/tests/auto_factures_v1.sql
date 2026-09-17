-- Nexora Auto — lot E (factures) — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922000900 appliquées. Jamais Production.
-- Marqueur « recette-auto-e- ». Transaction jamais validée.

begin;

create temporary table _fixture_ids (cle text primary key, valeur uuid not null) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated, anon, service_role;

create function pg_temp.memoriser(p_cle text, p_valeur uuid) returns void
language sql security definer set search_path = '' as $$
  insert into pg_temp._fixture_ids (cle, valeur) values (p_cle, p_valeur);
$$;
revoke execute on function pg_temp.memoriser(text, uuid) from public;
grant execute on function pg_temp.memoriser(text, uuid) to authenticated, service_role;

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to authenticated, anon, service_role;

create function pg_temp.assert_echec(
  p_cas text, p_state text, p_message text, p_state_attendu text, p_motif_attendu text
) returns void
language plpgsql set search_path = '' as $$
begin
  if p_state is null then
    raise exception 'ASSERTION FAILED: % — aucune erreur levee, une erreur % etait attendue', p_cas, p_state_attendu;
  end if;
  if p_state <> p_state_attendu then
    raise exception 'ASSERTION FAILED: % — SQLSTATE % attendu, obtenu % (%)', p_cas, p_state_attendu, p_state, p_message;
  end if;
  if position(lower(p_motif_attendu) in lower(p_message)) = 0 then
    raise exception 'ASSERTION FAILED: % — message attendu contenant "%", obtenu "%"', p_cas, p_motif_attendu, p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert_echec(text, text, text, text, text) from public;
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated, anon, service_role;

create function pg_temp.connecter(p_cle text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid(p_cle)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.fid(p_cle)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Un document de facture (fiche seulement ; le fichier n'est pas nécessaire ici).
create function pg_temp.document(p_vehicule uuid, p_empreinte text default null) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.auto_documents (vehicule_id, type, chemin, nom_fichier, type_mime, taille_octets, empreinte_sha256)
  values (p_vehicule, 'facture', (select auth.uid())::text || '/' || p_vehicule::text || '/' || gen_random_uuid()::text || '.pdf',
          'facture.pdf', 'application/pdf', 1000, p_empreinte)
  returning id into v_id;
  return v_id;
end;
$$;

insert into _fixture_ids (cle, valeur) values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid());

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-e-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-e-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Documents et opérations : formes refusées
-- =====================================================================

do $$
declare
  v_clio uuid;
  v_zoe uuid;
  v_doc uuid;
  v_state text;
  v_msg text;
  v_empreinte text := repeat('ab', 32);
  v_ops jsonb;
begin
  perform pg_temp.connecter('alice');
  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  v_zoe := public.auto_ajouter_vehicule('Renault', 'Zoe', 2021, 'electrique');
  perform pg_temp.memoriser('clio', v_clio);
  perform pg_temp.memoriser('zoe', v_zoe);

  v_doc := pg_temp.document(v_clio, v_empreinte);
  v_state := null;
  begin
    perform pg_temp.document(v_clio, v_empreinte);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : même fichier deux fois sur la même voiture', v_state, v_msg, '23505', 'auto_documents_empreinte_unique');
  perform pg_temp.document(v_zoe, v_empreinte);

  v_state := null;
  begin
    perform pg_temp.document(v_clio, 'pas-une-empreinte');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : empreinte mal formée', v_state, v_msg, '23514', 'auto_documents_empreinte_valide');

  v_state := null;
  begin
    update public.auto_documents set lecture = '[1, 2]'::jsonb where id = v_doc;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : proposition qui n''est pas un objet', v_state, v_msg, '23514', 'auto_documents_lecture_objet');

  foreach v_ops in array array[
    '{"type": "vidange", "libelle": "Vidange"}'::jsonb,
    '[]'::jsonb,
    '[{"type": "teleportation", "libelle": "X"}]'::jsonb,
    '[{"type": "vidange", "libelle": "  "}]'::jsonb,
    '[{"type": "vidange", "libelle": "Vidange", "prix": 12}]'::jsonb,
    '["vidange"]'::jsonb,
    (select jsonb_agg(jsonb_build_object('type', 'autre', 'libelle', 'ligne ' || i)) from generate_series(1, 31) i)
  ] loop
    v_state := null;
    begin
      insert into public.auto_historique (vehicule_id, type, realise_le, operations) values (v_clio, 'autre', date '2026-01-10', v_ops);
    exception when others then v_state := sqlstate; v_msg := sqlerrm;
    end;
    perform pg_temp.assert_echec('historique : opérations invalides ' || left(v_ops::text, 40), v_state, v_msg, '23514', 'auto_historique_operations_valides');
  end loop;
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 2. Enregistrer une facture : une confirmation, jamais de fusion silencieuse
-- =====================================================================

do $$
declare
  v_clio uuid := pg_temp.fid('clio');
  v_zoe uuid := pg_temp.fid('zoe');
  v_doc1 uuid;
  v_doc2 uuid;
  v_doc3 uuid;
  v_doc4 uuid;
  v_h1 uuid;
  v_h2 uuid;
  v_h uuid;
  v_n integer;
  v_state text;
  v_msg text;
  v_ops jsonb := '[{"type": "vidange", "libelle": "Vidange + filtre"}, {"type": "freinage", "libelle": "Plaquettes avant"}]';
begin
  perform pg_temp.connecter('alice');
  v_doc1 := pg_temp.document(v_clio);
  v_doc2 := pg_temp.document(v_clio);
  v_doc3 := pg_temp.document(v_clio);
  v_doc4 := pg_temp.document(v_clio);
  perform pg_temp.memoriser('doc4', v_doc4);

  -- Création : plusieurs opérations, un seul montant, dates distinctes.
  v_h1 := public.auto_enregistrer_facture(v_doc1, null, date '2026-03-13', date '2026-03-14', 'freinage', v_ops,
                                          'Garage des Tilleuls', 58200, 412.5, 'Vidange + filtre ; Plaquettes avant');
  perform pg_temp.assert((select saisie = 'document' and source = 'proprietaire' and montant_ttc = 412.50 and kilometrage = 58200
                                 and realise_le = date '2026-03-13' and jsonb_array_length(operations) = 2
                          from public.auto_historique where id = v_h1), 'facture : intervention créée d''après le document, provenance la personne');
  perform pg_temp.assert((select historique_id = v_h1 and type = 'facture' and date_document = date '2026-03-14' and titre = 'Facture Garage des Tilleuls'
                          from public.auto_documents where id = v_doc1), 'facture : document relié, date de facture distincte, titre lisible');
  perform pg_temp.assert((select count(*) from public.auto_releves_km where vehicule_id = v_clio) = 0, 'facture : aucun relevé écrasé ni ajouté');

  v_state := null;
  begin
    perform public.auto_enregistrer_facture(v_doc1, null, date '2026-03-13', null, 'freinage', null, null, null, 412.5, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('facture : enregistrée deux fois', v_state, v_msg, '23505', 'auto_facture_deja_enregistree');

  -- Même voiture, même date, même montant : doublon potentiel, à trancher.
  v_state := null;
  begin
    perform public.auto_enregistrer_facture(v_doc2, null, date '2026-03-13', null, 'pneus', null, null, null, 412.50, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('facture : intervention ressemblante non tranchée', v_state, v_msg, '23514', 'auto_doublon_potentiel');
  perform pg_temp.assert((select historique_id is null from public.auto_documents where id = v_doc2), 'facture : rien d''enregistré après le refus');

  -- La personne choisit « Rattacher à cette intervention » : rien n'est créé ni modifié.
  select count(*) into v_n from public.auto_historique where vehicule_id = v_clio;
  v_h := public.auto_enregistrer_facture(v_doc2, v_h1, null, date '2026-03-15', null, null, null, null, null, null);
  perform pg_temp.assert(v_h = v_h1, 'rattacher : même intervention');
  perform pg_temp.assert((select titre = 'Facture Garage des Tilleuls' and date_document = date '2026-03-15' from public.auto_documents where id = v_doc2), 'rattacher : titre repris de l''intervention');
  perform pg_temp.assert((select count(*) from public.auto_historique where vehicule_id = v_clio) = v_n, 'rattacher : aucune intervention de plus');
  perform pg_temp.assert((select montant_ttc = 412.50 and prestataire = 'Garage des Tilleuls' from public.auto_historique where id = v_h1), 'rattacher : intervention inchangée');
  perform pg_temp.assert((select coalesce(sum(montant_ttc), 0) = 412.50 from public.auto_historique where vehicule_id = v_clio), 'rattacher : dépense comptée une fois');

  -- La personne choisit « Créer une autre intervention » : explicitement.
  v_h2 := public.auto_enregistrer_facture(v_doc3, null, date '2026-03-13', null, 'pneus', null, null, null, 412.50, null, true);
  perform pg_temp.assert(v_h2 <> v_h1, 'créer malgré la ressemblance : nouvelle intervention sur choix explicite');

  -- Même date, sans montant, type différent : pas un doublon.
  v_h := public.auto_enregistrer_facture(v_doc4, null, date '2026-03-13', null, 'lavage', null, null, null, null, null);
  perform pg_temp.assert(v_h is not null, 'type différent sans montant : pas de doublon');

  v_state := null;
  begin
    perform public.auto_enregistrer_facture(pg_temp.document(v_clio), null, date '2026-03-13', null, 'lavage', null, null, null, null, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('même date, même type, sans montant : doublon potentiel', v_state, v_msg, '23514', 'auto_doublon_potentiel');

  v_state := null;
  begin
    perform public.auto_enregistrer_facture(pg_temp.document(v_zoe), v_h1, null, null, null, null, null, null, null, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('rattacher à l''intervention d''une autre voiture', v_state, v_msg, 'P0002', 'auto_intervention_introuvable');

  v_state := null;
  begin
    perform public.auto_enregistrer_facture(pg_temp.document(v_clio), null, current_date + 3, null, 'vidange', null, null, null, 50, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('date d''intervention future', v_state, v_msg, '23514', 'auto_date_future');

  v_state := null;
  begin
    perform public.auto_enregistrer_facture(pg_temp.document(v_clio), null, date '2026-02-01', null, 'vidange', '{"type": "vidange"}'::jsonb, null, null, 50, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('opérations qui ne sont pas une liste', v_state, v_msg, '23514', 'auto_historique_operations_valides');
  reset role;

  perform pg_temp.connecter('bruno');
  v_state := null;
  begin
    perform public.auto_enregistrer_facture(pg_temp.fid('doc4'), null, date '2026-01-01', null, 'vidange', null, null, null, null, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('facture d''une autre personne', v_state, v_msg, 'P0002', 'auto_document_introuvable');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 3. Réserver une lecture : tentatives, quota, budget (serveur seulement)
-- =====================================================================

do $$
declare
  v_clio uuid := pg_temp.fid('clio');
  v_doc uuid;
  v_doc2 uuid;
  v_ligne record;
  v_state text;
  v_msg text;
  v_i integer;
begin
  perform pg_temp.connecter('alice');
  v_doc := pg_temp.document(v_clio);
  v_doc2 := pg_temp.document(v_clio);
  perform pg_temp.memoriser('doc_lecture', v_doc);
  perform pg_temp.memoriser('doc_lecture_2', v_doc2);

  v_state := null;
  begin
    perform * from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc, 'anthropic', 'claude-haiku-4-5-20251001', 32500, 5000000, 2, 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('réserver : interdit à une personne connectée', v_state, v_msg, '42501', 'permission denied');

  v_state := null;
  begin
    insert into public.auto_lectures (proprietaire_id, document_id, fournisseur, modele, cout_reserve_micro_usd) values (pg_temp.fid('alice'), v_doc, 'anthropic', 'x', 0);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('journal : écriture par une personne connectée', v_state, v_msg, '42501', 'permission denied');
  reset role;

  -- Budget d'essai isolé du reste de la base : on part de la dépense existante.
  perform set_config('role', 'service_role', true);
  create temporary table _depense on commit drop as
    select coalesce(sum(case when statut = 'en_cours' then cout_reserve_micro_usd when facturation = 'non_facturee' then 0
                             when cout_estime_micro_usd is not null then cout_estime_micro_usd else cout_reserve_micro_usd end), 0)::bigint as montant
    from public.auto_lectures;

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc, 'anthropic', 'claude-haiku-4-5-20251001', 32500, (select montant from _depense) + 100000, 2, 10);
  perform pg_temp.assert(v_ligne.lecture_id is not null and v_ligne.refus is null, 'réserver : première tentative acceptée');
  perform pg_temp.memoriser('lecture1', v_ligne.lecture_id);
  update public.auto_lectures set statut = 'reussie', facturation = 'facturee', cout_estime_micro_usd = 9000 where id = v_ligne.lecture_id;

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc, 'anthropic', 'claude-haiku-4-5-20251001', 32500, (select montant from _depense) + 100000, 2, 10);
  perform pg_temp.assert(v_ligne.refus is null, 'réserver : relecture acceptée');
  update public.auto_lectures set statut = 'echec', facturation = 'non_facturee', cout_estime_micro_usd = 0, erreur = 'trop_de_demandes' where id = v_ligne.lecture_id;

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc, 'anthropic', 'claude-haiku-4-5-20251001', 32500, (select montant from _depense) + 100000, 2, 10);
  perform pg_temp.assert(v_ligne.refus = 'tentatives' and v_ligne.lecture_id is null, 'réserver : troisième tentative refusée');

  -- Budget : dépensé 9 000 µ$ (l'échec non facturé ne compte pas).
  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 32500, (select montant from _depense) + 9000 + 32499, 2, 10);
  perform pg_temp.assert(v_ligne.refus = 'budget', 'réserver : budget dépassé d''un micro-dollar');
  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 32500, (select montant from _depense) + 9000 + 32500, 2, 10);
  perform pg_temp.assert(v_ligne.refus is null, 'réserver : budget tout juste suffisant');
  -- Réserve « en_cours » : elle compte tant que la lecture n'est pas terminée.
  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 1, (select montant from _depense) + 9000 + 32500, 2, 10);
  perform pg_temp.assert(v_ligne.refus = 'budget', 'réserver : une lecture en cours garde sa réserve');

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('bruno'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 1, 999999999, 2, 10);
  perform pg_temp.assert(v_ligne.refus = 'document', 'réserver : document d''une autre personne');

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 1, 0, 2, 10);
  perform pg_temp.assert(v_ligne.refus = 'parametres', 'réserver : lecture payante sans budget, rien');

  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), v_doc2, 'anthropic', 'claude-haiku-4-5-20251001', 1, 999999999, 9, 3);
  perform pg_temp.assert(v_ligne.refus = 'quota', 'réserver : quota de lectures sur 24 h');

  -- Lecture gratuite : aucune réserve, aucun budget, mais tentatives et quota.
  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), pg_temp.fid('doc4'), 'texte_pdf', 'regles-1', 0, null, 2, 50);
  perform pg_temp.assert(v_ligne.lecture_id is not null and v_ligne.refus is null, 'réserver : lecture gratuite sans budget');
  select * into v_ligne from public.auto_lecture_reserver(pg_temp.fid('alice'), pg_temp.fid('doc4'), 'texte_pdf', 'regles-1', 0, null, 2, 3);
  perform pg_temp.assert(v_ligne.refus = 'quota', 'réserver : lecture gratuite soumise au quota');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 4. Journal : ce que la personne voit, confirmation mesurée, suppression
-- =====================================================================

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
  v_doc uuid := pg_temp.fid('doc_lecture');
begin
  perform pg_temp.connecter('alice');
  select count(*) into v_n from public.auto_lectures where document_id = v_doc;
  perform pg_temp.assert(v_n = 2, 'journal : Alice voit ses tentatives');

  v_state := null;
  begin
    select sum(cout_estime_micro_usd) into v_n from public.auto_lectures;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('journal : colonnes de coût non lisibles par la personne', v_state, v_msg, '42501', 'permission denied');

  v_state := null;
  begin
    update public.auto_lectures set statut = 'reussie' where document_id = v_doc;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('journal : statut non modifiable par la personne', v_state, v_msg, '42501', 'permission denied');

  perform public.auto_enregistrer_facture(v_doc, null, date '2025-11-20', null, 'vidange', null, 'Garage', null, 89, null, false,
                                          pg_temp.fid('lecture1'), array['kilometrage', 'montant']);
  reset role;
  perform pg_temp.assert((select confirmee_le is not null and corrections = array['kilometrage', 'montant']
                          from public.auto_lectures where id = pg_temp.fid('lecture1')), 'journal : confirmation et corrections mesurées, sans valeurs');

  perform pg_temp.connecter('bruno');
  select count(*) into v_n from public.auto_lectures;
  perform pg_temp.assert(v_n = 0, 'journal : Bruno ne voit rien d''Alice');
  reset role;

  -- Le document part, le coût reste compté (budget), la proposition disparaît avec lui.
  delete from public.auto_documents where id = pg_temp.fid('doc_lecture_2');
  perform pg_temp.assert((select count(*) from public.auto_lectures where proprietaire_id = pg_temp.fid('alice') and document_id is null) >= 1,
                         'journal : tentative conservée après suppression du document');
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO LOT E : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-e-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
