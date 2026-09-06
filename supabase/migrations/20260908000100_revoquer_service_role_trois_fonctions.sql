-- Lot sécurité final — retirer `service_role` sur les trois fonctions
-- durcies.
--
-- Lot indépendant : il ne touche ni au chantier accès salariés et import
-- pilote, ni au lot Stripe (20260906000200), ni au lot de confinement du
-- jeton de confirmation (20260907000100). Trois révocations, rien d'autre.
--
-- CE QUI JUSTIFIE CE LOT
--
-- Les deux lots précédents avaient conservé `service_role` à titre
-- temporaire, faute d'avoir inspecté les workflows n8n, qui vivent hors du
-- dépôt. Cet audit a été fait le 2026-09-05, en lecture seule, sur les
-- seules définitions de workflows — jamais les exécutions, les identifiants
-- ni les variables. Résultat :
--
--   - `set_stripe_secret_key`            : 0 occurrence sur 13 workflows
--   - `stripe_configure_pour_mon_garage` : 0 occurrence sur 13 workflows
--   - `creer_jeton_confirmation`         : 0 occurrence sur 13 workflows
--
-- Plus large encore : aucun workflow n'appelle la moindre fonction distante.
-- n8n travaille exclusivement par opérations de table du nœud Supabase.
--
-- Le seul workflow qui touche au domaine Stripe — inactif à ce jour — lit la
-- table des secrets **directement**, par une opération de lecture de table.
-- Il dépend donc d'un privilège de TABLE pour `service_role`, que ce lot ne
-- touche pas, et non du droit d'exécuter ces fonctions.
--
-- ÉTAT VISÉ
--
--   fonction                          | anon | authenticated | service_role
--   set_stripe_secret_key             | non  | OUI           | non
--   stripe_configure_pour_mon_garage  | non  | OUI           | non
--   creer_jeton_confirmation          | non  | non           | non
--
-- L'émission de jeton n'est donc plus accessible à aucun rôle appelant.
-- Elle reste appelable par son unique chemin interne :
-- `public.preparer_rappels_confirmation()` est `security definer` et
-- appartient à `postgres` ; à l'intérieur de son corps l'utilisateur
-- effectif est ce propriétaire, qui est aussi celui de la fonction appelée.
-- Un propriétaire conserve toujours le droit d'exécuter sa propre fonction :
-- aucune révocation accordée à un rôle client ne peut l'en empêcher. La
-- tâche planifiée qui déclenche la chaîne s'exécute elle-même sous
-- `postgres`, et `preparer_rappels_confirmation` n'est ni modifiée ni
-- révoquée ici.
--
-- Aucun corps de fonction n'est touché par ce lot.

revoke execute on function public.set_stripe_secret_key(text) from service_role;
revoke execute on function public.stripe_configure_pour_mon_garage() from service_role;
revoke execute on function public.creer_jeton_confirmation(uuid) from service_role;

comment on function public.creer_jeton_confirmation(uuid) is
  'Émet un jeton de confirmation pour un rendez-vous. N''effectue aucun contrôle d''appartenance : elle n''est appelable par aucun rôle client depuis le 2026-09-05. Seul son appelant interne, public.preparer_rappels_confirmation(), l''atteint, sous l''identité du propriétaire.';

-- Vérification dans la transaction de la migration : l'état visé, et rien
-- d'autre, doit être atteint. La migration échoue sinon.
do $$
declare
  v_pb text := '';
begin
  -- Les trois fonctions sont fermées à anon et à service_role.
  if has_function_privilege('anon', 'public.set_stripe_secret_key(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.stripe_configure_pour_mon_garage()', 'EXECUTE')
     or has_function_privilege('anon', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'anon a encore EXECUTE sur au moins une des trois; ';
  end if;

  if has_function_privilege('service_role', 'public.set_stripe_secret_key(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.stripe_configure_pour_mon_garage()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'service_role a encore EXECUTE sur au moins une des trois; ';
  end if;

  -- Les deux fonctions Stripe restent utilisables par le tableau de bord.
  if not has_function_privilege('authenticated', 'public.set_stripe_secret_key(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.stripe_configure_pour_mon_garage()', 'EXECUTE') then
    v_pb := v_pb || 'authenticated a perdu une fonction Stripe; ';
  end if;

  -- L'émission de jeton n'est accessible à aucun rôle appelant.
  if has_function_privilege('authenticated', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'authenticated peut encore emettre un jeton; ';
  end if;

  -- Le chemin interne privilégié et le parcours client restent intacts.
  if not has_function_privilege('postgres', 'public.preparer_rappels_confirmation()', 'EXECUTE') then
    v_pb := v_pb || 'la tache planifiee n''est plus declenchable par postgres; ';
  end if;
  if not has_function_privilege('anon', 'public.lire_confirmation_par_jeton(text)', 'EXECUTE') then
    v_pb := v_pb || 'le parcours client de confirmation a ete ferme par erreur; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot revocation service_role: %', v_pb;
  end if;
end;
$$;
