-- Nexora Auto — accès contrôlé (fermé, bêta, ouvert) — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922001100 appliquées. Jamais Production.
-- Marqueur « recette-auto-acces- ». Transaction jamais validée.
--
-- Le comportement du stockage (dépôt, lecture, suppression d'un fichier) est
-- éprouvé par la vraie API : scripts/recette/acces-croises.mjs.

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

insert into _fixture_ids (cle, valeur) values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid()), ('claire', gen_random_uuid());

-- Alice : invitée, adresse confirmée (majuscules comprises). Bruno : confirmé,
-- non invité. Claire : invitée, adresse NON confirmée.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'Recette-Auto-Acces-Alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(), '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-acces-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(), '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('claire'), 'authenticated', 'authenticated', 'recette-auto-acces-claire-' || pg_temp.fid('claire')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', null, '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

insert into public.auto_acces_beta (email, note)
select lower(email), 'banc' from auth.users where id in (pg_temp.fid('alice'), pg_temp.fid('claire'));

-- Dossier d'Alice, mode ouvert.
update public.auto_acces_parametres set mode = 'ouvert';

do $$
declare
  v_id uuid;
begin
  perform pg_temp.connecter('alice');
  v_id := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  perform pg_temp.memoriser('clio', v_id);
  insert into public.auto_releves_km (vehicule_id, kilometrage, releve_le) values (v_id, 50000, date '2026-09-01');
end;
$$;
reset role;

-- =====================================================================
-- 1. Fermé : personne, pas même Alice
-- =====================================================================

update public.auto_acces_parametres set mode = 'ferme';

do $$
declare
  v_state text;
  v_msg text;
  v_n integer;
begin
  perform pg_temp.connecter('alice');
  perform pg_temp.assert(public.auto_etat_acces() = '{"mode": "ferme", "autorise": false}'::jsonb, 'fermé : état affiché');
  select count(*) into v_n from public.auto_vehicules;
  perform pg_temp.assert(v_n = 0, 'fermé : Alice ne voit plus sa voiture');
  select count(*) into v_n from public.auto_releves_km;
  perform pg_temp.assert(v_n = 0, 'fermé : ni ses relevés');
  v_state := null;
  begin
    perform public.auto_ajouter_vehicule('Peugeot', '208', 2020);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = '42501', 'fermé : aucune voiture ajoutée (' || coalesce(v_state, 'aucune erreur') || ')');
  with m as (update public.auto_releves_km set kilometrage = 1 returning 1) select count(*) into v_n from m;
  perform pg_temp.assert(v_n = 0, 'fermé : aucune modification');
end;
$$;
reset role;

do $$
begin
  perform pg_temp.assert((select count(*) from public.auto_releves_km where vehicule_id = pg_temp.fid('clio') and kilometrage = 50000) = 1, 'fermé : les données restent en base, intactes');
end;
$$;

-- =====================================================================
-- 2. Bêta : les adresses invitées ET confirmées
-- =====================================================================

update public.auto_acces_parametres set mode = 'beta';

do $$
declare
  v_n integer;
  v_state text;
begin
  perform pg_temp.connecter('alice');
  perform pg_temp.assert(public.auto_etat_acces() = '{"mode": "beta", "autorise": true}'::jsonb, 'bêta : Alice invitée, malgré les majuscules de son adresse');
  select count(*) into v_n from public.auto_vehicules;
  perform pg_temp.assert(v_n = 1, 'bêta : Alice retrouve sa voiture');
  perform public.auto_ajouter_vehicule('Peugeot', '208', 2020);
  reset role;

  perform pg_temp.connecter('bruno');
  perform pg_temp.assert(public.auto_etat_acces() = '{"mode": "beta", "autorise": false}'::jsonb, 'bêta : Bruno non invité');
  v_state := null;
  begin
    perform public.auto_ajouter_vehicule('Fiat', '500', 2015);
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'bêta : Bruno n''ajoute pas de voiture');
  v_state := null;
  begin
    insert into public.auto_preferences (proprietaire_id, horizon_jours) values (pg_temp.fid('bruno'), 30);
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'bêta : Bruno n''écrit pas de préférences');
  reset role;

  perform pg_temp.connecter('claire');
  perform pg_temp.assert((public.auto_etat_acces() ->> 'autorise')::boolean = false, 'bêta : Claire invitée mais adresse non confirmée');
  select count(*) into v_n from public.auto_vehicules;
  perform pg_temp.assert(v_n = 0, 'bêta : Claire ne lit rien');
