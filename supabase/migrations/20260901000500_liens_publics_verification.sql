-- Vérification bloquante des privilèges effectifs sur les objets créés par
-- 20260901000300/000400 — même méthode que
-- 20260831001100_revenue_recovery_fermer_privileges_defaut.sql :
-- has_table_privilege / has_function_privilege calculent le privilège
-- réellement effectif d'un rôle (appartenance de rôle + GRANT à PUBLIC
-- inclus), contrairement à une lecture déclarative de information_schema.
--
-- Complété le 2026-09-01 après revue : bloc 4 (search_path fermé sur les
-- 11 fonctions) et bloc 5 (index unique partiel garantissant un seul jeton
-- actif par ressource).
--
-- Normalisation ACL ajoutée le 2026-09-01 (échec constaté sur Test lors du
-- premier push : authenticated avait EXECUTE effectif sur les 3 fonctions
-- lire_*_par_jeton alors que la vérification d'alors l'interdisait). Cause
-- confirmée : les default privileges du projet accordent EXECUTE à
-- anon/authenticated/service_role sur toute nouvelle fonction du schéma
-- public ; le simple `revoke ... from public` de 20260901000400 ne retire
-- pas ces grants individuels par rôle (PUBLIC et un rôle nommé sont deux
-- choses distinctes pour has_function_privilege). Décision d'architecture :
-- les 5 fonctions publiques par jeton doivent être exécutables par anon ET
-- authenticated (le jeton reste l'unique capacité — un lien doit fonctionner
-- même ouvert dans un navigateur ayant déjà une session Nexora). Le bloc
-- ci-dessous repart de zéro par un REVOKE explicite (neutralise les default
-- privileges, quel que soit leur origine) avant d'appliquer la matrice
-- voulue par GRANT ciblé — atomique avec les vérifications qui suivent :
-- si l'une d'elles échoue, aucune partie de cette migration n'est retenue.
-- Ne touche ni au corps, ni au propriétaire, ni au search_path des fonctions.

-- 6 fonctions génération/révocation : authenticated uniquement.
revoke execute on function public.creer_jeton_atelier(uuid) from public, anon, authenticated, service_role;
grant execute on function public.creer_jeton_atelier(uuid) to authenticated;

