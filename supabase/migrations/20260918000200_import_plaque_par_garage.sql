-- L'import cesse de refuser une plaque détenue par un autre garage.
--
-- Suite directe de 20260918000100 : l'unicité des plaques est désormais par
-- garage. Le contrôle « immatriculation non disponible » n'a plus d'objet —
-- il rejetait une ligne valide, et renseignait au passage le garage
-- importateur sur l'existence de la plaque ailleurs.
--
-- Le reste de la fonction est inchangé, y compris la détection du doublon
-- DANS le garage (par plaque normalisée) et celle des doublons internes au
-- fichier. Le corps ci-dessous est la définition en vigueur, amputée du seul
-- bloc devenu faux.

CREATE OR REPLACE FUNCTION public.importer_clients_vehicules(p_garage_id uuid, p_lignes jsonb, p_confirmer boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    -- L'unicité des plaques est désormais PAR GARAGE (migration
    -- 20260918000100) : une plaque détenue par un autre garage ne regarde
    -- plus celui-ci et n'est plus un motif de rejet. Le contrôle qui se
    -- trouvait ici refusait une ligne parfaitement valide, et renseignait au
    -- passage le garage importateur sur l'existence de la plaque ailleurs.
    -- Le doublon DANS ce garage reste détecté plus bas, comme avant.

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
$function$;



comment on function public.importer_clients_vehicules(uuid, jsonb, boolean) is
  'Import clients + vehicules. Doublons detectes DANS le garage (plaque normalisee, email, telephone) et dans le fichier. Ne regarde jamais les vehicules d''un autre garage : l''unicite des plaques est par garage depuis 20260918000100.';
