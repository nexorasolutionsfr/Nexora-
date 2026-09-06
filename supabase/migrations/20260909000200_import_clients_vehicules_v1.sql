-- Import de l'ancienne base clients et véhicules — V1.
-- Référence : docs/architecture/import-base-clients-v1.md
--
-- CE QUE CE LOT FERME
--
-- Un garage qui change de logiciel arrive avec des années de clients et de
-- véhicules. Aujourd'hui, Nexora n'offre aucun chemin pour les reprendre :
-- il faudrait les ressaisir, ou que l'éditeur le fasse à sa place. Les deux
-- reviennent à ce que ce chantier veut supprimer.
--
-- La revue des concurrents (Tekmetric, Shopmonkey, AutoLeap aux États-Unis,
-- Solware/Winmotor Cloud en France) montre qu'aucun ne propose de reprise en
-- self-service : tous mettent une équipe humaine dessus, sur une à quatre
-- semaines. C'est à la fois l'ouverture — personne ne le fait — et
-- l'avertissement : s'ils y mettent des humains, c'est que les fichiers réels
-- sont sales. D'où le mode aperçu obligatoire et les motifs de rejet explicites
-- ci-dessous : mieux vaut refuser une ligne en le disant que l'importer de
-- travers en silence.
--
-- PARENTÉ ET DIVERGENCE ASSUMÉE
--
-- Une fonction de même nom existe DÉJÀ sur le projet Test, issue du chantier
-- « accès salariés » (migration 20260905001000, non fusionnée dans main). Ce
-- lot en reprend la structure, qui est bonne — passe unique, aperçu et import
-- rigoureusement identiques, mémoire des doublons internes au fichier — avec
-- deux différences :
--
--   1. le contrôle d'accès s'appuie sur `garages.owner_user_id`, et non sur
--      `a_acces_garage()` qui n'existe pas en Production ;
--   2. un client sans e-mail NI téléphone n'est plus recréé à chaque import.
--
-- La migration REFUSE de s'appliquer si une fonction de ce nom existe déjà,
-- plutôt que de l'écraser : sur Test, les deux versions doivent être
-- réconciliées à la main, en connaissance de cause. C'est le prix de la dérive
-- constatée au lot socle, et il vaut mieux le payer bruyamment.

-- =====================================================================
-- 1. Refus explicite en cas de collision
-- =====================================================================

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'importer_clients_vehicules'
  ) then
    raise exception
      'public.importer_clients_vehicules existe deja sur cette base (probablement la version du chantier acces salaries, migration 20260905001000). Reconcilier les deux versions avant d''appliquer ce lot : voir docs/architecture/import-base-clients-v1.md section D.';
  end if;
end;
$$;

-- =====================================================================
-- 2. La fonction d'import
-- =====================================================================
-- `security definer` est nécessaire : la fonction lit `vehicules` au-delà du
-- garage appelant pour vérifier qu'une plaque n'est pas déjà prise ailleurs
-- (l'index d'unicité sur l'immatriculation est global). Cette lecture ne
-- ressort jamais : le motif de rejet dit « immatriculation non disponible »
-- et ne révèle rien du garage tiers.

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
  if not exists (
    select 1 from public.garages g
    where g.id = p_garage_id and g.owner_user_id = auth.uid()
  ) then
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

    v_vus_clients := v_vus_clients
      || jsonb_build_object(v_cle_client, coalesce(v_client_id::text, ''));

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
  'Importe des clients et véhicules dans le garage de l''appelant. p_confirmer à faux rend un aperçu sans aucune écriture, avec exactement les mêmes compteurs que l''import réel. Refuse un garage dont l''appelant n''est pas propriétaire, un fichier de plus de 2000 lignes, et toute ligne dont un champ est invalide, en donnant le motif. Rapproche les doublons par e-mail, puis téléphone, puis nom.';

revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from public;
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from anon;
-- Voir la note de 20260909000100 : Supabase accorde EXECUTE à service_role sur
-- toute fonction neuve de public, par privilège par défaut.
revoke execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) from service_role;
grant execute on function public.importer_clients_vehicules(uuid, jsonb, boolean) to authenticated;

-- =====================================================================
-- 3. Vérification dans la transaction de la migration
-- =====================================================================

do $$
declare
  v_pb text := '';
  v_colonnes_bloquantes text;
begin
  if has_function_privilege('anon', 'public.importer_clients_vehicules(uuid, jsonb, boolean)', 'EXECUTE') then
    v_pb := v_pb || 'anon peut importer; ';
  end if;
  if has_function_privilege('service_role', 'public.importer_clients_vehicules(uuid, jsonb, boolean)', 'EXECUTE') then
    v_pb := v_pb || 'service_role peut importer; ';
  end if;
  if not has_function_privilege('authenticated', 'public.importer_clients_vehicules(uuid, jsonb, boolean)', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut pas importer; ';
  end if;

  -- Même garde-fou que le lot onboarding, pour la même raison : l'insertion ne
  -- renseigne qu'une partie des colonnes, et le schéma de `clients` et
  -- `vehicules` n'était pas versionné avant le lot socle. Une colonne
  -- obligatoire oubliée ferait échouer l'import au premier fichier réel.
  select string_agg(t || '.' || c, ', ' order by t || '.' || c) into v_colonnes_bloquantes
  from (
    select c.table_name as t, c.column_name as c
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('clients', 'vehicules')
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.is_identity = 'NO'
      and c.is_generated = 'NEVER'
      and not (c.table_name = 'clients' and c.column_name in ('id', 'garage_id', 'nom', 'email', 'telephone'))
      and not (c.table_name = 'vehicules' and c.column_name in
            ('id', 'garage_id', 'client_id', 'marque', 'modele', 'annee', 'immatriculation', 'kilometrage'))
  ) s;

  if v_colonnes_bloquantes is not null then
    v_pb := v_pb || format('l''import ne renseigne pas ces colonnes obligatoires: %s; ', v_colonnes_bloquantes);
  end if;

  if v_pb <> '' then
    raise exception 'lot import clients vehicules v1: %', v_pb;
  end if;
end;
$$;
