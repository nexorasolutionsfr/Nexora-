-- Lot sécurité anon — 2/3 : les deux fonctions Stripe.
--
-- Trois choses, et rien d'autre :
--   1. les verser dans l'historique versionné — elles n'existaient qu'en
--      base, comme `rls_auto_enable` ;
--   2. fixer `search_path = ''` et qualifier les objets par leur schéma ;
--   3. fermer strictement `PUBLIC` et `anon`, en conservant `authenticated`
--      et `service_role`.
--
-- **La logique fonctionnelle est inchangée.** Les corps sont repris ligne à
-- ligne de la définition relevée le 2026-09-05, identique sur Test et sur
-- Production ; seules les références de tables passent de `garages` à
-- `public.garages` et de `garages_secrets` à `public.garages_secrets`. Le
-- `select ... into` sans `limit` est conservé tel quel : le corriger serait
-- un changement de comportement, hors du périmètre de ce lot de sécurité.
-- `auth.uid()` était déjà qualifié ; `now()` se résout depuis `pg_catalog`,
-- toujours implicitement présent dans le chemin, comme dans toutes les
-- fonctions du dépôt déclarées avec `search_path = ''`.
--
-- Pourquoi `search_path = ''` : ces fonctions sont `security definer` et
-- appartiennent à `postgres`. Avec `search_path = 'public'`, le schéma
-- temporaire reste implicitement consulté en premier pour les tables, ce qui
-- est le vecteur de substitution classique sur ce type de fonction. Le dépôt
-- a tranché en faveur de `search_path = ''` avec objets qualifiés lors de la
-- correction de `current_garage_id()` (20260902000300).
--
-- Qui garde le droit, et pourquoi. `authenticated` : c'est le seul appelant
-- constaté, le composant de réglages du tableau de bord
-- (`components/NexoraDashboard.jsx`), sous session authentifiée. Aucune page
-- publique, aucune route serveur, aucun appel avec le rôle de service dans
-- le dépôt. `service_role` : conservé **temporairement**, sur décision du
-- porteur du projet, en attendant un audit séparé des workflows n8n, qui
-- vivent hors du dépôt et n'ont pas été inspectés.
--
-- Attention au détail qui rend le `grant` à `service_role` indispensable :
-- en Production, ce rôle n'a aucun droit nominatif sur ces deux fonctions,
-- il passe aujourd'hui par le `GRANT` à `PUBLIC`. Fermer `PUBLIC` sans
-- regrant explicite lui retirerait donc l'accès en Production, alors qu'il
-- le conserverait sur Test où le droit est nominatif. Le `grant` ci-dessous
-- aligne les deux projets sur le même état.

create or replace function public.set_stripe_secret_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_garage_id uuid;
begin
  select id into v_garage_id from public.garages where owner_user_id = auth.uid();
  if v_garage_id is null then
    raise exception 'Aucun garage associe a cet utilisateur';
  end if;
  insert into public.garages_secrets (garage_id, stripe_secret_key, updated_at)
  values (v_garage_id, p_key, now())
  on conflict (garage_id) do update
    set stripe_secret_key = excluded.stripe_secret_key, updated_at = now();
end;
$function$;

create or replace function public.stripe_configure_pour_mon_garage()
returns boolean
language sql
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.garages_secrets gs
    join public.garages g on g.id = gs.garage_id
    where g.owner_user_id = auth.uid()
      and gs.stripe_secret_key is not null
      and gs.stripe_secret_key != ''
  );
$function$;

comment on function public.set_stripe_secret_key(text) is
  'Enregistre la clé Stripe du garage dont l''appelant est propriétaire. Réservée à authenticated depuis le 2026-09-05. Ne consigne jamais la valeur ailleurs que dans garages_secrets.';

comment on function public.stripe_configure_pour_mon_garage() is
  'Indique si le garage dont l''appelant est propriétaire a une clé Stripe enregistrée. Ne renvoie jamais la valeur elle-même. Réservée à authenticated depuis le 2026-09-05.';

-- `create or replace` conserve l'ACL existante : les révocations doivent
-- donc être explicites, et venir après. `PUBLIC` est révoqué en premier —
-- c'est par lui que passait l'accès anonyme en Production, où `anon`
-- n'apparaissait dans aucun GRANT nominatif.
revoke execute on function public.set_stripe_secret_key(text) from public;
revoke execute on function public.set_stripe_secret_key(text) from anon;
revoke execute on function public.stripe_configure_pour_mon_garage() from public;
revoke execute on function public.stripe_configure_pour_mon_garage() from anon;

grant execute on function public.set_stripe_secret_key(text) to authenticated;
grant execute on function public.stripe_configure_pour_mon_garage() to authenticated;

-- Conservé temporairement, à réexaminer après l'audit n8n. Ce `grant` est
-- nécessaire et non redondant : sans lui, la fermeture de `PUBLIC`
-- ci-dessus retirerait l'accès à `service_role` en Production.
grant execute on function public.set_stripe_secret_key(text) to service_role;
grant execute on function public.stripe_configure_pour_mon_garage() to service_role;

-- Vérification dans la transaction de la migration : si l'un des privilèges
-- subsistait, ou si le search_path n'avait pas pris, la migration échoue au
-- lieu de laisser croire qu'elle a durci quelque chose.
do $$
declare
  v_restants text := '';
  v_fn text;
  v_oid oid;
begin
  foreach v_fn in array array[
    'public.set_stripe_secret_key(text)',
    'public.stripe_configure_pour_mon_garage()'
  ] loop
    v_oid := v_fn::regprocedure;

    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      v_restants := v_restants || v_fn || ' encore ouverte a anon; ';
    end if;
    if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      v_restants := v_restants || v_fn || ' a perdu service_role, conserve volontairement; ';
    end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      v_restants := v_restants || v_fn || ' n''est plus appelable par authenticated; ';
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_oid and p.proconfig @> array['search_path=""']
    ) then
      v_restants := v_restants || v_fn || ' n''a pas search_path vide; ';
    end if;
  end loop;

  if v_restants <> '' then
    raise exception 'lot securite stripe: %', v_restants;
  end if;
end;
$$;
