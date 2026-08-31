-- Revenue Recovery V1 — fondations (lot 1/2 : éligibilité et permissions).
-- Migration additive, idempotente, non destructive.
--
-- Un `client_id` non nul ne prouve à lui seul aucune éligibilité : cette
-- table journalise, pour chaque (garage, client, canal), la décision
-- explicite qui établit — ou non — le droit de solliciter ce client, et sur
-- quelle base. Absence de ligne = statut "inconnu", jamais "autorise" par
-- défaut. Ceci structure la décision, ce n'est pas un avis juridique : la
-- base légale exacte reste à confirmer avec un juriste avant tout envoi
-- réel (voir dossier de décision Revenue Recovery).
--
-- Éligibilité et permission-canal sont journalisées dans une seule table
-- plutôt que deux : dans la pratique, le garage établit les deux faits au
-- même instant, par la même action ("ce travail différé concerne bien un
-- client existant, pour l'email X, avec cette preuve"). Deux tables
-- obligeraient à les insérer en lock-step et doubleraient le risque de
-- désynchronisation déjà rencontré deux fois sur ce projet (GRANT oublié,
-- champ jamais mis à jour). Journal append-only + état courant dérivé par
-- vue plutôt qu'une table d'état dupliquée : c'est le pattern déjà validé
-- en production par opportunites_actions, l'équipe sait déjà l'opérer, et
-- ça élimine tout risque de drift entre un état stocké et son historique.

create table if not exists public.revenue_recovery_permissions (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  -- RESTRICT, pas CASCADE : la suppression d'un client ne doit jamais
  -- effacer silencieusement la preuve d'une décision d'éligibilité passée.
  -- Voir note "suppression / anonymisation" en fin de fichier.
  client_id uuid not null references public.clients(id) on delete restrict,
  -- Travail différé concerné, quand la décision porte sur un cas précis (le
  -- cas normal en V1). Laissé nul pour une décision plus générale sur le
  -- client (ex. opposition globale email), réutilisable au-delà d'un seul
  -- travail différé. Nullable : RESTRICT ne bloque alors rien tant qu'aucun
  -- travail différé précis n'est réellement référencé.
  travail_differe_id uuid references public.travaux_differes(id) on delete restrict,
  canal text not null check (canal in ('email')),
  statut text not null check (statut in ('inconnu', 'autorise', 'oppose', 'expire', 'revoque')),
  -- Obligatoire uniquement pour "autorise" : sur quoi repose l'éligibilité
  -- (prestation réellement achetée/réalisée, service analogue, droit
  -- d'opposition proposé à la collecte...).
  base_eligibilite text,
  -- D'où vient l'information (ex. "devis accepté le ...", "déclaratif
  -- garage", "collecte formulaire web").
  origine text not null,
  -- Pointeur vers une preuve traçable (id de devis/facture/inspection, ou
  -- texte libre) — jamais la preuve elle-même stockée en clair ici.
  preuve_reference text,
  motif text,
  enregistre_par uuid not null,
  created_at timestamptz not null default now(),
  constraint revenue_recovery_permissions_autorise_justifie check (
    statut <> 'autorise' or (
      base_eligibilite is not null and length(trim(base_eligibilite)) > 0
      and preuve_reference is not null and length(trim(preuve_reference)) > 0
    )
  )
);

create index if not exists revenue_recovery_permissions_lookup_idx
  on public.revenue_recovery_permissions (garage_id, client_id, canal, created_at desc);

comment on table public.revenue_recovery_permissions is
  'Journal append-only des décisions d''éligibilité et de permission de contact par canal. La ligne la plus récente par (garage_id, client_id, canal) fait foi — voir la vue revenue_recovery_permissions_courant. Aucun statut "autorise" n''est créé automatiquement : absence de ligne = inconnu.';

-- Identité et horodatage forcés côté serveur, jamais fournis par le client
-- (même garde que opportunites_actions_forcer_identite, déjà en prod).
create or replace function public.revenue_recovery_permissions_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.enregistre_par := auth.uid();
  new.created_at := now();
  -- Cohérence inter-garages : le RLS vérifie que garage_id appartient à
  -- l'appelant, mais ne vérifie pas que travail_differe_id référence bien
  -- un travail différé du MÊME garage. Sans ce contrôle, un client_id et
  -- un garage_id valides pourraient être associés à un travail différé
  -- d'un autre garage.
  if new.travail_differe_id is not null then
    if not exists (
      select 1 from public.travaux_differes
      where id = new.travail_differe_id and garage_id = new.garage_id
    ) then
      raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists revenue_recovery_permissions_avant_insert on public.revenue_recovery_permissions;
create trigger revenue_recovery_permissions_avant_insert
  before insert on public.revenue_recovery_permissions
  for each row
  execute function public.revenue_recovery_permissions_forcer_identite();

-- État courant dérivé : dernière ligne par (garage_id, client_id, canal).
-- security_invoker : la vue applique le RLS de l'appelant, pas celui du
-- propriétaire de la vue — sans quoi une vue pourrait silencieusement
-- contourner l'isolation par garage.
create or replace view public.revenue_recovery_permissions_courant
with (security_invoker = true) as
select distinct on (garage_id, client_id, canal)
  garage_id, client_id, travail_differe_id, canal, statut,
  base_eligibilite, origine, preuve_reference, enregistre_par, created_at
from public.revenue_recovery_permissions
order by garage_id, client_id, canal, created_at desc, id desc;

comment on view public.revenue_recovery_permissions_courant is
  'Statut courant par (garage_id, client_id, canal), dérivé de la dernière ligne du journal (created_at desc, id desc en cas d''égalité stricte d''horodatage — ordre totalement déterministe). created_at étant forcé serveur (jamais falsifiable), la plus récente décision est toujours la plus récente réelle : une opposition l''emporte donc naturellement sur toute autorisation antérieure, sans logique de priorité séparée à maintenir.';

alter table public.revenue_recovery_permissions enable row level security;

drop policy if exists revenue_recovery_permissions_isolation on public.revenue_recovery_permissions;
create policy revenue_recovery_permissions_isolation on public.revenue_recovery_permissions
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

-- Pas de grant update/delete : journal immuable, uniquement complété.
grant select, insert on public.revenue_recovery_permissions to authenticated;
grant select on public.revenue_recovery_permissions_courant to authenticated;

-- Suppression / anonymisation (risque ouvert, assumé) : RESTRICT sur
-- client_id/travail_differe_id signifie que la suppression d'un client ou
-- d'un travail différé échouera tant qu'une ligne de ce journal les
-- référence. Aucune conséquence aujourd'hui (table vide), mais une
-- procédure d'anonymisation dédiée (conserver la preuve de la décision,
-- détacher l'identité) sera nécessaire avant qu'un vrai historique
-- s'accumule — décision explicitement non prise dans ce lot.
