-- Nexora Auto — lot B (Mon garage consolidé) — banc AUTONOME et RÉVERSIBLE.
--
-- Même convention que auto_mon_vehicule_v1.sql : transaction jamais validée,
-- aucune dépendance à une donnée existante, marqueur « recette-auto-b- ».
-- Présuppose 20260922000100 → 20260922000300 appliquées. Jamais Production.
--
-- Les règles du compartiment `auto-documents` (storage.objects) sont
-- éprouvées à part, sur base jetable seulement :
-- auto_documents_stockage_base_jetable.sql.

begin;

create temporary table _fixture_ids (cle text primary key, valeur uuid not null) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated, anon;

-- Retenir un identifiant créé pendant une session simulée : la table
-- temporaire n'est pas ouverte en écriture au rôle authenticated.
create function pg_temp.memoriser(p_cle text, p_valeur uuid) returns void
language sql security definer set search_path = '' as $$
  insert into pg_temp._fixture_ids (cle, valeur) values (p_cle, p_valeur);
$$;
revoke execute on function pg_temp.memoriser(text, uuid) from public;
grant execute on function pg_temp.memoriser(text, uuid) to authenticated;

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to authenticated, anon;

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
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated, anon;

-- Session simulée jusqu'au `reset role` (voir auto_mon_vehicule_v1.sql).
create function pg_temp.connecter(p_cle text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.fid(p_cle)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.fid(p_cle)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into _fixture_ids (cle, valeur) values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid());

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-b-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-b-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Voiture principale
-- =====================================================================

do $$
declare
  v_clio uuid;
  v_zoe uuid;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  v_zoe := public.auto_ajouter_vehicule('Renault', 'Zoe', 2021, 'electrique');
  perform pg_temp.memoriser('clio', v_clio);
  perform pg_temp.memoriser('zoe', v_zoe);

  perform pg_temp.assert((select principal from public.auto_vehicules where id = v_clio), 'principal : la première voiture doit être principale');
  perform pg_temp.assert(not (select principal from public.auto_vehicules where id = v_zoe), 'principal : la deuxième voiture ne doit pas l''être');

  perform public.auto_definir_principal(v_zoe);
  perform pg_temp.assert((select principal from public.auto_vehicules where id = v_zoe), 'principal : la Zoe doit devenir principale');
  perform pg_temp.assert(not (select principal from public.auto_vehicules where id = v_clio), 'principal : la Clio ne doit plus l''être');

  v_state := null;
  begin
    update public.auto_vehicules set principal = true where id = v_clio;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('principal : deux voitures principales', v_state, v_msg, '23505', 'auto_vehicules_un_principal');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 2. Archivage
-- =====================================================================

do $$
declare
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  -- La principale part aux archives : la plus ancienne voiture active prend sa place.
  perform public.auto_archiver_vehicule(pg_temp.fid('zoe'), true);
  perform pg_temp.assert((select archive_le is not null and not principal from public.auto_vehicules where id = pg_temp.fid('zoe')),
    'archivage : la Zoe doit être archivée et plus principale');
  perform pg_temp.assert((select principal from public.auto_vehicules where id = pg_temp.fid('clio')),
    'archivage : la Clio doit redevenir principale');

  v_state := null;
  begin
    perform public.auto_definir_principal(pg_temp.fid('zoe'));
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('archivage : une voiture archivée ne devient pas principale', v_state, v_msg, 'P0002', 'auto_principal_impossible');

  -- Restaurée alors qu'une principale existe : elle revient, sans le devenir.
  perform public.auto_archiver_vehicule(pg_temp.fid('zoe'), false);
  perform pg_temp.assert((select archive_le is null and not principal from public.auto_vehicules where id = pg_temp.fid('zoe')),
    'restauration : la Zoe doit revenir sans devenir principale');

  -- Toutes archivées puis une restaurée : elle devient principale.
  perform public.auto_archiver_vehicule(pg_temp.fid('clio'), true);
  perform pg_temp.assert((select principal from public.auto_vehicules where id = pg_temp.fid('zoe')),
    'archivage : la Zoe, seule active, doit devenir principale');
  perform public.auto_archiver_vehicule(pg_temp.fid('zoe'), true);
  perform pg_temp.assert((select count(*) = 0 from public.auto_vehicules where principal),
    'archivage : plus aucune voiture active, plus aucune principale');
  perform public.auto_archiver_vehicule(pg_temp.fid('clio'), false);
  perform pg_temp.assert((select principal from public.auto_vehicules where id = pg_temp.fid('clio')),
    'restauration : sans principale, la voiture restaurée le devient');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  v_state := null;
  begin
    perform public.auto_archiver_vehicule(pg_temp.fid('clio'), true);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : archiver la voiture d''Alice', v_state, v_msg, 'P0002', 'auto_vehicule_introuvable');

  v_state := null;
  begin
    perform public.auto_definir_principal(pg_temp.fid('clio'));
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : rendre principale la voiture d''Alice', v_state, v_msg, 'P0002', 'auto_principal_impossible');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 3. Documents
-- =====================================================================

