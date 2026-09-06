-- Sortir les identifiants de l'application Google des variables d'environnement.
--
-- CE QUI NE MARCHAIT PAS
--
-- Le nœud n8n « Rafraîchir le jeton Google » composait son corps de requête
-- avec `$env.GOOGLE_CLIENT_ID` et `$env.GOOGLE_CLIENT_SECRET`. Or le
-- docker-compose pose `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, qui interdit aux
-- nœuds de lire l'environnement : chaque exécution échouait sur
-- « access to env vars denied ». Le workflow n'ayant jamais tourné jusqu'ici,
-- personne n'avait rencontré ce blocage.
--
-- POURQUOI ON NE LÈVE PAS LE BLOCAGE
--
-- Passer le drapeau à `false` rendrait TOUTES les variables d'environnement
-- lisibles depuis n'importe quel nœud — dont la clé Supabase. Ce serait
-- défaire, du côté de l'automatisation, le durcissement mené du côté de la
-- base. On déplace donc le secret plutôt que d'ouvrir l'environnement.
--
-- POURQUOI UNE TABLE ET UNE VUE, PLUTÔT QUE DEUX COLONNES
--
-- Ces identifiants appartiennent à l'APPLICATION, pas à une boîte mail : les
-- recopier sur chaque ligne d'`email_connections` en ferait des doublons à
-- faire vivre, et le jour où le secret tourne il faudrait les corriger tous.
--
-- La vue résout l'autre moitié du problème : le nœud de rafraîchissement lit
-- déjà `$json.refresh_token`, donc une ligne de connexion est dans sa portée.
-- En faisant lire la VUE au nœud qui liste les connexions, `client_id` et
-- `client_secret` arrivent dans la même ligne — aucun nœud à ajouter au
-- canevas, ce qui évite une manipulation risquée sur un workflow de 124 nœuds.

create table if not exists public.oauth_applications (
  provider      text primary key,
  client_id     text not null,
  client_secret text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.oauth_applications is
  'Identifiants des applications OAuth (client_id / client_secret), au niveau de l''application et non de la connexion. Lisible par le seul service_role, comme email_connections qui porte déjà les jetons.';

-- Même posture qu'`email_connections`, qui stocke déjà des jetons Google :
-- RLS active, aucune policy, donc aucun rôle client n'atteint la table. Seul
-- `service_role`, qui contourne RLS et par lequel n8n se connecte, y accède.
alter table public.oauth_applications enable row level security;

revoke all on table public.oauth_applications from public;
revoke all on table public.oauth_applications from anon;
revoke all on table public.oauth_applications from authenticated;
grant select, insert, update, delete on table public.oauth_applications to service_role;

-- La vue joint chaque connexion aux identifiants de son fournisseur.
-- `security_invoker = true` : les droits de l'appelant s'appliquent, la vue
-- n'ouvre donc rien de plus que ce que l'appelant pouvait déjà lire.
create or replace view public.email_connections_avec_app
with (security_invoker = true) as
  select
    e.*,
    a.client_id,
    a.client_secret
  from public.email_connections e
  join public.oauth_applications a on a.provider = e.provider;

comment on view public.email_connections_avec_app is
  'email_connections enrichie des identifiants OAuth de l''application. Sert au nœud n8n qui liste les connexions Gmail, pour que le rafraîchissement du jeton n''ait plus besoin des variables d''environnement.';

revoke all on public.email_connections_avec_app from public;
revoke all on public.email_connections_avec_app from anon;
revoke all on public.email_connections_avec_app from authenticated;
grant select on public.email_connections_avec_app to service_role;

-- Vérification dans la transaction : l'état visé, et rien d'autre.
do $$
declare
  v_pb text := '';
begin
  if has_table_privilege('anon', 'public.oauth_applications', 'SELECT')
     or has_table_privilege('authenticated', 'public.oauth_applications', 'SELECT') then
    v_pb := v_pb || E'\n- oauth_applications est lisible par un role client';
  end if;

  if has_table_privilege('anon', 'public.email_connections_avec_app', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_connections_avec_app', 'SELECT') then
    v_pb := v_pb || E'\n- la vue est lisible par un role client';
  end if;

  if not has_table_privilege('service_role', 'public.email_connections_avec_app', 'SELECT') then
    v_pb := v_pb || E'\n- service_role ne peut pas lire la vue : n8n ne pourrait plus rafraichir les jetons';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='oauth_applications' and c.relrowsecurity
  ) then
    v_pb := v_pb || E'\n- RLS n''est pas active sur oauth_applications';
  end if;

  if v_pb <> '' then
    raise exception 'Etat vise non atteint : %', v_pb;
  end if;

  raise notice 'oauth_applications et sa vue : etat verifie';
end;
$$;
