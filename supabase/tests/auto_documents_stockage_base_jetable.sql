-- Nexora Auto — lot B : règles du compartiment `auto-documents`.
--
-- BASE JETABLE SEULEMENT, après prelude_stockage_base_jetable.sql et les
-- migrations 20260922000100 → 000300. Sur Test, ces règles se vérifient par
-- un vrai dépôt de fichier depuis l'application (l'API Storage).
--
-- Transaction jamais validée ; marqueur « recette-auto-stockage- ».

begin;

create temporary table _ids (cle text primary key, valeur uuid not null) on commit drop;
insert into _ids values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid());

create function pg_temp.id(p text) returns uuid language sql security definer set search_path = '' as $$
  select valeur from pg_temp._ids where cle = p;
$$;
grant execute on function pg_temp.id(text) to authenticated;

create function pg_temp.connecter(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.id(p)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (pg_temp.id('alice'), 'authenticated', 'authenticated', 'recette-auto-stockage-alice@example.invalid', now(), now()),
  (pg_temp.id('bruno'), 'authenticated', 'authenticated', 'recette-auto-stockage-bruno@example.invalid', now(), now());

do $$
declare
  v_voiture_alice uuid;
  v_voiture_bruno uuid;
  v_etat text;
  v_n integer;
begin
  perform pg_temp.connecter('bruno');
  v_voiture_bruno := public.auto_ajouter_vehicule('Peugeot', '208');
  reset role;

  perform pg_temp.connecter('alice');
  v_voiture_alice := public.auto_ajouter_vehicule('Renault', 'Clio');

  insert into storage.objects (bucket_id, name) values ('auto-documents', pg_temp.id('alice')::text || '/' || v_voiture_alice::text || '/facture.pdf');

  v_etat := null;
  begin
    insert into storage.objects (bucket_id, name) values ('auto-documents', pg_temp.id('alice')::text || '/' || v_voiture_bruno::text || '/x.pdf');
  exception when others then v_etat := sqlstate;
  end;
  if v_etat is distinct from '42501' then raise exception 'ASSERTION FAILED: dépôt dans le dossier d''une voiture de Bruno (obtenu %)', v_etat; end if;

  v_etat := null;
  begin
    insert into storage.objects (bucket_id, name) values ('auto-documents', pg_temp.id('bruno')::text || '/' || v_voiture_alice::text || '/y.pdf');
  exception when others then v_etat := sqlstate;
  end;
  if v_etat is distinct from '42501' then raise exception 'ASSERTION FAILED: dépôt dans le dossier de Bruno (obtenu %)', v_etat; end if;
  reset role;

  perform pg_temp.connecter('bruno');
  select count(*) into v_n from storage.objects where bucket_id = 'auto-documents';
  if v_n <> 0 then raise exception 'ASSERTION FAILED: Bruno voit % fichier(s) d''Alice', v_n; end if;
  delete from storage.objects where bucket_id = 'auto-documents';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ASSERTION FAILED: Bruno a supprimé % fichier(s) d''Alice', v_n; end if;
  reset role;

  perform pg_temp.connecter('alice');
  select count(*) into v_n from storage.objects where bucket_id = 'auto-documents';
  if v_n <> 1 then raise exception 'ASSERTION FAILED: Alice doit voir son fichier (obtenu %)', v_n; end if;
  reset role;

  if (select public from storage.buckets where id = 'auto-documents') then
    raise exception 'ASSERTION FAILED: le compartiment auto-documents ne doit jamais être public';
  end if;

  raise notice 'RECETTE AUTO STOCKAGE : tous les contrôles sont passés';
end;
$$;

rollback;
