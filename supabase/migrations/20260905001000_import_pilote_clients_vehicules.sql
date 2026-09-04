-- Import pilote clients et véhicules — V1.
--
-- Un seul point d'entrée, qui sert à la fois d'aperçu et d'import :
-- `p_confirmer = false` valide et rapporte sans rien écrire,
-- `p_confirmer = true` rejoue exactement la même validation puis écrit.
-- L'aperçu est donc fidèle par construction, et non une approximation
-- calculée séparément côté client.
--
-- Accès : dirigeant et accueil uniquement, refusé côté serveur pour tout
-- autre appelant, mécanicien compris. Voir
-- docs/architecture/import-pilote-v1.md et le chantier accès salariés.
--
-- Aucune donnée brute n'est conservée : la fonction ne reçoit que des lignes
-- déjà normalisées, n'écrit aucun journal de contenu, et ne renvoie que des
-- compteurs, des numéros de ligne et des motifs génériques.

create function public.importer_clients_vehicules(
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
  -- qu'un : en mode confirmé la deuxième ligne retrouverait le client
  -- inséré par la première. L'aperçu et l'import donnent ainsi exactement
  -- les mêmes compteurs.
  v_vus_clients jsonb := '{}'::jsonb;   -- clé e:<email> ou t:<chiffres> -> id
  v_vus_immats jsonb := '{}'::jsonb;    -- immatriculation normalisée -> present
  v_deja_vu boolean;
begin
  if not public.a_acces_garage(p_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Accès refusé';
  end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Fichier invalide : aucune ligne exploitable';
  end if;

  v_total := jsonb_array_length(p_lignes);

  if v_total = 0 then
    raise exception 'Fichier invalide : aucune ligne exploitable';
  end if;

  -- Garde-fou de volume. Au-delà, l'import passe par un accompagnement :
  -- une transaction de plusieurs milliers d'insertions tiendrait un verrou
  -- trop longtemps sur des tables utilisées en production par le garage.
  if v_total > 2000 then
    raise exception 'Fichier invalide : % lignes, maximum 2000 par import', v_total;
  end if;

  -- ---------------------------------------------------------------
  -- Passe unique. En mode aperçu, aucune écriture n'est exécutée ; les
  -- compteurs sont calculés sur l'état actuel de la base.
  -- ---------------------------------------------------------------
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
    elsif v_immat_norm is null and v_marque is null and v_modele is null
          and v_km_txt is null and v_annee_txt is null then
      -- Ligne sans aucune information de véhicule : le client seul est
      -- accepté, ce n'est pas un rejet. Rien à signaler ici.
      v_motif := null;
    end if;

    if v_motif is null and v_immat_norm is not null then
      -- L'index unique sur immatriculation est GLOBAL : une plaque déjà
      -- prise hors de ce garage ferait échouer l'insertion. On la refuse
      -- avant d'écrire, avec un motif qui ne révèle rien du garage tiers.
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
      v_rejets := v_rejets || jsonb_build_object('ligne', v_index, 'motif', v_motif);
      continue;
    end if;

    v_valides := v_valides + 1;

    -- --- Doublon client -------------------------------------------
    v_client_existant := null;

    if v_email is not null and v_vus_clients ? ('e:' || v_email) then
      v_deja_vu := true;
      v_client_id := nullif(v_vus_clients->>('e:' || v_email), '')::uuid;
      v_clients_doublons := v_clients_doublons + 1;
    elsif v_tel_chiffres is not null and v_vus_clients ? ('t:' || v_tel_chiffres) then
      v_deja_vu := true;
      v_client_id := nullif(v_vus_clients->>('t:' || v_tel_chiffres), '')::uuid;
      v_clients_doublons := v_clients_doublons + 1;
    end if;

    -- Un client déjà rencontré dans ce fichier ne repasse pas par la base :
    -- il serait compté une seconde fois en aperçu, où rien n'a été inséré.
    if not v_deja_vu then
    select c.id into v_client_existant
    from public.clients c
    where c.garage_id = p_garage_id
      and (
        (v_email is not null and lower(btrim(coalesce(c.email, ''))) = v_email)
        or (v_tel_chiffres is not null
            and nullif(regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), '') = v_tel_chiffres)
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

    -- Mémorise ce client pour les lignes suivantes du même fichier.
    if v_email is not null then
      v_vus_clients := v_vus_clients
        || jsonb_build_object('e:' || v_email, coalesce(v_client_id::text, ''));
    end if;
    if v_tel_chiffres is not null then
      v_vus_clients := v_vus_clients
        || jsonb_build_object('t:' || v_tel_chiffres, coalesce(v_client_id::text, ''));
    end if;

    -- --- Véhicule ---------------------------------------------------
    if v_immat_norm is not null or v_marque is not null or v_modele is not null then
      v_vehicule_existant := null;

      if v_immat_norm is not null and v_vus_immats ? v_immat_norm then
        -- Même plaque déjà rencontrée plus haut dans ce fichier.
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
    raise exception 'Fichier invalide : aucune ligne exploitable sur %', v_total;
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
  'Aperçu (p_confirmer = false, aucune écriture) et import (p_confirmer = true) de clients et véhicules. Réservé au dirigeant et à l''accueil. Ne met jamais à jour un enregistrement existant : un doublon est ignoré. Rejette sans divulgation une immatriculation déjà prise hors du garage. Ne conserve aucune donnée brute : le rapport ne contient que des compteurs, des numéros de ligne et des motifs génériques.';

revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from public;
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from anon;
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from service_role;
grant execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) to authenticated;
