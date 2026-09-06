-- Lot sécurité — confiner `creer_jeton_confirmation(uuid)`.
--
-- Lot indépendant : il ne touche ni au lot Stripe, ni au chantier accès
-- salariés et import pilote. Un seul objet, un seul geste.
--
-- LE PROBLÈME
--
-- `public.creer_jeton_confirmation(p_rdv_id uuid)` est `security definer`,
-- appartient à `postgres`, et accepte un identifiant de rendez-vous brut
-- **sans aucune vérification d'appartenance**. Elle insère un jeton de
-- confirmation valide pour ce rendez-vous et le renvoie en clair. Quiconque
-- peut l'appeler avec un identifiant de rendez-vous obtient donc un lien
-- client fonctionnel, sur n'importe quel garage.
--
-- C'est la classe de faiblesse déjà fermée le 2026-09-01 pour les parcours
-- atelier, devis et facture (20260901000200). Celle-ci avait été manquée
-- parce qu'elle **émet** un jeton au lieu de lire directement.
--
-- État relevé le 2026-09-05, en lecture seule :
--   - Test        : ACL `PUBLIC`, `postgres`, `service_role`
--   - Production  : ACL `PUBLIC`, `postgres`
-- Sur les deux projets, `anon` et `authenticated` obtiennent le droit par
-- le `GRANT` à `PUBLIC`.
--
-- POURQUOI FERMER AUSSI `authenticated`, ET PAS SEULEMENT `anon`
--
-- Aucun composant du dépôt n'appelle cette fonction : la recherche sur
-- `app/`, `components/` et `lib/` ne ramène aucun site d'appel. Un compte
-- authentifié n'a donc aucun usage légitime de l'émission directe. La
-- laisser ouverte permettrait à n'importe quel utilisateur connecté de
-- fabriquer un lien client sur le rendez-vous d'un autre garage — et le
-- chantier accès salariés multiplie précisément le nombre de comptes
-- connectés par garage.
--
-- POURQUOI CELA NE CASSE PAS L'APPELANT LÉGITIME
--
-- L'unique appelant est `public.preparer_rappels_confirmation()`, vérifié
-- par recherche sur le corps de toutes les fonctions de `public`, sur les
-- deux projets. Cette fonction est elle-même `security definer` et
-- appartient à `postgres` : à l'intérieur de son corps, l'utilisateur
-- effectif est `postgres`. Or PostgreSQL contrôle le privilège EXECUTE
-- contre l'utilisateur effectif du moment, et `postgres` est le
-- propriétaire de `creer_jeton_confirmation` — un propriétaire conserve
-- toujours le droit d'exécuter sa propre fonction. Retirer `PUBLIC`, `anon`
-- et `authenticated` est donc sans effet sur cet appel interne.
--
-- La tâche planifiée qui déclenche la chaîne (`pg_cron`, toutes les dix
-- minutes en Production) s'exécute elle aussi sous le rôle `postgres`,
-- vérifié dans `cron.job`. `preparer_rappels_confirmation` n'est ni
-- modifiée ni révoquée par cette migration.
--
-- POURQUOI LE PARCOURS CLIENT N'EST PAS AFFECTÉ
--
-- Le client ne passe jamais par l'émission. Il ouvre `/c/<jeton>`, qui
-- appelle `lire_confirmation_par_jeton` puis `repondre_confirmation_par_jeton`.
-- Ces deux fonctions gardent leur droit d'exécution pour `anon` : cette
-- migration ne les nomme pas.
--
-- `service_role` EST CONSERVÉ, TEMPORAIREMENT
--
-- Même posture que le lot Stripe, sur décision du porteur du projet : les
-- workflows n8n vivent hors du dépôt et n'ont pas été inspectés. Le `grant`
-- ci-dessous n'est pas redondant — en Production, `service_role` n'a aucun
-- droit nominatif sur cette fonction et passe aujourd'hui par `PUBLIC`, que
-- cette migration ferme. Sans regrant, il perdrait l'accès en Production
-- alors qu'il le conserverait sur Test. À réexaminer après l'audit n8n.
--
-- Le corps de la fonction n'est pas touché. Y ajouter un contrôle
-- d'appartenance serait contre-productif : l'appelant interne s'exécute sans
-- session utilisateur, `auth.uid()` y est nul, et un tel contrôle casserait
-- précisément la chaîne légitime qu'il s'agit de préserver.

revoke execute on function public.creer_jeton_confirmation(uuid) from public;
revoke execute on function public.creer_jeton_confirmation(uuid) from anon;
revoke execute on function public.creer_jeton_confirmation(uuid) from authenticated;

-- Conservé temporairement, à réexaminer après l'audit des workflows n8n.
grant execute on function public.creer_jeton_confirmation(uuid) to service_role;

comment on function public.creer_jeton_confirmation(uuid) is
  'Émet un jeton de confirmation pour un rendez-vous. N''effectue aucun contrôle d''appartenance : elle n''est donc plus appelable directement depuis un client. Confinée le 2026-09-05 à son appelant interne, public.preparer_rappels_confirmation(), qui s''exécute sous l''identité du propriétaire.';

-- Vérification dans la transaction de la migration.
do $$
declare
  v_pb text := '';
begin
  if has_function_privilege('anon', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'anon a encore EXECUTE; ';
  end if;
  if has_function_privilege('authenticated', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'authenticated a encore EXECUTE; ';
  end if;
  if not has_function_privilege('service_role', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE') then
    v_pb := v_pb || 'service_role a perdu EXECUTE, conserve volontairement; ';
  end if;

  -- L'appelant interne et le parcours client public ne doivent pas bouger.
  if not has_function_privilege('postgres', 'public.preparer_rappels_confirmation()', 'EXECUTE') then
    v_pb := v_pb || 'postgres ne peut plus declencher les rappels; ';
  end if;
  if not has_function_privilege('anon', 'public.lire_confirmation_par_jeton(text)', 'EXECUTE') then
    v_pb := v_pb || 'le parcours client de confirmation a ete ferme par erreur; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot creer_jeton_confirmation: %', v_pb;
  end if;
end;
$$;