do $$
declare
  v_revision_zoe uuid;
  v_chemin text;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  insert into public.auto_historique (vehicule_id, type, realise_le, montant_ttc)
  values (pg_temp.fid('zoe'), 'revision', date '2026-01-15', 149.00)
  returning id into v_revision_zoe;
  perform pg_temp.memoriser('revision_zoe', v_revision_zoe);

  v_chemin := pg_temp.fid('alice')::text || '/' || pg_temp.fid('zoe')::text || '/facture-revision.pdf';
  insert into public.auto_documents (vehicule_id, historique_id, type, titre, chemin, nom_fichier, type_mime, taille_octets)
  values (pg_temp.fid('zoe'), v_revision_zoe, 'facture', 'Révision janvier', v_chemin, 'facture.pdf', 'application/pdf', 120000);
  perform pg_temp.assert((select count(*) = 1 from public.auto_documents where historique_id = v_revision_zoe),
    'documents : la facture doit justifier la révision');

  -- Chemin dans le dossier d'une autre voiture.
  v_state := null;
  begin
    insert into public.auto_documents (vehicule_id, type, chemin, nom_fichier, type_mime, taille_octets)
    values (pg_temp.fid('clio'), 'facture', v_chemin || '2', 'x.pdf', 'application/pdf', 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : chemin d''une autre voiture', v_state, v_msg, '23514', 'auto_document_incoherent');

  -- Chemin au nom de quelqu'un d'autre.
  v_state := null;
  begin
    insert into public.auto_documents (vehicule_id, type, chemin, nom_fichier, type_mime, taille_octets)
    values (pg_temp.fid('zoe'), 'facture', pg_temp.fid('bruno')::text || '/' || pg_temp.fid('zoe')::text || '/y.pdf', 'y.pdf', 'application/pdf', 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : chemin au nom de Bruno', v_state, v_msg, '23514', 'auto_document_incoherent');

  -- Intervention d'une autre voiture.
  v_state := null;
  begin
    insert into public.auto_documents (vehicule_id, historique_id, type, chemin, nom_fichier, type_mime, taille_octets)
    values (pg_temp.fid('clio'), v_revision_zoe, 'facture',
            pg_temp.fid('alice')::text || '/' || pg_temp.fid('clio')::text || '/z.pdf', 'z.pdf', 'application/pdf', 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : justifier l''intervention d''une autre voiture', v_state, v_msg, '23514', 'auto_document_incoherent');

  -- Format refusé.
  v_state := null;
  begin
    insert into public.auto_documents (vehicule_id, type, chemin, nom_fichier, type_mime, taille_octets)
    values (pg_temp.fid('clio'), 'autre', pg_temp.fid('alice')::text || '/' || pg_temp.fid('clio')::text || '/virus.exe', 'virus.exe', 'application/x-msdownload', 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('documents : format refusé', v_state, v_msg, '23514', 'auto_documents_format_accepte');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  select count(*) into v_n from public.auto_documents;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit voir aucun document');

  delete from public.auto_documents;
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit supprimer aucun document');

  v_state := null;
  begin
    insert into public.auto_documents (vehicule_id, type, chemin, nom_fichier, type_mime, taille_octets)
    values (pg_temp.fid('zoe'), 'facture', pg_temp.fid('alice')::text || '/' || pg_temp.fid('zoe')::text || '/pirate.pdf', 'p.pdf', 'application/pdf', 10);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  -- Refusé avant même la RLS : pour Bruno, la voiture d'Alice n'existe pas,
  -- et le message ne le distingue pas d'une voiture inexistante.
  perform pg_temp.assert_echec('isolation : document sur la voiture d''Alice', v_state, v_msg, '23514', 'voiture introuvable');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_n integer;
begin
  perform pg_temp.connecter('alice');

  -- L'intervention supprimée : le document reste, sans rattachement.
  delete from public.auto_historique where id = pg_temp.fid('revision_zoe');
  select count(*) into v_n from public.auto_documents where vehicule_id = pg_temp.fid('zoe') and historique_id is null;
  perform pg_temp.assert(v_n = 1, 'documents : supprimer l''intervention garde le document, détaché');

  reset role;
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO LOT B : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-b-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
