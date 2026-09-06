-- Réconcilier le lot « accès salariés » avec le verrou d'accès de PR #64.
--
-- POURQUOI CETTE MIGRATION EXISTE
--
-- Le lot accès salariés est daté du 2026-09-05 et a été validé sur Test à
-- cette date. Le verrou d'accès (20260909000900) est arrivé APRÈS, et n'a
-- jamais été rejoué sur Test. Les deux lots sont donc corrects séparément,
-- et faux ensemble : appliqué en Production, le lot du 09-05 s'exécute
-- après le verrou du 09-09 malgré son numéro plus ancien, et le défait.
--
-- Trois collisions. Les deux premières sont silencieuses — aucune migration
-- n'échoue, aucune erreur n'est levée, l'accès se rouvre simplement :
--
--   1. `a_acces_garage()` ne teste que l'appartenance et le rôle. Les ~25
--      policies `_accueil` sont permissives et `for all`, donc elles
--      s'ajoutent en OU à celles du verrou. Un garage à l'abonnement échu
--      retrouvait lecture ET écriture sur clients, devis, rendez_vous,
--      inspections et ordres_reparation dès qu'un membre portait le rôle
--      `accueil`.
--
--   2. `20260905000200` refait `create or replace` sur `current_garage_id()`
--      avec un corps qui interroge `garages` en direct. Il écrasait la
--      version du verrou (`select * from mes_garages_ouverts() limit 1`),
--      rouvrant d'un coup les 15 policies de la « famille 1 ».
--
--   3. La troisième, elle, est bruyante : `20260905001000` et
--      `20260909000200` créent toutes deux `importer_clients_vehicules()`
--      avec la même signature, en `create function`. Le déploiement en
--      Production aurait échoué en cours de route. Traitée en 3/3 ci-dessous,
--      le fichier du 09-05 étant neutralisé par ailleurs.
--
-- POURQUOI UNE MIGRATION DE PLUS, PLUTÔT QUE CORRIGER LES FICHIERS DU 09-05
--
-- Les neuf migrations du 09-05 sont déjà appliquées sur Test. Les corriger
-- sur place ne les rejouerait pas : Test garderait l'ancienne définition et
-- Production recevrait la nouvelle. Une migration terminale amène les deux
-- projets au même état, quel que soit ce qu'ils ont déjà appliqué.
--
-- CE QUI EST RÉTABLI, ET CE QUI EST CONSERVÉ
--
-- Le lot accès salariés apporte une extension légitime : le dirigeant n'est
-- plus forcément le propriétaire de la ligne `garages`, il peut l'être par
-- une adhésion active. Cette extension est conservée — mais filtrée par la
-- même règle d'accès que le reste, au lieu de la contourner.
--
-- La règle n'est écrite qu'à un seul endroit (`acces_garage_ouvert`) et
-- appelée partout ailleurs, pour la raison déjà donnée par le verrou : deux
-- définitions de « l'accès est ouvert » finissent par diverger, et le jour
-- où elles divergent, l'une laisse passer ce que l'autre refuse.

-- 1/3 — Le prédicat unique des policies et des RPC exige désormais que
-- l'accès du garage soit ouvert, en plus du rôle. Comme tout le lot accès
-- salariés passe par lui (25 policies, 5 RPC, 3 tables), c'est le seul
-- endroit à corriger pour les couvrir tous.
create or replace function public.a_acces_garage(p_garage_id uuid, variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.mon_role_garage(p_garage_id) = any (p_roles), false)
     and public.acces_garage_ouvert(p_garage_id)
$$;

comment on function public.a_acces_garage(uuid, text[]) is
  'Prédicat unique des policies et des RPC : vrai si le rôle de l''appelant sur ce garage figure parmi ceux passés en argument ET si l''accès de ce garage est ouvert. Faux pour un garage inconnu, un utilisateur non connecté, une adhésion révoquée ou inactive, ou un abonnement échu. Le contrôle d''accès a été ajouté le 2026-09-10 : sans lui, les policies _accueil rouvraient en OU ce que le verrou 20260909000900 avait fermé.';

