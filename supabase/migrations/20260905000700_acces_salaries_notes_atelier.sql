-- Accès salariés V1 — complément : les constats techniques du mécanicien.
--
-- L'énoncé donne au mécanicien « les constats, photos et notes techniques
-- nécessaires à son travail ». L'audit n'a trouvé aucun support pour cela :
-- `ordres_reparation.notes_internes` est une colonne unique, écrasable, et
-- appartient au suivi interne du garage — la lire reviendrait à exposer au
-- mécanicien des notes qui ne lui sont pas destinées. Les tables
-- `inspections*` portent le contrôle véhicule, rattaché au rendez-vous et
-- non au mécanicien, et sont verrouillées dès la finalisation.
--
-- Cette migration ajoute donc le support manquant, avec la surface la plus
-- petite possible : une note technique, horodatée, rattachée à un ordre de
-- réparation et à son auteur. Append-only : aucune modification, aucune
-- suppression, pour personne.

create table public.ordres_reparation_notes (
  id uuid primary key default gen_random_uuid(),
  ordre_reparation_id uuid not null references public.ordres_reparation(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete restrict,
  auteur_user_id uuid not null default auth.uid(),
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

create index ordres_reparation_notes_ordre_idx
  on public.ordres_reparation_notes (ordre_reparation_id, created_at);

comment on table public.ordres_reparation_notes is
  'Constats techniques saisis pendant l''intervention, rattachés à un ordre de réparation et à leur auteur. Append-only : aucun UPDATE ni DELETE n''est accordé, à personne. Distincte de ordres_reparation.notes_internes, qui reste une note de gestion réservée au dirigeant et à l''accueil.';

alter table public.ordres_reparation_notes enable row level security;

revoke update, delete on public.ordres_reparation_notes from anon;
revoke update, delete on public.ordres_reparation_notes from authenticated;

-- Le dirigeant et le propriétaire par la voie historique.
create policy ordres_reparation_notes_dirigeant on public.ordres_reparation_notes
  for select to authenticated
  using (garage_id = public.current_garage_id());

create policy ordres_reparation_notes_dirigeant_insert on public.ordres_reparation_notes
  for insert to authenticated
  with check (garage_id = public.current_garage_id());

-- L'accueil lit et écrit les notes de son garage.
create policy ordres_reparation_notes_accueil on public.ordres_reparation_notes
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

create policy ordres_reparation_notes_accueil_insert on public.ordres_reparation_notes
  for insert to authenticated
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- Le mécanicien passe par les fonctions ci-dessous, jamais par la table :
-- aucune policy ne le nomme.

create function public.atelier_ajouter_note(p_ordre_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage_id uuid;
  v_note_id uuid;
begin
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'Une note vide ne peut pas être enregistrée';
  end if;

  select o.garage_id into v_garage_id
  from public.ordres_reparation o
  where o.id = p_ordre_id
    and o.mecanicien_id is not null
    and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
    and o.statut <> 'annule';

  if v_garage_id is null then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;

  insert into public.ordres_reparation_notes
    (ordre_reparation_id, garage_id, auteur_user_id, note)
  values (p_ordre_id, v_garage_id, auth.uid(), trim(p_note))
  returning id into v_note_id;

  return v_note_id;
end;
$$;

create function public.atelier_mes_notes(p_ordre_id uuid)
returns table (note_id uuid, note text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ordres_reparation o
    where o.id = p_ordre_id
      and o.mecanicien_id is not null
      and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
  ) then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;

  return query
    select n.id, n.note, n.created_at
    from public.ordres_reparation_notes n
    where n.ordre_reparation_id = p_ordre_id
    order by n.created_at;
end;
$$;

revoke execute on function public.atelier_ajouter_note(uuid, text) from public;
revoke execute on function public.atelier_mes_notes(uuid) from public;
grant execute on function public.atelier_ajouter_note(uuid, text) to authenticated;
grant execute on function public.atelier_mes_notes(uuid) to authenticated;
