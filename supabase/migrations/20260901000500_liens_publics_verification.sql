-- Vérification bloquante des privilèges effectifs sur les objets créés par
-- 20260901000300/000400 — même méthode que
-- 20260831001100_revenue_recovery_fermer_privileges_defaut.sql :
-- has_table_privilege / has_function_privilege calculent le privilège
-- réellement effectif d'un rôle (appartenance de rôle + GRANT à PUBLIC
-- inclus), contrairement à une lecture déclarative de information_schema.

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
--    (réservé au garage propriétaire authentifié) ; authenticated ne doit
--    jamais pouvoir répondre à la place du public (lecture/réponse par
--    jeton réservées à anon, qui les utilise sans session).
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
      ('public.revoquer_jeton_atelier(uuid)', 'anon', false),
      ('public.revoquer_jeton_atelier(uuid)', 'authenticated', true),

      ('public.creer_jeton_devis(uuid)', 'anon', false),
      ('public.creer_jeton_devis(uuid)', 'authenticated', true),
      ('public.revoquer_jeton_devis(uuid)', 'anon', false),
      ('public.revoquer_jeton_devis(uuid)', 'authenticated', true),

      ('public.creer_jeton_facture(uuid)', 'anon', false),
      ('public.creer_jeton_facture(uuid)', 'authenticated', true),
      ('public.revoquer_jeton_facture(uuid)', 'anon', false),
      ('public.revoquer_jeton_facture(uuid)', 'authenticated', true),

      -- Lecture / réponse par jeton : anon uniquement (usage public sans session).
      ('public.lire_atelier_par_jeton(text)', 'anon', true),
      ('public.lire_atelier_par_jeton(text)', 'authenticated', false),
      ('public.avancer_etape_atelier_par_jeton(text, text)', 'anon', true),
      ('public.avancer_etape_atelier_par_jeton(text, text)', 'authenticated', false),

      ('public.lire_devis_par_jeton(text)', 'anon', true),
      ('public.lire_devis_par_jeton(text)', 'authenticated', false),
      ('public.repondre_devis_par_jeton(text, text)', 'anon', true),
      ('public.repondre_devis_par_jeton(text, text)', 'authenticated', false),

      ('public.lire_facture_par_jeton(text)', 'anon', true),
      ('public.lire_facture_par_jeton(text)', 'authenticated', false)
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