-- 2/3 — `current_garage_id()` repart de la version du verrou, et n'y ajoute
-- que la retombée « membre dirigeant », soumise à la même règle. La branche
-- propriétaire reste `mes_garages_ouverts()`, inchangée : elle porte déjà le
-- contrôle d'accès et sert aussi les 20 policies de la « famille 2 ».
create or replace function public.current_garage_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select * from public.mes_garages_ouverts() limit 1),
    (
      select m.garage_id
      from public.garage_membres m
      where m.user_id = auth.uid()
        and m.role = 'dirigeant'
        and m.actif = true
        and m.revoked_at is null
        and public.acces_garage_ouvert(m.garage_id)
      order by m.created_at, m.id
      limit 1
    )
  )
$$;

comment on function public.current_garage_id() is
  'Garage courant de l''appelant : son garage possédé si son accès est ouvert, sinon celui où il est dirigeant par adhésion active et à l''accès ouvert. NULL si aucun accès n''est ouvert — les policies filtrent alors tout. Réconciliée le 2026-09-10 entre le verrou 20260909000900 et le lot accès salariés du 2026-09-05.';

-- Vérification dans la transaction de la migration : l'état visé doit être
-- atteint, sinon la migration échoue et rien n'est appliqué.
do $$
declare
  v_pb text := '';
begin
  -- Les deux fonctions dont dépend la règle doivent exister : si l'ordre des
  -- migrations changeait un jour, mieux vaut échouer ici que rouvrir l'accès.
  if to_regprocedure('public.acces_garage_ouvert(uuid)') is null then
    v_pb := v_pb || E'\n- acces_garage_ouvert(uuid) est absente';
  end if;
  if to_regprocedure('public.mes_garages_ouverts()') is null then
    v_pb := v_pb || E'\n- mes_garages_ouverts() est absente';
  end if;

  if v_pb <> '' then
    raise exception 'Reconciliation impossible : %', v_pb;
  end if;

  if pg_get_functiondef('public.a_acces_garage(uuid, text[])'::regprocedure)
       not like '%acces_garage_ouvert%' then
    v_pb := v_pb || E'\n- a_acces_garage ne verifie pas acces_garage_ouvert';
  end if;

  if pg_get_functiondef('public.current_garage_id()'::regprocedure)
       not like '%mes_garages_ouverts%' then
    v_pb := v_pb || E'\n- current_garage_id ne passe pas par mes_garages_ouverts';
  end if;

  -- Une policy qui contournerait les deux portes rouvrirait l'accès sans que
  -- rien ne le signale. On refuse d'en laisser passer une.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname like '%\_accueil%'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%a_acces_garage%'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%current_garage_id%'
  ) then
    v_pb := v_pb || E'\n- une policy _accueil ne passe ni par a_acces_garage ni par current_garage_id';
  end if;

  if v_pb <> '' then
    raise exception 'Etat vise non atteint : %', v_pb;
  end if;

  raise notice 'Reconciliation acces salaries / verrou d''acces : etat verifie';
end;
$$;


-- =====================================================================
-- 3/3 — La fonction d'import, en une seule version
-- =====================================================================
--
-- Deux versions de `importer_clients_vehicules(uuid, jsonb, boolean)` ont été
-- écrites en parallèle : celle du chantier accès salariés (20260905001000,
-- neutralisée) et celle de `main` (20260909000200, en Production). Elles se
-- déclaraient toutes deux en `create function`, donc la seconde refusait de
-- s'appliquer par-dessus la première — garde-fou volontaire, décrit en
-- section D de docs/architecture/import-base-clients-v1.md.
--
-- La version canonique ci-dessous prend le meilleur des deux :
--
--   · le CORPS de `main`, qui corrige un défaut réel — le rapprochement des
--     doublons ne se faisait que par e-mail ou téléphone, si bien qu'un client
--     dépourvu des deux était recréé à chaque import et que rejouer le même
--     fichier dupliquait silencieusement toute cette population ;
--
--   · la MÉMOIRE intra-fichier du chantier accès salariés, sous plusieurs
--     clés au lieu d'une seule. Celle de `main` ne retenait un client que
--     sous la clé par laquelle il avait été cherché : un client vu avec son
--     e-mail n'était plus reconnu sur une ligne ultérieure ne portant que son
--     téléphone. Mesuré sur le jeu de recette, l'aperçu annonçait 3 créations
--     et l'import confirmé n'en faisait que 2 — l'aperçu mentait, alors que
--     sa fidélité est la promesse même du lot. Ce défaut est aujourd'hui EN
--     PRODUCTION ; cette migration le corrige au passage ;
--
--   · la GARDE du chantier accès salariés, qui autorise `dirigeant` et
--     `accueil` au lieu du seul propriétaire — c'est la raison d'être du
--     chantier, et son banc de test (supabase/tests/import_pilote_v1.sql)
--     est écrit autour.
--
-- `create or replace` est ici volontaire et sans danger : la signature est
-- identique des deux côtés, et cette migration s'exécute après les deux
-- autres sur Test comme en Production.

