-- Lot sécurité anon — 2/3 : les deux fonctions Stripe.
--
-- Trois choses, et rien d'autre :
--   1. les verser dans l'historique versionné — elles n'existaient qu'en
--      base, comme `rls_auto_enable` ;
--   2. fixer `search_path = ''` et qualifier les objets par leur schéma ;
--   3. fermer `PUBLIC`, `anon` et `service_role`, ne garder que
--      `authenticated`.
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
-- Pourquoi `authenticated` seulement : les deux fonctions ne sont appelées
-- que par le composant de réglages du tableau de bord
-- (`components/NexoraDashboard.jsx`, sous session authentifiée). Aucune page
-- publique, aucune route serveur, aucun appel avec le rôle de service dans
-- le dépôt. La révocation de `service_role` repose sur une hypothèse non
-- vérifiable ici — les workflows n8n vivent hors du dépôt : si l'un d'eux
-- appelait ces fonctions, retirer les deux lignes marquées ci-dessous suffit
-- à la lever.

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

-- Les deux lignes à retirer si un automate n8n devait conserver l'accès.
revoke execute on function public.set_stripe_secret_key(text) from service_role;
revoke execute on function public.stripe_configure_pour_mon_garage() from service_role;

grant execute on function public.set_stripe_secret_key(text) to authenticated;
grant execute on function public.stripe_configure_pour_mon_garage() to authenticated;

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
    if has_function_privilege('service_role', v_oid, 'EXECUTE') then
      v_restants := v_restants || v_fn || ' encore ouverte a service_role; ';
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
