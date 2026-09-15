-- Contrôles de 20260921000100_journal_incidents_n8n.sql (base jetable).
-- Chaque contrôle affiche « OK … » ou « KO … ». Joué en supabase_admin ; les
-- droits sont mesurés pour les rôles réels.

create temp table avant as select id, garage_id, workflow_nom, noeud, message, resolu, created_at from public.erreurs_automatisation;

select case when (select prorettype = 'jsonb'::regtype from pg_proc where oid = to_regprocedure('public.journaliser_incident(jsonb)')) then 'OK' else 'KO' end || ' la fonction existe et rend un objet JSON';
select case when not has_function_privilege('anon', 'public.journaliser_incident(jsonb)', 'execute')
             and not has_function_privilege('authenticated', 'public.journaliser_incident(jsonb)', 'execute')
             and has_function_privilege('service_role', 'public.journaliser_incident(jsonb)', 'execute')
       then 'OK' else 'KO' end || ' réservée au service (ni anon ni authenticated)';

do $$
declare a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; n integer; r record;
  base jsonb := '{"categorie":"reseau_avant_reservation","workflow_id":"wfA","workflow_nom":"Facture (socle)","execution_id":"101","noeud":"Réserver la file","message":"The connection cannot be established"}';
begin
  a := (public.journaliser_incident(base)->>'id')::uuid;
  b := (public.journaliser_incident(base || '{"execution_id":"102"}')->>'id')::uuid;
  select occurrences, execution_id into r from public.erreurs_automatisation where id = a;
  raise notice '% erreur répétée regroupée (même ligne, 2 occurrences, dernière exécution gardée)', case when a = b and r.occurrences = 2 and r.execution_id = '102' then 'OK' else 'KO' end;

  c := (public.journaliser_incident(base || '{"workflow_id":"wfB","workflow_nom":"Nouveau devis (socle)"}')->>'id')::uuid;
  raise notice '% même erreur, autre workflow : incident distinct', case when c <> a then 'OK' else 'KO' end;

  d := (public.journaliser_incident('{"categorie":"envoi_incertain","workflow_id":"wfA","noeud":"Notifier facture (email)","notification_file":"factures","notification_id":"11111111-1111-1111-1111-111111111111","intervention_requise":true}')->>'id')::uuid;
  e := (public.journaliser_incident('{"categorie":"envoi_incertain","workflow_id":"wfA","noeud":"Notifier facture (email)","notification_file":"factures","notification_id":"22222222-2222-2222-2222-222222222222","intervention_requise":true}')->>'id')::uuid;
  raise notice '% deux notifications incertaines : deux incidents, intervention requise', case when d <> e and (select bool_and(intervention_requise) from public.erreurs_automatisation where id in (d, e)) then 'OK' else 'KO' end;

  update public.erreurs_automatisation set resolu = true where id = a;
  f := (public.journaliser_incident(base)->>'id')::uuid;
  raise notice '% incident résolu puis répété : nouvelle ligne', case when f <> a then 'OK' else 'KO' end;

  update public.erreurs_automatisation set derniere_le = now() - interval '25 hours' where id = f;
  n := (select count(*) from public.erreurs_automatisation);
  perform public.journaliser_incident(base);
  raise notice '% répétition après 24 h : nouvelle ligne', case when (select count(*) from public.erreurs_automatisation) = n + 1 then 'OK' else 'KO' end;

  a := (public.journaliser_incident('{"categorie":"n_importe_quoi","notification_id":"pas-un-uuid","notification_file":"autre","message":"x"}')->>'id')::uuid;
  select categorie, notification_id, notification_file, message into r from public.erreurs_automatisation where id = a;
  raise notice '% entrée invalide acceptée sans échouer (catégorie inconnu, uuid et file ignorés, cause gardée)', case when r.categorie = 'inconnu' and r.notification_id is null and r.notification_file is null and r.message like 'catégorie inconnue%' then 'OK' else 'KO' end;

  a := (public.journaliser_incident(jsonb_build_object('categorie', 'inconnu', 'message', repeat('x', 5000), 'noeud', repeat('n', 5000)))->>'id')::uuid;
  raise notice '% textes bornés', case when (select length(message) <= 500 and length(noeud) <= 200 from public.erreurs_automatisation where id = a) then 'OK' else 'KO' end;

  a := (public.journaliser_incident('{}')->>'id')::uuid;
  raise notice '% incident vide : journalisé en inconnu', case when (select categorie = 'inconnu' and noeud = 'inconnu' from public.erreurs_automatisation where id = a) then 'OK' else 'KO' end;
end $$;

select case when not exists (
  select 1 from avant v left join public.erreurs_automatisation e on e.id = v.id
   where e.id is null or e.garage_id is distinct from v.garage_id or e.workflow_nom is distinct from v.workflow_nom
      or e.noeud is distinct from v.noeud or e.message is distinct from v.message or e.resolu is distinct from v.resolu
      or e.created_at is distinct from v.created_at)
  then 'OK' else 'KO' end || ' lignes existantes intactes (' || (select count(*) from avant) || ')';

select case when (select count(*) from public.erreurs_automatisation where id in (select id from avant) and (occurrences <> 1 or intervention_requise)) = 0
  then 'OK' else 'KO' end || ' lignes existantes : occurrences 1, pas d''intervention inventée';

select case when (select relrowsecurity from pg_class where oid = 'public.erreurs_automatisation'::regclass) then 'OK' else 'KO' end || ' RLS toujours active';