revoke execute on function public.revoquer_jeton_atelier(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoquer_jeton_atelier(uuid) to authenticated;

revoke execute on function public.creer_jeton_devis(uuid) from public, anon, authenticated, service_role;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;

revoke execute on function public.revoquer_jeton_devis(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoquer_jeton_devis(uuid) to authenticated;

revoke execute on function public.creer_jeton_facture(uuid) from public, anon, authenticated, service_role;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

revoke execute on function public.revoquer_jeton_facture(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoquer_jeton_facture(uuid) to authenticated;

-- 5 fonctions publiques par jeton : anon ET authenticated (jeton = unique capacité).
revoke execute on function public.lire_atelier_par_jeton(text) from public, anon, authenticated, service_role;
grant execute on function public.lire_atelier_par_jeton(text) to anon, authenticated;

revoke execute on function public.avancer_etape_atelier_par_jeton(text, text) from public, anon, authenticated, service_role;
grant execute on function public.avancer_etape_atelier_par_jeton(text, text) to anon, authenticated;

revoke execute on function public.lire_devis_par_jeton(text) from public, anon, authenticated, service_role;
grant execute on function public.lire_devis_par_jeton(text) to anon, authenticated;

revoke execute on function public.repondre_devis_par_jeton(text, text) from public, anon, authenticated, service_role;
grant execute on function public.repondre_devis_par_jeton(text, text) to anon, authenticated;

revoke execute on function public.lire_facture_par_jeton(text) from public, anon, authenticated, service_role;
grant execute on function public.lire_facture_par_jeton(text) to anon, authenticated;

do $$
declare
  v_tables text[] := array['atelier_jetons', 'devis_jetons', 'factures_jetons'];
  v_table_privileges text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_objet text;
  v_privilege text;
  v_role text;
  v_effectif boolean;
  v_violations text[] := array[]::text[];
begin
  -- 1) Les 3 tables de jetons : aucun privilège pour aucun rôle applicatif,
  --    accès exclusivement via les fonctions SECURITY DEFINER.
  foreach v_role in array v_roles loop
    foreach v_objet in array v_tables loop
      foreach v_privilege in array v_table_privileges loop
        v_effectif := has_table_privilege(v_role, 'public.' || v_objet, v_privilege);
        if v_effectif then
          v_violations := v_violations || (v_objet || ':' || v_role || ':' || v_privilege || ' (attendu=false, effectif=true)');
        end if;
      end loop;
    end loop;
  end loop;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification échouée (privilèges tables jetons) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;

-- 2) Fonctions : anon ne doit jamais pouvoir générer ni révoquer un jeton
--    (réservé au garage propriétaire authentifié) ; les 5 fonctions
--    publiques par jeton sont exécutables par anon ET authenticated (le
--    jeton reste l'unique capacité — décision d'architecture du 2026-09-01
--    pour qu'un lien fonctionne aussi ouvert dans un navigateur possédant
--    déjà une session Nexora) ; service_role ne doit jamais avoir EXECUTE
--    effectif sur aucune des 11 fonctions (accès admin exclusivement via
--    des voies dédiées, jamais via ces RPC publiques).
do $$
declare
  v_violations text[] := array[]::text[];
  v_row record;
  v_effectif boolean;
begin
  for v_row in
    select * from (values
      -- Génération / révocation : authenticated uniquement.
      ('public.creer_jeton_atelier(uuid)', 'anon', false),
      ('public.creer_jeton_atelier(uuid)', 'authenticated', true),
      ('public.creer_jeton_atelier(uuid)', 'service_role', false),
      ('public.revoquer_jeton_atelier(uuid)', 'anon', false),
      ('public.revoquer_jeton_atelier(uuid)', 'authenticated', true),
      ('public.revoquer_jeton_atelier(uuid)', 'service_role', false),

      ('public.creer_jeton_devis(uuid)', 'anon', false),
      ('public.creer_jeton_devis(uuid)', 'authenticated', true),
      ('public.creer_jeton_devis(uuid)', 'service_role', false),
      ('public.revoquer_jeton_devis(uuid)', 'anon', false),
      ('public.revoquer_jeton_devis(uuid)', 'authenticated', true),
      ('public.revoquer_jeton_devis(uuid)', 'service_role', false),

      ('public.creer_jeton_facture(uuid)', 'anon', false),
      ('public.creer_jeton_facture(uuid)', 'authenticated', true),
      ('public.creer_jeton_facture(uuid)', 'service_role', false),
      ('public.revoquer_jeton_facture(uuid)', 'anon', false),
      ('public.revoquer_jeton_facture(uuid)', 'authenticated', true),
      ('public.revoquer_jeton_facture(uuid)', 'service_role', false),

      -- Lecture / réponse par jeton : anon ET authenticated (jeton = unique capacité).
      ('public.lire_atelier_par_jeton(text)', 'anon', true),
      ('public.lire_atelier_par_jeton(text)', 'authenticated', true),
      ('public.lire_atelier_par_jeton(text)', 'service_role', false),
      ('public.avancer_etape_atelier_par_jeton(text, text)', 'anon', true),
      ('public.avancer_etape_atelier_par_jeton(text, text)', 'authenticated', true),
      ('public.avancer_etape_atelier_par_jeton(text, text)', 'service_role', false),

      ('public.lire_devis_par_jeton(text)', 'anon', true),
      ('public.lire_devis_par_jeton(text)', 'authenticated', true),
      ('public.lire_devis_par_jeton(text)', 'service_role', false),
      ('public.repondre_devis_par_jeton(text, text)', 'anon', true),
      ('public.repondre_devis_par_jeton(text, text)', 'authenticated', true),
      ('public.repondre_devis_par_jeton(text, text)', 'service_role', false),

      ('public.lire_facture_par_jeton(text)', 'anon', true),
      ('public.lire_facture_par_jeton(text)', 'authenticated', true),
      ('public.lire_facture_par_jeton(text)', 'service_role', false)
    ) as t(signature, role, attendu)
  loop
    v_effectif := has_function_privilege(v_row.role, v_row.signature, 'EXECUTE');
    if v_effectif is distinct from v_row.attendu then
      v_violations := v_violations || (v_row.signature || ':' || v_row.role || ' (attendu=' || v_row.attendu::text || ', effectif=' || v_effectif::text || ')');
    end if;
  end loop;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification échouée (privilèges fonctions jetons) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;

-- 3) Anciennes RPC UUID toujours révoquées (rappel bloquant, ne dépend pas
--    d'une exécution manuelle a posteriori) — confirme que
--    20260901000200_confinement_rpc_publiques_atelier_devis_facture.sql
--    n'a pas été contourné entre-temps par un GRANT direct.
do $$
declare
  v_violations text[] := array[]::text[];
begin
  if has_function_privilege('anon', 'public.lire_etape_atelier(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_etape_atelier(uuid):anon';
  end if;
  if has_function_privilege('authenticated', 'public.lire_etape_atelier(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_etape_atelier(uuid):authenticated';
  end if;
  if has_function_privilege('anon', 'public.avancer_etape_atelier(uuid, text)', 'EXECUTE') then
    v_violations := v_violations || 'avancer_etape_atelier(uuid,text):anon';
  end if;
  if has_function_privilege('authenticated', 'public.avancer_etape_atelier(uuid, text)', 'EXECUTE') then
    v_violations := v_violations || 'avancer_etape_atelier(uuid,text):authenticated';
  end if;
  if has_function_privilege('anon', 'public.lire_devis_public(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_devis_public(uuid):anon';
  end if;
  if has_function_privilege('authenticated', 'public.lire_devis_public(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_devis_public(uuid):authenticated';
  end if;
  if has_function_privilege('anon', 'public.repondre_devis_public(uuid, text)', 'EXECUTE') then
    v_violations := v_violations || 'repondre_devis_public(uuid,text):anon';
  end if;
  if has_function_privilege('authenticated', 'public.repondre_devis_public(uuid, text)', 'EXECUTE') then
    v_violations := v_violations || 'repondre_devis_public(uuid,text):authenticated';
  end if;
  if has_function_privilege('anon', 'public.lire_facture_publique(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_facture_publique(uuid):anon';
  end if;
  if has_function_privilege('authenticated', 'public.lire_facture_publique(uuid)', 'EXECUTE') then
    v_violations := v_violations || 'lire_facture_publique(uuid):authenticated';
  end if;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification échouée (anciennes RPC UUID réactivées) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;

-- 4) search_path fermé sur les 11 fonctions SECURITY DEFINER/INVOKER de
--    20260901000400_liens_publics_rpc.sql — durci le 2026-09-01 après
--    revue ; corrigé le 2026-09-01 (échec constaté lors du premier push
--    Test) : la comparaison initiale attendait littéralement l'entrée
--    'search_path=' (chaîne vide nue), alors que PostgreSQL stocke en
--    réalité 'search_path=""' (chaîne vide entre guillemets doubles) —
--    confirmé en lecture seule sur Test (slawilafseganlbghgwx) pour les
--    11 fonctions avant ce correctif. Les deux représentations sont donc
--    acceptées comme canoniquement vides, et seulement elles.
--    `set search_path = ''` attendu exactement, jamais 'search_path=public'
--    ni l'absence de toute configuration search_path (ce qui laisserait le
--    search_path de l'appelant s'appliquer) — un simple `LIKE
--    'search_path=%'` ne suffit jamais à conclure : il matche aussi
--    'search_path=public', d'où la vérification explicite de la valeur
--    après le '=' ci-dessous, jamais un filtre de préfixe isolé.
do $$
declare
  v_violations text[] := array[]::text[];
  v_signature text;
  v_oid oid;
  v_proconfig text[];
  v_entrees_search_path text[];
  v_entree text;
  v_valeur text;
  v_normalisee text;
begin
  foreach v_signature in array array[
    'public.creer_jeton_atelier(uuid)',
    'public.revoquer_jeton_atelier(uuid)',
    'public.lire_atelier_par_jeton(text)',
    'public.avancer_etape_atelier_par_jeton(text, text)',
    'public.creer_jeton_devis(uuid)',
    'public.revoquer_jeton_devis(uuid)',
    'public.lire_devis_par_jeton(text)',
    'public.repondre_devis_par_jeton(text, text)',
    'public.creer_jeton_facture(uuid)',
    'public.revoquer_jeton_facture(uuid)',
    'public.lire_facture_par_jeton(text)'
  ]
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      v_violations := v_violations || (v_signature || ' (fonction introuvable)');
      continue;
    end if;

    select proconfig into v_proconfig from pg_proc where oid = v_oid;

    -- Préfixe seul insuffisant (matcherait 'search_path=public') : filtre
    -- d'abord les entrées candidates, la valeur exacte est vérifiée après.
    select array_agg(e) into v_entrees_search_path
      from unnest(coalesce(v_proconfig, array[]::text[])) as e
      where e like 'search_path=%';

    if v_entrees_search_path is null or array_length(v_entrees_search_path, 1) is distinct from 1 then
      v_violations := v_violations || (v_signature || ' (' ||
        coalesce(array_length(v_entrees_search_path, 1)::text, '0') ||
        ' entrée(s) search_path, attendu exactement 1 ; proconfig=' ||
        coalesce(array_to_string(v_proconfig, ','), 'aucun') || ')');
      continue;
    end if;

    v_entree := v_entrees_search_path[1];
    v_valeur := substring(v_entree from length('search_path=') + 1);
    -- Deux seules représentations canoniques acceptées d'un search_path
    -- vide : chaîne nue vide, ou chaîne vide entre guillemets doubles
    -- littéraux (forme réellement observée sur cette instance Postgres).
    v_normalisee := case when v_valeur = '""' then '' else v_valeur end;

    if v_normalisee <> '' then
      v_violations := v_violations || (v_signature || ' (search_path effectif=' || v_entree || ', attendu=search_path= ou search_path="")');
    end if;
  end loop;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification échouée (search_path non fermé) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;

-- 5) Un seul jeton actif par ressource — l'index unique partiel existe bien
--    sur les 3 tables, avec la bonne colonne et la bonne condition
--    (where revoked_at is null). Contrôle structurel : confirme que
--    l'index déclaré dans 20260901000300_liens_publics_jetons.sql a
--    effectivement été créé, pas seulement écrit dans le fichier source.
do $$
declare
  v_violations text[] := array[]::text[];
  v_row record;
begin
  for v_row in
    select * from (values
      ('atelier_jetons_actif_unique', 'atelier_jetons', 'rendez_vous_id'),
      ('devis_jetons_actif_unique', 'devis_jetons', 'devis_id'),
      ('factures_jetons_actif_unique', 'factures_jetons', 'facture_id')
    ) as t(index_name, table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = v_row.table_name
        and indexname = v_row.index_name
        and indexdef ilike '%unique%'
        and indexdef ilike '%' || v_row.column_name || '%'
        and indexdef ilike '%where%revoked_at is null%'
    ) then
      v_violations := v_violations || (v_row.index_name || ' (absent, incomplet, ou condition inattendue)');
    end if;
  end loop;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification échouée (index unicité jeton actif) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;
