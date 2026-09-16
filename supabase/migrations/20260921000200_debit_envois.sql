-- Débit d'envoi COMMUN aux quatre files (devis, factures, proposition, atelier).
--
-- Pourquoi en base et non dans n8n : les quatre workflows tournent séparément
-- et ne se voient pas. Quatre plafonds indépendants ne bornent rien —
-- 4 × 3 lignes par passage donnent, à `*/2` et `*/5`, jusqu'à 198 envois par
-- heure cumulés. Le seul endroit où les quatre se rencontrent est la base.
--
-- Le compteur est un JETON PAR MESSAGE, pris juste avant la remise au
-- fournisseur, dans une transaction sérialisée par verrou consultatif : deux
-- workflows qui demandent en même temps ne peuvent pas dépasser le plafond.
--
-- Un jeton pris n'est jamais rendu, même si le fournisseur refuse ensuite :
-- une tentative refusée a quand même été soumise au fournisseur.
--
-- Le REPORT n'est pas un échec : `reporter_notification_debit` remet la ligne
-- en attente ET rend la tentative consommée par la réservation, sinon
-- l'attente du débit finirait par bloquer la ligne (plafond de 3 tentatives).
--
-- Les plafonds passés par n8n (60/h, 200/jour) sont des CHOIX PROVISOIRES de
-- Nexora, pas des limites Brevo vérifiées. Ils ne garantissent pas le quota
-- global du compte : les e-mails d'authentification Supabase consomment le
-- même quota Brevo sans passer par cette fonction. Voir plan-n8n §9.4.

create table if not exists public.envois_debit (
  id uuid primary key default gen_random_uuid(),
  file text not null check (file in ('devis', 'factures', 'proposition', 'atelier')),
  notification_id uuid,
  workflow_id text,
  pris_le timestamptz not null default now()
);

create index if not exists envois_debit_pris_le on public.envois_debit (pris_le desc);

alter table public.envois_debit enable row level security;
revoke all on table public.envois_debit from public, anon, authenticated;
grant select, insert on table public.envois_debit to service_role;

comment on table public.envois_debit is
  'Un jeton par message remis au fournisseur, toutes files confondues. Sert à borner le débit commun ; ne remplace pas les files.';

-- Prend un jeton si le débit le permet. Rend {ok, restant_heure, restant_jour}.
create or replace function public.prendre_jeton_envoi(
  p_file text,
  p_id uuid,
  p_limite_heure integer default 60,
  p_limite_jour integer default 200,
  p_workflow_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heure integer;
  v_jour integer;
begin
  if p_file is null or p_file not in ('devis', 'factures', 'proposition', 'atelier') then
    raise exception 'file inconnue : %', p_file using errcode = '22023';
  end if;
  if p_limite_heure is null or p_limite_heure < 1 or p_limite_jour is null or p_limite_jour < 1 then
    raise exception 'plafonds invalides' using errcode = '22023';
  end if;

  -- Un seul demandeur à la fois, quelle que soit la file : c'est ce qui rend
  -- le plafond commun vrai face à quatre workflows simultanés.
  perform pg_advisory_xact_lock(hashtext('nexora:debit_envois'));

  select count(*) into v_heure from public.envois_debit where pris_le > now() - interval '1 hour';
  select count(*) into v_jour from public.envois_debit where pris_le > now() - interval '24 hours';

  if v_heure >= p_limite_heure or v_jour >= p_limite_jour then
    return jsonb_build_object(
      'ok', false,
      'restant_heure', greatest(p_limite_heure - v_heure, 0),
      'restant_jour', greatest(p_limite_jour - v_jour, 0),
      'motif', case when v_jour >= p_limite_jour then 'plafond quotidien atteint' else 'plafond horaire atteint' end);
  end if;

  insert into public.envois_debit (file, notification_id, workflow_id) values (p_file, p_id, left(p_workflow_id, 64));
  return jsonb_build_object('ok', true, 'restant_heure', p_limite_heure - v_heure - 1, 'restant_jour', p_limite_jour - v_jour - 1);
end;
$$;

revoke all on function public.prendre_jeton_envoi(text, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.prendre_jeton_envoi(text, uuid, integer, integer, text) to service_role;

-- Remet en attente une ligne réservée que le débit ne permet pas d'envoyer,
-- SANS compter la réservation comme une tentative (ce n'est pas un échec).
create or replace function public.reporter_notification_debit(
  p_file text,
  p_id uuid,
  p_motif text default 'report : débit d''envoi atteint')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_reporte integer;
begin
  v_table := case p_file
    when 'devis' then 'notifications_devis'
    when 'factures' then 'notifications_factures'
    when 'proposition' then 'notifications_proposition'
    when 'atelier' then 'notifications_atelier'
  end;
  if v_table is null then
    raise exception 'file inconnue : %', p_file using errcode = '22023';
  end if;

  execute format(
    'update public.%I set statut = ''en_attente'', tentatives = greatest(coalesce(tentatives, 1) - 1, 0), derniere_erreur = $2
      where id = $1 and statut = ''envoi_en_cours''', v_table)
    using p_id, left(p_motif, 500);
  get diagnostics v_reporte = row_count;
  return jsonb_build_object('reporte', v_reporte = 1);
end;
$$;

revoke all on function public.reporter_notification_debit(text, uuid, text) from public, anon, authenticated;
grant execute on function public.reporter_notification_debit(text, uuid, text) to service_role;
