-- Journal des incidents n8n : réutilise `erreurs_automatisation`.
--
-- Additif seulement : aucune ligne existante n'est modifiée ni supprimée,
-- aucune colonne existante ne change. Les anciennes lignes (Assistant Garage,
-- archivé) gardent occurrences = 1 et categorie = null.
--
-- Ce que le journal doit permettre :
--   - savoir quel workflow, quelle exécution, quelle étape, quand, quelle
--     catégorie ;
--   - regrouper une erreur répétée (même signature, non résolue, vue depuis
--     moins de 24 h) sans fondre deux incidents distincts : la signature
--     contient la notification concernée ;
--   - retrouver ce qui exige une intervention (`intervention_requise`).
--
-- Le journal n'est PAS la source de vérité d'un envoi : c'est la file
-- (`notifications_*.statut`, `derniere_erreur`). Un journal indisponible ne
-- fait rien perdre ; `docs/architecture/plan-n8n-2026-09-14.md` décrit le
-- recours.
--
-- Écriture par la seule RPC `journaliser_incident`, réservée au service. Elle
-- rend un objet JSON (id, occurrences) : n8n refuse un uuid nu comme réponse
-- (recette du 15 sept.).

create table if not exists public.erreurs_automatisation (
  id uuid default gen_random_uuid() not null primary key,
  garage_id uuid references public.garages(id),
  workflow_nom text,
  noeud text,
  message text,
  resolu boolean default false,
  created_at timestamptz default now()
);

alter table public.erreurs_automatisation
  add column if not exists workflow_id text,
  add column if not exists execution_id text,
  add column if not exists categorie text,
  add column if not exists signature text,
  add column if not exists occurrences integer not null default 1,
  add column if not exists premiere_le timestamptz,
  add column if not exists derniere_le timestamptz,
  add column if not exists notification_file text,
  add column if not exists notification_id uuid,
  add column if not exists intervention_requise boolean not null default false;

comment on column public.erreurs_automatisation.categorie is
  'reseau_avant_reservation | reservation_sans_reponse | echec_avant_envoi | donnees_invalides | refus_temporaire | refus_temporaire_repete | refus_definitif | envoi_incertain | cloture_echouee | echec_workflow | inconnu';
comment on column public.erreurs_automatisation.intervention_requise is
  'vrai quand un humain doit vérifier (envoi incertain, clôture échouée, réservation sans réponse, blocage)';

create index if not exists erreurs_automatisation_ouvertes_signature
  on public.erreurs_automatisation (signature, derniere_le desc)
  where resolu is not true;

-- Test a reçu une première version qui rendait uuid : on ne peut pas changer
-- le type de retour sur place. Sans effet en Production (fonction absente).
do $$ begin
  if exists (select 1 from pg_proc where oid = to_regprocedure('public.journaliser_incident(jsonb)') and prorettype = 'uuid'::regtype) then
    drop function public.journaliser_incident(jsonb);
  end if;
end $$;

create or replace function public.journaliser_incident(p_incident jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categorie text := coalesce(nullif(p_incident->>'categorie', ''), 'inconnu');
  v_workflow_id text := left(nullif(p_incident->>'workflow_id', ''), 64);
  v_workflow_nom text := left(nullif(p_incident->>'workflow_nom', ''), 200);
  v_execution text := left(nullif(p_incident->>'execution_id', ''), 64);
  v_noeud text := left(coalesce(nullif(p_incident->>'noeud', ''), 'inconnu'), 200);
  v_file text := nullif(p_incident->>'notification_file', '');
  v_notif uuid;
  v_message text := left(coalesce(p_incident->>'message', ''), 500);
  v_intervention boolean := coalesce((p_incident->>'intervention_requise')::boolean, false);
  v_signature text;
  v_id uuid;
  v_occurrences integer;
begin
  if v_categorie not in ('reseau_avant_reservation', 'reservation_sans_reponse', 'echec_avant_envoi',
      'donnees_invalides', 'refus_temporaire', 'refus_temporaire_repete', 'refus_definitif',
      'envoi_incertain', 'cloture_echouee', 'echec_workflow', 'inconnu') then
    v_message := left('catégorie inconnue « ' || v_categorie || ' » : ' || v_message, 500);
    v_categorie := 'inconnu';
  end if;
  if v_file is not null and v_file not in ('devis', 'factures', 'proposition', 'atelier') then
    v_file := null;
  end if;
  begin
    v_notif := nullif(p_incident->>'notification_id', '')::uuid;
  exception when invalid_text_representation then
    v_notif := null;
  end;

  v_signature := md5(concat_ws('|', v_categorie, v_workflow_id, v_noeud, v_file, v_notif::text));
  perform pg_advisory_xact_lock(hashtext('journaliser_incident:' || v_signature));

  update public.erreurs_automatisation e
     set occurrences = e.occurrences + 1,
         derniere_le = now(),
         execution_id = coalesce(v_execution, e.execution_id),
         message = v_message,
         intervention_requise = e.intervention_requise or v_intervention
   where e.id = (
     select x.id from public.erreurs_automatisation x
      where x.signature = v_signature
        and x.resolu is not true
        and x.derniere_le > now() - interval '24 hours'
      order by x.derniere_le desc
      limit 1)
  returning e.id, e.occurrences into v_id, v_occurrences;

  if v_id is null then
    insert into public.erreurs_automatisation
      (workflow_nom, noeud, message, resolu, workflow_id, execution_id, categorie, signature,
       occurrences, premiere_le, derniere_le, notification_file, notification_id, intervention_requise)
    values
      (v_workflow_nom, v_noeud, v_message, false, v_workflow_id, v_execution, v_categorie, v_signature,
       1, now(), now(), v_file, v_notif, v_intervention)
    returning id, occurrences into v_id, v_occurrences;
  end if;
  return jsonb_build_object('id', v_id, 'occurrences', v_occurrences);
end;
$$;

revoke all on function public.journaliser_incident(jsonb) from public, anon, authenticated;
grant execute on function public.journaliser_incident(jsonb) to service_role;
