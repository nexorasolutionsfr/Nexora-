-- Contrôles de 20260921000200_debit_envois.sql (base jetable).
-- Chaque contrôle affiche « OK … » ou « KO … ».

select case when to_regprocedure('public.prendre_jeton_envoi(text,uuid,integer,integer,text)') is not null
        and to_regprocedure('public.reporter_notification_debit(text,uuid,text)') is not null
       then 'OK' else 'KO' end || ' les deux fonctions du débit existent';

select case when not has_function_privilege('anon', 'public.prendre_jeton_envoi(text,uuid,integer,integer,text)', 'execute')
             and not has_function_privilege('authenticated', 'public.prendre_jeton_envoi(text,uuid,integer,integer,text)', 'execute')
             and has_function_privilege('service_role', 'public.prendre_jeton_envoi(text,uuid,integer,integer,text)', 'execute')
             and not has_function_privilege('anon', 'public.reporter_notification_debit(text,uuid,text)', 'execute')
             and not has_function_privilege('authenticated', 'public.reporter_notification_debit(text,uuid,text)', 'execute')
       then 'OK' else 'KO' end || ' débit réservé au service (ni anon ni authenticated)';

select case when not has_table_privilege('anon', 'public.envois_debit', 'select')
             and not has_table_privilege('authenticated', 'public.envois_debit', 'select')
             and (select relrowsecurity from pg_class where oid = 'public.envois_debit'::regclass)
       then 'OK' else 'KO' end || ' table du débit fermée (RLS active, ni anon ni authenticated)';

-- Le plafond est COMMUN aux quatre files
do $$
declare r jsonb; n integer;
begin
  delete from public.envois_debit;
  for n in 1..5 loop
    r := public.prendre_jeton_envoi((array['devis','factures','proposition','atelier'])[1 + (n % 4)], gen_random_uuid(), 5, 100, 'wf' || n);
  end loop;
  raise notice '% cinq jetons pris depuis des files différentes', case when (select count(*) from public.envois_debit) = 5 then 'OK' else 'KO' end;

  r := public.prendre_jeton_envoi('devis', gen_random_uuid(), 5, 100, 'wf6');
  raise notice '% le 6e est refusé : le plafond horaire est COMMUN, pas par file (%)',
    case when (r->>'ok')::boolean is false and r->>'motif' = 'plafond horaire atteint' then 'OK' else 'KO' end, coalesce(r->>'motif', '-');

  r := public.prendre_jeton_envoi('devis', gen_random_uuid(), 100, 5, 'wf7');
  raise notice '% le plafond quotidien est respecté aussi',
    case when (r->>'ok')::boolean is false and r->>'motif' = 'plafond quotidien atteint' then 'OK' else 'KO' end;

  update public.envois_debit set pris_le = now() - interval '61 minutes';
  r := public.prendre_jeton_envoi('devis', gen_random_uuid(), 5, 100, 'wf8');
  raise notice '% une heure plus tard, le débit repart (restant %)',
    case when (r->>'ok')::boolean and (r->>'restant_heure')::int = 4 then 'OK' else 'KO' end, coalesce(r->>'restant_heure', '-');

  begin
    r := public.prendre_jeton_envoi('inconnue', gen_random_uuid(), 5, 100, null);
    raise notice 'KO une file inconnue devrait être refusée';
  exception when others then
    raise notice 'OK une file inconnue est refusée';
  end;

  begin
    r := public.prendre_jeton_envoi('devis', gen_random_uuid(), 0, 100, null);
    raise notice 'KO un plafond nul devrait être refusé';
  exception when others then
    raise notice 'OK un plafond invalide est refusé';
  end;
  delete from public.envois_debit;
end $$;

-- Report : la ligne revient en attente et la tentative de la réservation est rendue
do $$
declare g uuid; c uuid; v uuid; d uuid; notif uuid; st text; t integer; env boolean;
begin
  insert into public.garages (nom_garage, email, telephone)
    values ('PROTO jetable débit', 'jetable@nexora-recette.invalid', '0100000000') returning id into g;
  insert into public.clients (garage_id, nom, email)
    values (g, 'Client jetable', 'client.jetable@nexora-recette.invalid') returning id into c;
  insert into public.vehicules (garage_id, client_id, marque, modele, immatriculation)
    values (g, c, 'Renault', 'Clio', 'ZZ-999-ZZ') returning id into v;
  insert into public.devis (garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut)
    values (g, c, v, 100, 120, 'en_attente') returning id into d;

  select id into notif from public.notifications_devis where devis_id = d order by created_at desc limit 1;
  if notif is null then
    insert into public.notifications_devis (devis_id, type, statut) values (d, 'nouveau', 'sans_lien') returning id into notif;
  end if;

  update public.notifications_devis set statut = 'envoi_en_cours', tentatives = 1 where id = notif;
  perform public.reporter_notification_debit('devis', notif);
  select statut, tentatives into st, t from public.notifications_devis where id = notif;
  raise notice '% report : ligne remise en attente, tentative rendue (statut %, tentatives %)',
    case when st = 'en_attente' and t = 0 then 'OK' else 'KO' end, st, t;

  update public.notifications_devis set statut = 'envoye', envoye = true where id = notif;
  perform public.reporter_notification_debit('devis', notif);
  select statut, envoye into st, env from public.notifications_devis where id = notif;
  raise notice '% un envoi déjà clos n''est jamais reporté (statut %)', case when st = 'envoye' and env then 'OK' else 'KO' end, st;

  delete from public.notifications_devis where id = notif;
  delete from public.devis where id = d;
  delete from public.vehicules where id = v;
  delete from public.clients where id = c;
  delete from public.garages where id = g;
end $$;
