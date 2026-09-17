-- Nexora Auto — lot H (import plus fluide) — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922001000 appliquées. Jamais Production.
-- Marqueur « recette-auto-h- ». Transaction jamais validée.
--
-- La simultanéité elle-même (deux appels au même instant) ne se rejoue pas
-- dans une seule session : scripts/recette/factures/concurrence.mjs la
-- mesure sur Test. Ce banc vérifie la présence du verrou et le reste.

begin;

-- Accès Nexora Auto ouvert le temps du banc, annulé avec lui (20260922001100).
do $$ begin if to_regclass('public.auto_acces_parametres') is not null then update public.auto_acces_parametres set mode = 'ouvert'; end if; end $$;

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
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-h-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-h-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Corriger une intervention confirmée d'après une facture
-- =====================================================================

do $$
declare
  v_clio uuid;
  v_doc uuid;
  v_doc_titre uuid;
  v_h uuid;
  v_h2 uuid;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');
  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  perform pg_temp.memoriser('clio', v_clio);

  v_doc := pg_temp.document(v_clio);
  v_h := public.auto_enregistrer_facture(v_doc, null, date '2026-03-12', date '2026-03-14', 'vidange',
    '[{"type": "vidange", "libelle": "Vidange moteur"}, {"type": "autre", "libelle": "Filtre à huile"}]'::jsonb,
    'Garage Martin', 84200, 189.90, 'Vidange moteur ; Filtre à huile');
  perform pg_temp.memoriser('h', v_h);
  perform pg_temp.assert((select titre from public.auto_documents where id = v_doc) = 'Facture Garage Martin', 'titre automatique posé à la confirmation');

  -- Date, montant, kilométrage, opérations : corrigés, provenance et facture conservées.
  update public.auto_historique
  set realise_le = date '2026-03-11', montant_ttc = 198.90, kilometrage = 84020,
      operations = '[{"type": "vidange", "libelle": "Vidange moteur"}, {"type": "freinage", "libelle": "Plaquettes avant"}]'::jsonb,
      libelle = 'Vidange moteur ; Plaquettes avant'
  where id = v_h;
  perform pg_temp.assert((select saisie = 'document' and source = 'proprietaire' and montant_ttc = 198.90 and jsonb_array_length(operations) = 2
                          from public.auto_historique where id = v_h), 'correction : valeurs écrites, provenance inchangée');
  perform pg_temp.assert((select historique_id = v_h and date_document = date '2026-03-14' from public.auto_documents where id = v_doc),
                         'correction : la facture reste jointe, sa date inchangée');
  perform pg_temp.assert((select count(*) from public.auto_historique where vehicule_id = v_clio) = 1, 'correction : aucune intervention en plus');

  -- Professionnel corrigé : le titre automatique suit.
  update public.auto_historique set prestataire = 'Garage Martin Nord' where id = v_h;
  perform pg_temp.assert((select titre from public.auto_documents where id = v_doc) = 'Facture Garage Martin Nord', 'titre automatique : suit le professionnel');
  update public.auto_historique set prestataire = null where id = v_h;
  perform pg_temp.assert((select titre from public.auto_documents where id = v_doc) is null, 'titre automatique : effacé avec le professionnel');
  update public.auto_historique set prestataire = 'Garage Martin' where id = v_h;
  perform pg_temp.assert((select titre from public.auto_documents where id = v_doc) is null, 'titre effacé : pas recréé en silence');

  -- Un titre choisi par la personne n'est jamais touché.
  v_doc_titre := pg_temp.document(v_clio);
  update public.auto_documents set titre = 'Ma facture de pneus' where id = v_doc_titre;
  v_h2 := public.auto_enregistrer_facture(v_doc_titre, null, date '2026-01-05', null, 'pneus', null, 'Centre Pneus', null, 320.00, null);
  update public.auto_historique set prestataire = 'Centre Pneus Est' where id = v_h2;
  perform pg_temp.assert((select titre from public.auto_documents where id = v_doc_titre) = 'Ma facture de pneus', 'titre choisi : jamais remplacé');

  -- Formes toujours refusées à la correction.
  v_state := null;
  begin
    update public.auto_historique set operations = '[]'::jsonb where id = v_h;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('correction : liste d''opérations vide', v_state, v_msg, '23514', 'auto_historique_operations_valides');

  v_state := null;
  begin
    update public.auto_historique set realise_le = current_date + 3 where id = v_h;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state is not null, 'correction : date future refusée');

  v_state := null;
  begin
    update public.auto_historique set montant_ttc = -5 where id = v_h;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('correction : montant négatif', v_state, v_msg, '23514', 'auto_historique_montant_positif');

  -- Après correction, la même facture ressemblante reste détectée.
  v_doc := pg_temp.document(v_clio);
  v_state := null;
  begin
    perform public.auto_enregistrer_facture(v_doc, null, date '2026-03-11', null, 'vidange', null, null, null, 198.90, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('ressemblance après correction', v_state, v_msg, '23514', 'auto_doublon_potentiel');
end;
$$;
reset role;

-- =====================================================================
-- 2. Une autre personne ne corrige rien, ne renomme rien
-- =====================================================================

do $$
declare
  v_n integer;
begin
  perform pg_temp.connecter('bruno');
  with m as (update public.auto_historique set montant_ttc = 1, prestataire = 'Intrus' where id = pg_temp.fid('h') returning 1)
  select count(*) into v_n from m;
  perform pg_temp.assert(v_n = 0, 'bruno : intervention d''alice non modifiable');
end;
$$;
reset role;

do $$
begin
  perform pg_temp.assert((select montant_ttc = 198.90 and prestataire = 'Garage Martin' from public.auto_historique where id = pg_temp.fid('h')),
                         'alice : intervention intacte après la tentative de bruno');
end;
$$;

-- =====================================================================
-- 3. Verrou par voiture et droits du déclencheur
-- =====================================================================

do $$
begin
  perform pg_temp.assert(position('pg_advisory_xact_lock' in pg_get_functiondef('public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[])'::regprocedure)) > 0,
                         'auto_enregistrer_facture : verrou par voiture présent');
  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.auto_historique_titre_documents()'::regprocedure, 'EXECUTE')
                         and not has_function_privilege('anon', 'public.auto_historique_titre_documents()'::regprocedure, 'EXECUTE'),
                         'déclencheur de titre : non exécutable directement');
  perform pg_temp.assert(has_function_privilege('authenticated', 'public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[])'::regprocedure, 'EXECUTE')
                         and not has_function_privilege('anon', 'public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[])'::regprocedure, 'EXECUTE'),
                         'auto_enregistrer_facture : droits inchangés');
end;
$$;

do $$ begin raise notice 'RECETTE AUTO LOT H : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-h-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
