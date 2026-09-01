-- Revenue Recovery V1 — correctif : politique de suppression / anonymisation.
-- Migration additive côté schéma, ALTER non destructif de colonnes vides
-- (les tables sont vides à ce stade — aucune donnée réelle n'existe encore).
--
-- Contradiction corrigée : les migrations précédentes utilisaient
-- ON DELETE RESTRICT sur client_id/travail_differe_id des tables de preuve,
-- en reportant explicitement le problème ("risque ouvert assumé"). Analyse
-- de l'impact réel : aucune fonctionnalité du dashboard n'expose la
-- suppression directe d'un client ou d'un travail différé (vérifié par
-- lecture du code sur origin/main : zéro appel .delete() sur ces deux
-- tables) — mais la suppression d'un client existe et est régulièrement
-- pratiquée manuellement en SQL Editor (méthode déjà utilisée sur ce
-- projet, ex. nettoyage des données de recette Cockpit). travaux_differes
-- cascade déjà depuis clients (ON DELETE CASCADE, migration
-- 20260830000200, antérieure à Revenue Recovery). Avec RESTRICT en place,
-- dès qu'une seule ligne Revenue Recovery référencerait un travail
-- différé, la suppression du client échouerait en cascade — cassant un
-- droit de suppression aujourd'hui disponible. C'est une régression réelle,
-- pas seulement un risque théorique à documenter.
--
-- Politique retenue (sûre, réversible, ne bloque rien d'existant, ne
-- prétend pas conserver une preuve pour toujours) :
--   - client_id / travail_differe_id sur les tables de preuve
--     (permissions, tentatives, evenements) passent de RESTRICT à
--     SET NULL, et deviennent nullables au niveau colonne. La suppression
--     d'un client ou d'un travail différé réussit toujours ; la ligne de
--     preuve survit mais perd son lien direct — c'est une anonymisation
--     par omission, pas une garantie de rétention indéfinie.
--   - Ces colonnes restent OBLIGATOIRES en pratique à la création : la
--     fonction RPC de permissions (20260831000700) et les triggers
--     d'insertion de brouillons/tentatives/evenements continuent d'exiger
--     leur présence à l'écriture. Seule une suppression ultérieure ailleurs
--     peut les faire passer à NULL.
--   - revenue_recovery_brouillons reste en CASCADE (déjà correct) : un
--     brouillon jamais envoyé n'a aucune valeur de preuve.
--   - garage_id reste en CASCADE partout (convention déjà en place sur tout
--     le projet, non remise en cause ici) : supprimer un garage entier
--     supprime bien toutes ses données Revenue Recovery.
--
-- À CONFIRMER AVANT LE PREMIER ENVOI RÉEL (non résolu par ce correctif,
-- décision explicitement hors périmètre des fondations) :
--   - durée de conservation légale exacte des preuves de consentement et
--     du contenu envoyé (aucune purge automatique n'existe, et ce
--     correctif n'en crée pas) ;
--   - si une preuve "anonymisée par omission" (lien nul mais ligne
--     conservée) suffit en cas de contrôle, ou si un instantané
--     explicitement anonymisé (ex. hash, mention "client supprimé le ...")
--     est requis à la place ;
--   - procédure de purge/rétention programmée, aujourd'hui inexistante.

-- --- revenue_recovery_permissions ------------------------------------
alter table public.revenue_recovery_permissions
  alter column client_id drop not null;

alter table public.revenue_recovery_permissions
  drop constraint if exists revenue_recovery_permissions_client_id_fkey;
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;

alter table public.revenue_recovery_permissions
  drop constraint if exists revenue_recovery_permissions_travail_differe_id_fkey;
alter table public.revenue_recovery_permissions
  add constraint revenue_recovery_permissions_travail_differe_id_fkey
  foreign key (travail_differe_id) references public.travaux_differes(id) on delete set null;

-- --- revenue_recovery_tentatives --------------------------------------
alter table public.revenue_recovery_tentatives
  alter column travail_differe_id drop not null;

alter table public.revenue_recovery_tentatives
  drop constraint if exists revenue_recovery_tentatives_travail_differe_id_fkey;
alter table public.revenue_recovery_tentatives
  add constraint revenue_recovery_tentatives_travail_differe_id_fkey
  foreign key (travail_differe_id) references public.travaux_differes(id) on delete set null;

-- Le trigger d'insertion vérifiait déjà la cohérence garage_id de manière
-- inconditionnelle (travail_differe_id supposé non nul) : redéfini pour
-- exiger explicitement sa présence À LA CRÉATION (message clair) plutôt que
-- de compter implicitement sur l'ancienne contrainte NOT NULL, désormais
-- retirée pour permettre le SET NULL différé.
create or replace function public.revenue_recovery_tentatives_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.cree_par := auth.uid();
  new.created_at := now();
  if new.travail_differe_id is null then
    raise exception 'travail_differe_id est obligatoire à la création d''une tentative';
  end if;
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  return new;
end;
$$;

-- --- revenue_recovery_evenements --------------------------------------
alter table public.revenue_recovery_evenements
  alter column travail_differe_id drop not null;

alter table public.revenue_recovery_evenements
  drop constraint if exists revenue_recovery_evenements_travail_differe_id_fkey;
alter table public.revenue_recovery_evenements
  add constraint revenue_recovery_evenements_travail_differe_id_fkey
  foreign key (travail_differe_id) references public.travaux_differes(id) on delete set null;

create or replace function public.revenue_recovery_evenements_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.acteur := auth.uid();
  new.created_at := now();
  if new.travail_differe_id is null then
    raise exception 'travail_differe_id est obligatoire à la création d''un événement';
  end if;
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  if new.tentative_id is not null and not exists (
    select 1 from public.revenue_recovery_tentatives
    where id = new.tentative_id and garage_id = new.garage_id
  ) then
    raise exception 'tentative_id % n''appartient pas au garage %', new.tentative_id, new.garage_id;
  end if;
  return new;
end;
$$;

comment on constraint revenue_recovery_permissions_client_id_fkey on public.revenue_recovery_permissions is
  'ON DELETE SET NULL délibéré : la suppression d''un client ne doit jamais échouer à cause de cette table. La ligne survit sans lien, sans garantie de rétention indéfinie — voir en-tête de fichier pour ce qui reste à confirmer avant le premier envoi réel.';

-- Vérification post-migration : les DROP/ADD CONSTRAINT ci-dessus supposent
-- la convention de nommage par défaut de PostgreSQL pour une contrainte de
-- clé étrangère non nommée explicitement (<table>_<colonne>_fkey). Cette
-- migration n'ayant pas pu être exécutée sur un moteur réel avant écriture
-- (aucun outillage Postgres local disponible), ce bloc échoue bruyamment à
-- l'application si l'hypothèse est fausse, plutôt que de laisser
-- silencieusement une ancienne contrainte RESTRICT active en parallèle.
do $$
declare
  v_bad text;
begin
  select string_agg(attendu.conname, ', ') into v_bad
  from (values
    ('public.revenue_recovery_permissions'::regclass, 'revenue_recovery_permissions_client_id_fkey'),
    ('public.revenue_recovery_permissions'::regclass, 'revenue_recovery_permissions_travail_differe_id_fkey'),
    ('public.revenue_recovery_tentatives'::regclass, 'revenue_recovery_tentatives_travail_differe_id_fkey'),
    ('public.revenue_recovery_evenements'::regclass, 'revenue_recovery_evenements_travail_differe_id_fkey')
  ) as attendu(rel, conname)
  where not exists (
    select 1 from pg_constraint c
    where c.conrelid = attendu.rel
      and c.conname = attendu.conname
      and c.confdeltype = 'n' -- 'n' = SET NULL dans pg_constraint
  );

  if v_bad is not null then
    raise exception 'Vérification post-migration échouée : contrainte(s) non en ON DELETE SET NULL comme attendu : %', v_bad;
  end if;
end $$;