end;
$$;
reset role;

-- =====================================================================
-- 3. Ouvert : tout compte connecté, chacun son dossier
-- =====================================================================

update public.auto_acces_parametres set mode = 'ouvert';

do $$
declare
  v_n integer;
begin
  perform pg_temp.connecter('bruno');
  perform pg_temp.assert((public.auto_etat_acces() ->> 'autorise')::boolean, 'ouvert : Bruno accède');
  perform public.auto_ajouter_vehicule('Fiat', '500', 2015);
  select count(*) into v_n from public.auto_vehicules;
  perform pg_temp.assert(v_n = 1, 'ouvert : Bruno ne voit que sa voiture');
end;
$$;
reset role;

-- =====================================================================
-- 4. Réglages protégés, politiques en place
-- =====================================================================

do $$
declare
  v_state text;
begin
  perform pg_temp.connecter('alice');
  v_state := null;
  begin
    perform 1 from public.auto_acces_parametres;
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'une personne connectée ne lit pas le mode');
  v_state := null;
  begin
    insert into public.auto_acces_beta (email) values ('intrus@example.invalid');
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'une personne connectée ne s''invite pas');
  v_state := null;
  begin
    update public.auto_acces_parametres set mode = 'ouvert';
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'une personne connectée ne change pas le mode');
end;
$$;
reset role;

do $$
begin
  perform pg_temp.assert(not has_function_privilege('anon', 'public.auto_etat_acces()', 'EXECUTE') and not has_function_privilege('anon', 'public.auto_acces_autorise()', 'EXECUTE'), 'anon : aucune fonction d''accès');
  perform pg_temp.assert((
    select count(*) from pg_policies
    where schemaname = 'public' and policyname = 'auto_acces_restreint' and permissive = 'RESTRICTIVE'
      and tablename in ('auto_vehicules', 'auto_releves_km', 'auto_historique', 'auto_documents', 'auto_taches', 'auto_preferences', 'auto_rappels_reports', 'auto_lectures')
  ) = 8, 'politiques restrictives sur les 8 tables de données personnelles');
  perform pg_temp.assert(exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'auto_documents_stockage_acces' and permissive = 'RESTRICTIVE'
      and qual like '%bucket_id <> ''auto-documents''%'
  ), 'stockage : politique restrictive limitée au compartiment Nexora Auto');
  perform pg_temp.assert(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('auto_acces_parametres', 'auto_acces_beta') and not c.relrowsecurity
  ), 'réglages : RLS activée');
end;
$$;

-- =====================================================================
-- 5. Stockage : fermé pour Nexora Auto, inchangé pour les autres compartiments
-- =====================================================================
-- Un compartiment « comme Nexora Pro » et sa politique d'écriture, créés dans
-- la transaction (annulés avec elle).

update public.auto_acces_parametres set mode = 'ferme';
insert into storage.buckets (id, name, public) values ('banc-acces-autre', 'banc-acces-autre', false) on conflict (id) do nothing;
create policy banc_acces_autre_ecriture on storage.objects for insert to authenticated
  with check (bucket_id = 'banc-acces-autre');

do $$
declare
  v_state text;
begin
  perform pg_temp.connecter('bruno');
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('banc-acces-autre', pg_temp.fid('bruno')::text || '/fichier.pdf', pg_temp.fid('bruno'));
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state is null, 'stockage : un autre compartiment reste utilisable, Nexora Auto fermé (' || coalesce(v_state, 'ok') || ')');
  v_state := null;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('auto-documents', pg_temp.fid('bruno')::text || '/' || gen_random_uuid()::text || '/f.pdf', pg_temp.fid('bruno'));
  exception when others then v_state := sqlstate;
  end;
  perform pg_temp.assert(v_state = '42501', 'stockage : aucun dépôt dans auto-documents, Nexora Auto fermé');
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO ACCÈS : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where lower(email) like 'recette-auto-acces-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
