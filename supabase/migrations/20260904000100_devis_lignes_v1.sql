-- Devis multi-lignes V1 — schéma additif.
-- Référence : docs/architecture/devis-multi-lignes-v1.md (contrat validé,
-- section B issue d'un audit en lecture seule mené sur Test puis Production le
-- 2026-09-04).
--
-- Additif : crée UNE table neuve (devis_lignes) et ses objets associés, plus
-- deux triggers de garde-fou. Ne modifie le SCHÉMA d'aucune table existante :
-- aucune colonne n'est ajoutée, renommée ou supprimée sur devis, factures,
-- rendez_vous, clients, vehicules, garages, prestations. Aucun DROP, aucune
-- donnée réparée, aucun historique de migration touché.
--
-- Deux objets se posent néanmoins SUR public.devis, volontairement et
-- conformément au contrat (section G) : un trigger BEFORE UPDATE OR DELETE
-- (garde-fou d'immuabilité) et un trigger AFTER sur devis_lignes qui met à jour
-- les colonnes montant_ht / montant_ttc DÉJÀ EXISTANTES de devis. Ce sont des
-- ajouts de comportement, pas des modifications de structure.
--
-- Migration volontairement NON idempotente : aucun IF NOT EXISTS, aucun OR
-- REPLACE, aucun DROP ... IF EXISTS. Tous les noms sont neufs (vérifié à
-- l'audit : ni la table devis_lignes ni aucune fonction devis_lignes* n'existe
-- sur Test ou en Production). En cas de collision, elle doit échouer
-- bruyamment plutôt qu'écraser un objet préexistant.

-- =====================================================================
-- 1. Statuts de devis modifiables — source unique de la règle
-- =====================================================================
-- Contrat G.4, figé sur constat : l'audit du 2026-09-04 relève en Production
-- refuse (7), en_attente (4), accepte (3) sur 14 devis — aucun brouillon,
-- aucun NULL. brouillon est néanmoins autorisé : aucune ligne existante ne le
-- porte, donc l'admettre ne déverrouille aucune donnée, et l'application le
-- connaît. La règle est FERMÉE PAR DÉFAUT : devis.statut n'ayant aucune
-- contrainte CHECK, tout statut inconnu — et NULL — est traité comme
-- verrouillé.

create function public.devis_statut_modifiable(p_statut text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_statut is not null and p_statut in ('brouillon', 'en_attente');
$$;

comment on function public.devis_statut_modifiable(text) is
  'Vrai si un devis dans ce statut accepte encore des modifications (lignes, champs, suppression). Fermé par défaut : NULL et tout statut inconnu renvoient faux. Source unique de la règle d''immuabilité — voir docs/architecture/devis-multi-lignes-v1.md section G.4.';

-- =====================================================================
-- 2. Table devis_lignes
-- =====================================================================

create table public.devis_lignes (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete restrict,
  type text not null constraint devis_lignes_type_valide check (type in ('main_oeuvre', 'piece')),
  libelle text not null constraint devis_lignes_libelle_non_vide check (length(btrim(libelle)) > 0),
  quantite numeric(10,3) not null constraint devis_lignes_quantite_positive check (quantite > 0),
  prix_unitaire_ht numeric(12,2) not null constraint devis_lignes_prix_positif check (prix_unitaire_ht >= 0),
  taux_tva numeric(5,2) not null constraint devis_lignes_taux_tva_borne check (taux_tva >= 0 and taux_tva <= 100),
  position integer not null default 0,
  prestation_id uuid references public.prestations(id) on delete set null,
  montant_ht numeric(12,2)
    generated always as (round(quantite * prix_unitaire_ht, 2)) stored,
  montant_tva numeric(12,2)
    generated always as (round(round(quantite * prix_unitaire_ht, 2) * taux_tva / 100, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Règle d'arrondi figée (contrat D.3) : arrondi à 2 décimales PAR LIGNE, HT
-- puis TVA, ensuite somme des lignes — jamais l'inverse. Les deux colonnes sont
-- GENERATED ALWAYS ... STORED : le calcul est imposé par PostgreSQL, aucun
-- chemin d'écriture ne peut produire une ligne incohérente.
--
-- type reprend à l'identique les deux valeurs de ordres_reparation_lignes, pour
-- que la reprise devis -> OR soit une copie sans traduction.
--
-- taux_tva est borné en PLAGE et non par liste blanche (contrat D.4) : une
-- liste figée bloquerait des taux légitimes, notamment outre-mer.
--
-- prix_unitaire_ht >= 0 interdit volontairement les montants négatifs : pas de
-- remise en V1 (contrat E.4), une remise globale n'ayant pas de ventilation
-- unique correcte lorsque plusieurs taux de TVA coexistent.

create index devis_lignes_devis_idx on public.devis_lignes (devis_id);
create index devis_lignes_garage_idx on public.devis_lignes (garage_id);
create index devis_lignes_position_idx on public.devis_lignes (devis_id, position);

comment on table public.devis_lignes is
  'Lignes main-d''œuvre / pièces d''un devis. Prix unitaire HT et taux de TVA sont FIGÉS sur la ligne à la saisie : prestation_id n''enregistre qu''une provenance, jamais une source de vérité relue à l''affichage. montant_ht et montant_tva sont calculés par la base. Un devis verrouillé (voir devis_statut_modifiable) n''accepte plus aucune écriture de ligne.';

-- =====================================================================
-- 3. updated_at automatique
-- =====================================================================

create function public.devis_lignes_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger devis_lignes_updated_at
  before update on public.devis_lignes
  for each row
  execute function public.devis_lignes_set_updated_at();

-- =====================================================================
-- 4. Intégrité inter-garage + immuabilité, côté lignes (contrat F.3 et G.1)
-- =====================================================================
-- SECURITY INVOKER (défaut) : cette fonction ne relit que devis et prestations,
-- déjà isolées par garage via leurs propres policies RLS. La visibilité de
-- l'appelant est donc bornée à son garage, et l'égalité est vérifiée
-- explicitement par-dessus.

create function public.devis_lignes_check_integrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_devis_garage uuid;
  v_devis_statut text;
  v_prestation_garage uuid;
  v_devis_id uuid;
  v_trouve boolean;
begin
  v_devis_id := case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;

  select d.garage_id, d.statut, true
    into v_devis_garage, v_devis_statut, v_trouve
    from public.devis d
    where d.id = v_devis_id;

  -- Suppression en cascade : lorsqu'un devis modifiable est supprimé, ses
  -- lignes sont retirées APRÈS la ligne parente, qui n'existe donc plus ici.
  -- On laisse passer — ce n'est pas un trou, la suppression d'un devis
  -- verrouillé est déjà refusée en amont par devis_check_immuabilite, donc une
  -- cascade ne peut provenir que d'un devis modifiable (contrat G.1).
  if not coalesce(v_trouve, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'devis_lignes: devis introuvable ou hors garage';
  end if;

  -- Immuabilité (contrat G.1) : aucune écriture de ligne sur un devis
  -- verrouillé, ni insertion, ni modification, ni suppression.
  if not public.devis_statut_modifiable(v_devis_statut) then
    raise exception
      'devis_lignes: le devis est verrouille (statut=%), ses lignes ne peuvent plus etre modifiees',
      coalesce(v_devis_statut, 'NULL');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_devis_garage is distinct from new.garage_id then
    raise exception 'devis_lignes: garage_id incoherent avec le devis parent';
  end if;

  if new.prestation_id is not null then
    select p.garage_id into v_prestation_garage
      from public.prestations p
      where p.id = new.prestation_id;

    if not found or v_prestation_garage is distinct from new.garage_id then
      raise exception 'devis_lignes: prestation hors garage';
    end if;
  end if;

  return new;
end;
$$;

create trigger devis_lignes_check_integrite_trigger
  before insert or update or delete on public.devis_lignes
  for each row
  execute function public.devis_lignes_check_integrite();

-- =====================================================================
-- 5. Immuabilité réelle du devis verrouillé (contrat G.2)
-- =====================================================================
-- Verrouillage TOTAL, pas partiel : ne protéger que les montants laisserait un
-- devis accepté vidé de son client, son message réécrit, ou supprimé. La
-- décision porte sur OLD.statut — l'état AVANT modification — jamais sur NEW :
-- la transition en_attente -> accepte / refuse avec date_validation reste donc
-- permise, y compris via repondre_devis_par_jeton et repondre_devis_public.
--
-- SECURITY INVOKER : la fonction ne lit que la ligne déjà en cours de
-- modification, aucun privilège supplémentaire n'est requis.
--
-- Ce trigger est BEFORE. Les deux triggers de notification déjà présents sur
-- devis (trg_notifier_nouveau_devis, trg_notifier_devis_maj) sont AFTER : un
-- refus annule la transaction avant eux, aucune notification parasite n'est
-- donc émise sur une tentative bloquée (contrat B.4).

create function public.devis_check_immuabilite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.devis_statut_modifiable(old.statut) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'devis: un devis verrouille (statut=%) ne peut pas etre supprime',
      coalesce(old.statut, 'NULL');
  end if;

  raise exception
    'devis: un devis verrouille (statut=%) ne peut plus etre modifie',
    coalesce(old.statut, 'NULL');
end;
$$;

create trigger devis_check_immuabilite_trigger
  before update or delete on public.devis
  for each row
  execute function public.devis_check_immuabilite();

comment on function public.devis_check_immuabilite() is
  'Garde-fou d''immuabilite : un devis dont le statut n''est plus modifiable est integralement fige — aucun champ modifiable, aucune suppression. La decision porte sur OLD.statut, ce qui laisse passer la transition en_attente -> accepte/refuse. Voir docs/architecture/devis-multi-lignes-v1.md section G.2.';

-- =====================================================================
-- 6. Totaux du devis, déterministes (contrat E)
-- =====================================================================
-- SECURITY DEFINER : le rôle garage authentifié écrit dans devis_lignes, pas
-- nécessairement dans devis par ce chemin ; la mise à jour des totaux ne doit
-- pas dépendre de ses privilèges propres. search_path vide, corps minimal,
-- toutes références qualifiées.
--
-- IMPORTANT : ne s'exécute que lorsqu'une ligne est écrite. Un devis historique
-- sans ligne n'est JAMAIS recalculé ni écrasé — y compris celui, relevé en
-- Production par l'audit, dont montant_ht est NULL (contrat B.7 et E.3).

create function public.devis_lignes_recalculer_totaux()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devis_id uuid;
  v_ht numeric;
  v_ttc numeric;
begin
  v_devis_id := case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;

  select coalesce(sum(l.montant_ht), 0),
         coalesce(sum(l.montant_ht + l.montant_tva), 0)
    into v_ht, v_ttc
    from public.devis_lignes l
   where l.devis_id = v_devis_id;

  -- L'UPDATE n'est émis QUE si un total change réellement. Un UPDATE sans
  -- effet déclencherait quand même les triggers AFTER de devis : c'est le
  -- couplage que cette clause coupe. Aujourd'hui notifier_devis_maj ne réagit
  -- qu'aux transitions de statut et resterait donc muette de toute façon ;
  -- cette clause fait que le lot ne dépend pas de ce détail d'implémentation
  -- d'une fonction qu'il ne possède pas.
  update public.devis d
     set montant_ht = v_ht,
         montant_ttc = v_ttc
   where d.id = v_devis_id
     and (d.montant_ht is distinct from v_ht
          or d.montant_ttc is distinct from v_ttc);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger devis_lignes_recalculer_totaux_trigger
  after insert or update or delete on public.devis_lignes
  for each row
  execute function public.devis_lignes_recalculer_totaux();

-- =====================================================================
-- 7. ACL explicites, au moindre privilège (modèle : lot Ordre de Réparation)
-- =====================================================================
-- Les privilèges par défaut de ce projet accordent automatiquement TOUS les
-- privilèges à anon, authenticated ET service_role sur toute table créée dans
-- public — comportement déjà documenté et corrigé ailleurs
-- (20260831001100_revenue_recovery_fermer_privileges_defaut.sql). On ne dépend
-- donc d'aucun défaut : révocation totale d'abord, octroi minimal ensuite.

revoke all on table public.devis_lignes from public;
revoke all on table public.devis_lignes from anon;
revoke all on table public.devis_lignes from authenticated;
revoke all on table public.devis_lignes from service_role;
grant select, insert, update, delete on table public.devis_lignes to authenticated;
-- anon : aucun droit, y compris TRUNCATE (que la RLS ne filtre jamais).
-- service_role : aucun droit — aucun besoin backend/n8n n'est validé pour ce
-- lot ; un besoin futur passera par une migration dédiée qui l'assumera.

revoke execute on function public.devis_statut_modifiable(text) from public;
-- devis_statut_modifiable est le SEUL helper appelé DEPUIS une autre fonction.
-- devis_check_immuabilite et devis_lignes_check_integrite sont SECURITY INVOKER :
-- leur appel imbriqué est vérifié contre le rôle appelant, qui doit donc
-- détenir EXECUTE. Sans ce grant, un garagiste authentifié ne peut plus écrire
-- une seule ligne sur son propre devis (permission denied, SQLSTATE 42501).
-- Les quatre autres fonctions n'ont besoin d'aucun grant : elles ne sont
-- appelées que par leurs triggers, et déclencher un trigger n'exige pas EXECUTE.
grant execute on function public.devis_statut_modifiable(text) to authenticated;
revoke execute on function public.devis_lignes_set_updated_at() from public;
revoke execute on function public.devis_lignes_check_integrite() from public;
revoke execute on function public.devis_check_immuabilite() from public;
revoke execute on function public.devis_lignes_recalculer_totaux() from public;
-- Ces fonctions ne sont appelées que par leurs triggers respectifs — le
-- déclenchement d'un trigger n'exige pas EXECUTE du rôle appelant. Important
-- surtout pour devis_lignes_recalculer_totaux (SECURITY DEFINER).

-- =====================================================================
-- 8. RLS — isolation par garage
-- =====================================================================
-- Motif versionné récent, identique au lot Ordre de Réparation. Aucune
-- dépendance à current_garage_id() : cette fonction non versionnée porte
-- l'isolation du socle historique, mais les tables neuves ne s'y adossent pas.
-- Aucune policy pour anon, aucun accès public, aucun jeton : devis_lignes reste
-- invisible du parcours client par lien public (contrat F.4).

alter table public.devis_lignes enable row level security;

create policy devis_lignes_isolation on public.devis_lignes
  for all
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  )
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );
