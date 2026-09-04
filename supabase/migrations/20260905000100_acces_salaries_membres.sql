-- Accès salariés V1 — 1/6 : appartenance d'un utilisateur à un garage.
--
-- Contexte, relevé en base sur Test (slawilafseganlbghgwx) avant écriture :
-- il n'existe aujourd'hui aucune notion de membre. Tout l'accès repose sur
-- `garages.owner_user_id = auth.uid()`, directement dans 15 policies ou via
-- `public.current_garage_id()`. La table `mecaniciens` est une étiquette
-- d'affectation (nom, couleur, actif) sans aucun lien vers `auth.users`.
--
-- Cette migration crée l'appartenance et son journal. Elle ne modifie aucune
-- policy existante, aucune fonction existante, aucune donnée : le
-- comportement du propriétaire actuel est strictement inchangé après son
-- application. Les droits eux-mêmes sont posés par les migrations 2 à 6.
--
-- Voir docs/architecture/acces-salaries-v1.md, sections B.1 et B.6.

create table public.garage_membres (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('dirigeant', 'accueil', 'mecanicien')),
  mecanicien_id uuid references public.mecaniciens(id) on delete restrict,
  actif boolean not null default true,
  revoked_at timestamptz,
  invite_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garage_membres_unique unique (garage_id, user_id),
  -- Un mécanicien est toujours rattaché à sa fiche d'affectation : sans
  -- elle, aucun ordre de réparation ne peut lui être rapporté et ses RPC
  -- d'atelier n'auraient aucun critère de filtrage. Les deux autres rôles
  -- n'en portent jamais.
  constraint garage_membres_mecanicien_coherent check (
    (role = 'mecanicien' and mecanicien_id is not null)
    or (role <> 'mecanicien' and mecanicien_id is null)
  ),
  -- `actif` et `revoked_at` disent la même chose et ne peuvent pas se
  -- contredire : une adhésion active n'a pas de date de révocation.
  constraint garage_membres_revocation_coherente check (
    (actif = true and revoked_at is null)
    or (actif = false and revoked_at is not null)
  )
);

create index garage_membres_user_idx on public.garage_membres (user_id);
create index garage_membres_garage_idx on public.garage_membres (garage_id);
create index garage_membres_mecanicien_idx on public.garage_membres (mecanicien_id);

comment on table public.garage_membres is
  'Appartenance d''un compte auth à un garage, avec son rôle. Trois rôles stricts : dirigeant (parité avec le propriétaire), accueil (opérationnel client, sans facturation ni réglages ni accès), mecanicien (aucune lecture directe de table, uniquement les RPC atelier sur ses ordres affectés). La révocation est immédiate : actif = false rend faux tout prédicat d''accès dès la requête suivante.';

comment on column public.garage_membres.mecanicien_id is
  'Fiche mecaniciens correspondante. Obligatoire pour le rôle mecanicien : c''est le seul lien entre un compte connecté et ordres_reparation.mecanicien_id. Interdit pour les autres rôles.';

-- Journal append-only des changements d'accès.
create table public.garage_membres_historique (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references public.garage_membres(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  action text not null check (
    action in ('ajout', 'changement_role', 'revocation', 'reactivation')
  ),
  ancien_role text,
  nouveau_role text,
  effectue_par uuid,
  created_at timestamptz not null default now()
);

create index garage_membres_historique_membre_idx
  on public.garage_membres_historique (membre_id, created_at);
create index garage_membres_historique_garage_idx
  on public.garage_membres_historique (garage_id, created_at);

comment on table public.garage_membres_historique is
  'Journal append-only des changements d''accès, écrit exclusivement par le trigger garage_membres_log_historique. Aucun droit INSERT, UPDATE ou DELETE n''est accordé à authenticated, ni directement ni par policy : le journal ne peut être ni forgé ni effacé depuis le client.';

create function public.garage_membres_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger garage_membres_updated_at
  before update on public.garage_membres
  for each row
  execute function public.garage_membres_set_updated_at();

create function public.garage_membres_log_historique()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.garage_membres_historique
      (membre_id, garage_id, action, ancien_role, nouveau_role, effectue_par)
    values (new.id, new.garage_id, 'ajout', null, new.role, auth.uid());
    return new;
  end if;

  if old.actif = true and new.actif = false then
    v_action := 'revocation';
  elsif old.actif = false and new.actif = true then
    v_action := 'reactivation';
  elsif old.role is distinct from new.role then
    v_action := 'changement_role';
  else
    return new;
  end if;

  insert into public.garage_membres_historique
    (membre_id, garage_id, action, ancien_role, nouveau_role, effectue_par)
  values (new.id, new.garage_id, v_action, old.role, new.role, auth.uid());

  return new;
end;
$$;

create trigger garage_membres_historique_trg
  after insert or update on public.garage_membres
  for each row
  execute function public.garage_membres_log_historique();

-- Les deux fonctions ci-dessus ne sont que des corps de trigger : personne
-- ne doit pouvoir les appeler directement. Même verrouillage que
-- 20260902000200_fermer_execute_fonctions_ordre_reparation.sql.
revoke execute on function public.garage_membres_set_updated_at() from public;
revoke execute on function public.garage_membres_set_updated_at() from anon;
revoke execute on function public.garage_membres_set_updated_at() from authenticated;
revoke execute on function public.garage_membres_set_updated_at() from service_role;

revoke execute on function public.garage_membres_log_historique() from public;
revoke execute on function public.garage_membres_log_historique() from anon;
revoke execute on function public.garage_membres_log_historique() from authenticated;
revoke execute on function public.garage_membres_log_historique() from service_role;

alter table public.garage_membres enable row level security;
alter table public.garage_membres_historique enable row level security;

-- Aucune policy d'écriture directe : l'appartenance ne se modifie que par
-- les RPC de la migration 6, qui contrôlent le rôle de l'appelant. Deux
-- lectures seulement sont ouvertes ici, et elles sont volontairement
-- exprimées sans dépendre des fonctions de la migration 2, qui n'existent
-- pas encore à ce point de la chaîne.

-- Un membre voit sa propre adhésion. C'est ce qui permet à l'interface de
-- savoir quel rôle afficher, sans exposer les autres membres.
create policy garage_membres_self_select on public.garage_membres
  for select
  to authenticated
  using (user_id = auth.uid());

-- Le propriétaire voit tous les membres de son garage.
create policy garage_membres_proprietaire_select on public.garage_membres
  for select
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

create policy garage_membres_historique_proprietaire_select
  on public.garage_membres_historique
  for select
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

-- Filet explicite : aucun privilège de table par défaut sur le journal pour
-- le client. Le SELECT ci-dessus reste gouverné par la policy.
revoke insert, update, delete on public.garage_membres_historique from anon;
revoke insert, update, delete on public.garage_membres_historique from authenticated;
revoke insert, update, delete on public.garage_membres from anon;
revoke insert, update, delete on public.garage_membres from authenticated;