create or replace function public.importer_clients_vehicules(
  p_garage_id uuid,
  p_lignes jsonb,
  p_confirmer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne jsonb;
  v_index int := 0;
  v_nom text;
  v_nom_norm text;
  v_email text;
  v_tel text;
  v_tel_chiffres text;
  v_immat text;
  v_immat_norm text;
  v_marque text;
  v_modele text;
  v_km_txt text;
  v_annee_txt text;
  v_km int;
  v_annee int;
  v_motif text;
  v_cle_client text;
  v_client_id uuid;
  v_client_existant uuid;
  v_vehicule_existant uuid;
  v_immat_ailleurs boolean;

  v_total int;
  v_clients_crees int := 0;
  v_vehicules_crees int := 0;
  v_clients_doublons int := 0;
  v_vehicules_doublons int := 0;
  v_rejets jsonb := '[]'::jsonb;
  v_valides int := 0;

  -- Mémoire de ce qui a déjà été vu DANS ce fichier. Sans elle, l'aperçu
  -- compterait deux fois un client répété alors que l'import n'en créerait
  -- qu'un : en mode confirmé, la deuxième ligne retrouverait le client inséré
  -- par la première. Avec elle, aperçu et import donnent exactement les mêmes
  -- compteurs — c'est la promesse faite au garage avant qu'il confirme.
  v_vus_clients jsonb := '{}'::jsonb;
  v_vus_immats jsonb := '{}'::jsonb;
  v_deja_vu boolean;
begin
  -- Garde reprise du chantier accès salariés : le propriétaire est toujours
  -- 'dirigeant' au sens de mon_role_garage(), donc personne ne perd l'accès
  -- qu'il avait ; l'accueil le gagne. Et depuis la réconciliation ci-dessus,
  -- a_acces_garage() refuse en plus un garage dont l'accès est échu, ce que
  -- le test sur owner_user_id ne faisait pas.
  if not public.a_acces_garage(p_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Fichier invalide : aucune ligne exploitable' using errcode = '22023';
  end if;

  v_total := jsonb_array_length(p_lignes);

  if v_total = 0 then
    raise exception 'Fichier invalide : aucune ligne exploitable' using errcode = '22023';
  end if;

  -- Garde-fou de volume. Au-delà, une transaction de plusieurs milliers
  -- d'insertions tiendrait un verrou trop longtemps sur des tables que le
  -- garage utilise en production pendant ce temps.
  if v_total > 2000 then
    raise exception 'Fichier invalide : % lignes, maximum 2000 par import', v_total
      using errcode = '22023';
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes)
  loop
    v_index := v_index + 1;
    v_motif := null;
    v_client_id := null;
    v_deja_vu := false;

    v_nom := nullif(btrim(coalesce(v_ligne->>'nom', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_ligne->>'email', ''))), '');
    v_tel := nullif(btrim(coalesce(v_ligne->>'telephone', '')), '');
    v_immat := nullif(btrim(coalesce(v_ligne->>'immatriculation', '')), '');
    v_marque := nullif(btrim(coalesce(v_ligne->>'marque', '')), '');
    v_modele := nullif(btrim(coalesce(v_ligne->>'modele', '')), '');
    v_km_txt := nullif(btrim(coalesce(v_ligne->>'kilometrage', '')), '');
    v_annee_txt := nullif(btrim(coalesce(v_ligne->>'annee', '')), '');

    v_tel_chiffres := nullif(regexp_replace(coalesce(v_tel, ''), '[^0-9]', '', 'g'), '');
    v_immat_norm := nullif(upper(regexp_replace(coalesce(v_immat, ''), '[^A-Za-z0-9]', '', 'g')), '');
    v_nom_norm := lower(regexp_replace(coalesce(v_nom, ''), '\s+', ' ', 'g'));

    -- --- Validation ------------------------------------------------
    if v_nom is null then
      v_motif := 'nom du client manquant';
    elsif v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_motif := 'adresse e-mail non valide';
    elsif v_tel_chiffres is not null and length(v_tel_chiffres) < 6 then
      v_motif := 'téléphone non valide';
    elsif v_km_txt is not null and v_km_txt !~ '^[0-9]{1,7}$' then
      v_motif := 'kilométrage non valide';
    elsif v_annee_txt is not null and (v_annee_txt !~ '^[0-9]{4}$'
          or v_annee_txt::int < 1900
          or v_annee_txt::int > extract(year from now())::int + 1) then
      v_motif := 'année non valide';
    end if;

    if v_motif is null and v_immat_norm is not null then
      -- L'index unique sur l'immatriculation est GLOBAL : une plaque déjà
      -- prise hors de ce garage ferait échouer l'insertion. On la refuse avant
      -- d'écrire, avec un motif qui ne révèle rien du garage tiers.
      select exists (
        select 1 from public.vehicules v
        where upper(regexp_replace(coalesce(v.immatriculation, ''), '[^A-Za-z0-9]', '', 'g')) = v_immat_norm
          and v.garage_id is distinct from p_garage_id
      ) into v_immat_ailleurs;

      if v_immat_ailleurs then
        v_motif := 'immatriculation non disponible';
      end if;
    end if;

    if v_motif is not null then
      -- Le nom est repris dans le rejet pour que le garage retrouve la ligne
      -- dans son propre fichier. Il s'agit de ses données, rendues à lui seul.
      v_rejets := v_rejets || jsonb_build_object(
        'ligne', v_index, 'motif', v_motif, 'nom', coalesce(v_nom, ''));
      continue;
    end if;

    v_valides := v_valides + 1;

    -- --- Doublon client -------------------------------------------
    -- Clé de rapprochement, par ordre de fiabilité : e-mail, puis téléphone,
    -- puis — à défaut des deux — le nom normalisé.
    --
    -- Ce troisième cas est une CORRECTION par rapport à la version du chantier
    -- accès salariés, qui ne rapprochait que sur e-mail ou téléphone. Un client
    -- sans aucune coordonnée y était donc recréé à chaque import : rejouer le
    -- même fichier dupliquait silencieusement toute cette population, ce qui
    -- est exactement ce qu'un garage fait après une première tentative ratée.
    --
    -- Le compromis est assumé : deux homonymes réels dépourvus l'un et l'autre
    -- d'e-mail et de téléphone seront fusionnés. Ils sont de toute façon
    -- indiscernables, et l'aperçu affiche le compte de doublons avant
    -- confirmation.
    v_cle_client := case
      when v_email is not null then 'e:' || v_email
      when v_tel_chiffres is not null then 't:' || v_tel_chiffres
      else 'n:' || v_nom_norm
    end;

    if v_vus_clients ? v_cle_client then
      v_deja_vu := true;
      v_client_id := nullif(v_vus_clients->>v_cle_client, '')::uuid;
      v_clients_doublons := v_clients_doublons + 1;
    end if;

    if not v_deja_vu then
      select c.id into v_client_existant
      from public.clients c
      where c.garage_id = p_garage_id
        and (
          (v_email is not null and lower(btrim(coalesce(c.email, ''))) = v_email)
          or (v_email is null and v_tel_chiffres is not null
              and nullif(regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), '') = v_tel_chiffres)
          or (v_email is null and v_tel_chiffres is null
              and lower(regexp_replace(coalesce(c.nom, ''), '\s+', ' ', 'g')) = v_nom_norm)
        )
      limit 1;

      if v_client_existant is not null then
        v_clients_doublons := v_clients_doublons + 1;
        v_client_id := v_client_existant;
      else
        v_clients_crees := v_clients_crees + 1;
        if p_confirmer then
          insert into public.clients (garage_id, nom, email, telephone)
          values (p_garage_id, v_nom, v_email, v_tel)
          returning id into v_client_id;
        end if;
      end if;
    end if;

    -- Le client est mémorisé sous CHACUN de ses identifiants, et non sous la
    -- seule clé par laquelle il a été cherché — c'est la mémoire à deux clés
    -- du chantier accès salariés, étendue au nom.
    --
    -- Sans cela, un client vu ligne 1 avec son e-mail n'est plus reconnu
    -- ligne 2 lorsque celle-ci ne porte que son téléphone : cas banal d'un
    -- export où l'e-mail ne figure que sur une partie des lignes. L'aperçu
    -- comptait alors une création que l'import, lui, retrouvait en base — les
    -- deux passes divergeaient (3 créations annoncées, 2 réalisées sur le jeu
    -- de recette) et l'aperçu mentait, ce qui est exactement la promesse que
    -- ce lot fait au garage avant qu'il confirme.
    --
    -- Les trois clés reproduisent fidèlement l'échelle de rapprochement en
    -- base ci-dessus : une ligne sans e-mail y est cherchée par téléphone, et
    -- une ligne sans e-mail ni téléphone par nom normalisé.
    if v_email is not null then
      v_vus_clients := v_vus_clients
        || jsonb_build_object('e:' || v_email, coalesce(v_client_id::text, ''));
    end if;
    if v_tel_chiffres is not null then
      v_vus_clients := v_vus_clients
        || jsonb_build_object('t:' || v_tel_chiffres, coalesce(v_client_id::text, ''));
    end if;
    v_vus_clients := v_vus_clients
      || jsonb_build_object('n:' || v_nom_norm, coalesce(v_client_id::text, ''));

    -- --- Véhicule ---------------------------------------------------
    if v_immat_norm is not null or v_marque is not null or v_modele is not null then
      v_vehicule_existant := null;

      if v_immat_norm is not null and v_vus_immats ? v_immat_norm then
        v_vehicules_doublons := v_vehicules_doublons + 1;
        continue;
      end if;

      if v_immat_norm is not null then
        select v.id into v_vehicule_existant
        from public.vehicules v
        where v.garage_id = p_garage_id
          and upper(regexp_replace(coalesce(v.immatriculation, ''), '[^A-Za-z0-9]', '', 'g')) = v_immat_norm
        limit 1;
      end if;

      if v_vehicule_existant is not null then
        v_vehicules_doublons := v_vehicules_doublons + 1;
      else
        v_vehicules_crees := v_vehicules_crees + 1;
        if p_confirmer then
          v_km := case when v_km_txt is null then null else v_km_txt::int end;
          v_annee := case when v_annee_txt is null then null else v_annee_txt::int end;

          insert into public.vehicules
            (garage_id, client_id, marque, modele, annee, immatriculation, kilometrage)
          values (p_garage_id, v_client_id, v_marque, v_modele, v_annee, v_immat, v_km);
        end if;
      end if;

      if v_immat_norm is not null then
        v_vus_immats := v_vus_immats || jsonb_build_object(v_immat_norm, true);
      end if;
    end if;
  end loop;

  if v_valides = 0 then
    raise exception 'Fichier invalide : aucune ligne exploitable sur %', v_total
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'confirme', p_confirmer,
    'lignes_lues', v_total,
    'lignes_valides', v_valides,
    'clients_crees', v_clients_crees,
    'clients_ignores_doublon', v_clients_doublons,
    'vehicules_crees', v_vehicules_crees,
    'vehicules_ignores_doublon', v_vehicules_doublons,
    'lignes_rejetees', jsonb_array_length(v_rejets),
    'rejets', v_rejets
  );
end;
$$;

comment on function public.importer_clients_vehicules(uuid, jsonb, boolean) is
  'Aperçu et import de l''ancienne base clients et véhicules, en un seul point d''entrée. Corps repris de 20260909000200 (rapprochement des doublons par e-mail, téléphone, puis nom normalisé). Accès ouvert à dirigeant et accueil par a_acces_garage(), qui refuse aussi un garage à l''accès échu. Version canonique posée le 2026-09-10.';

revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from public;
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from anon;
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from service_role;
grant  execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) to authenticated;
