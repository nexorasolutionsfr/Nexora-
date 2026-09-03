-- Notifications de devis résilientes V1 — statut de traitement explicite.
--
-- PROBLÈME RÉSOLU (constaté sur Production le 2026-09-03) :
-- `notifications_devis.envoye` est un `boolean NOT NULL DEFAULT false`
-- (vérifié en lecture seule sur Test ET Production). Il ne porte donc que
-- deux états. Une notification dont une donnée intermédiaire manque
-- (devis, client, véhicule ou garage introuvable) ne peut ni être envoyée
-- ni être sortie de la file : elle reste à `envoye = false` et le workflow
-- n8n la reprend à chaque passage planifié, échouant à chaque fois.
-- Deux lignes bloquées produisaient à elles seules ~1 589 exécutions en
-- erreur sur 7 jours, soit ~82 % de toutes les erreurs de l'instance n8n.
--
-- CHOIX DE CONCEPTION : `envoye` n'est PAS modifié, ni converti, ni
-- remplacé. Une colonne distincte porte le cycle de traitement complet.
-- Le workflow n8n écrira les deux (double écriture), ce qui garde `envoye`
-- comme source de vérité pour tout consommateur existant et rend le retour
-- arrière purement comportemental (republier la version n8n précédente),
-- sans migration inverse ni suppression de colonne.
--
-- PREUVES AYANT GUIDÉ CETTE MIGRATION (lecture seule, Test + Production) :
--   - `notifications_devis` : created_at, devis_id (uuid NULL),
--     envoye (boolean NOT NULL default false), id (uuid NOT NULL default
--     gen_random_uuid()), type (text NOT NULL default 'nouveau').
--     Structure identique dans les deux environnements.
--   - Pas de colonne `garage_id` : le rattachement au garage passe
--     obligatoirement par la jointure vers `devis` (`devis.garage_id`
--     existe dans les deux environnements).
--   - RLS active, AUCUNE policy sur cette table : elle est fermée par
--     défaut à anon et authenticated. Aucune policy n'est ajoutée ici —
--     l'accès applicatif passe exclusivement par les trois RPC ci-dessous.
--   - Aucun privilège au niveau colonne (min(colonnes par grantee) =
--     nombre total de colonnes, dans les deux environnements) : les droits
--     sont accordés au niveau table, la nouvelle colonne en hérite
--     automatiquement. Aucun GRANT de table n'est donc nécessaire ici.
--     Ce point est vérifié, pas supposé.
--
-- CETTE MIGRATION NE DOIT PAS ÊTRE REJOUÉE : aucun `if not exists`, aucun
-- `create or replace`. Un second passage doit échouer bruyamment.
-- Elle ne supprime rien, ne modifie aucune donnée existante autrement que
-- par la reprise explicite ci-dessous, et ne crée aucune policy.

begin;

-- =====================================================================
-- 1. Colonnes ajoutées SANS défaut ni contrainte
--    (la reprise doit rester explicite et vérifiable, pas implicite)
-- =====================================================================

alter table public.notifications_devis add column statut_traitement text;
alter table public.notifications_devis add column incomplet_motif   text;

-- =====================================================================
-- 2. Reprise explicite des lignes existantes
--
--    `envoye` est NOT NULL (vérifié) : deux branches couvrent la totalité
--    des lignes, aucun cas NULL n'est possible.
--
--    `envoye = true`  -> 'envoye'      : sans ambiguïté.
--    `envoye = false` -> 'en_attente'  : choix conservateur assumé. Une
--    ligne à false peut être légitimement en attente OU définitivement
--    bloquée ; distinguer les deux exigerait de lire le contenu des
--    lignes, ce que cette mission s'interdit. 'en_attente' préserve
--    exactement le comportement actuel ; le workflow n8n reclassera
--    lui-même en 'incomplet' celles qui le sont réellement, dès son
--    premier passage après correction. Le choix inverse aurait masqué du
--    travail réellement en attente.
-- =====================================================================

update public.notifications_devis
set statut_traitement = case when envoye then 'envoye' else 'en_attente' end;

-- =====================================================================
-- 3. Garde-fou : la migration s'interrompt si une ligne a échappé à la
--    reprise (impossible en théorie, bloquant en pratique).
-- =====================================================================

do $$
declare
  v_restant integer;
begin
  select count(*) into v_restant
  from public.notifications_devis
  where statut_traitement is null;

  if v_restant <> 0 then
    raise exception 'Reprise incomplete : % ligne(s) sans statut_traitement', v_restant;
  end if;
end;
$$;

-- =====================================================================
-- 4. Verrouillage du domaine, seulement une fois toutes les lignes
--    conformes (ordre volontaire : contraindre avant la reprise aurait
--    fait échouer la migration sur les lignes existantes).
-- =====================================================================

alter table public.notifications_devis
  alter column statut_traitement set default 'en_attente',
  alter column statut_traitement set not null;

alter table public.notifications_devis
  add constraint notifications_devis_statut_traitement_check
  check (statut_traitement in ('en_attente', 'envoye', 'incomplet', 'erreur', 'abandonne'));

-- Le motif est un code court fermé, jamais du texte libre : c'est ce qui
-- garantit qu'aucune donnée client ne peut transiter par cette colonne,
-- même si le workflow n8n était modifié par erreur. La traduction en
-- français lisible est faite côté interface.
alter table public.notifications_devis
  add constraint notifications_devis_incomplet_motif_check
  check (
    incomplet_motif is null
    or incomplet_motif in (
      'devis_absent',
      'client_absent',
      'vehicule_absent',
      'garage_absent',
      'donnees_incompletes'
    )
  );

-- Aucune contrainte de cohérence entre `incomplet_motif` et
-- `statut_traitement` n'est posée volontairement : un motif conservé sur
-- une ligne passée à 'abandonne' reste une information utile, et une telle
-- contrainte compliquerait les RPC sans bénéfice de sécurité.

create index notifications_devis_statut_traitement_idx
  on public.notifications_devis (statut_traitement);

-- =====================================================================
-- 5. RPC — accès applicatif exclusif à cette table
--
--    AUCUN paramètre `garage_id` : un navigateur ne doit jamais pouvoir
--    désigner le périmètre qu'il consulte. Le garage est déterminé côté
--    serveur par public.current_garage_id(), dont l'état a été vérifié en
--    lecture seule sur Test ET Production le 2026-09-03 :
--    SECURITY DEFINER, STABLE, `search_path = ''`, référence qualifiée
--    (`public.garages`) — correctif 20260902000300 bien déployé des deux
--    côtés.
--
--    current_garage_id() retourne NULL lorsque le compte ne possède aucun
--    garage (cas d'anon, où auth.uid() est nul). Les trois fonctions
--    refusent ce cas explicitement plutôt que de laisser une comparaison
--    à NULL décider silencieusement.
--
--    Ces fonctions sont SECURITY DEFINER : elles franchissent la RLS.
--    C'est précisément pourquoi le filtrage par garage est fait à
--    l'intérieur, et pourquoi leur droit d'exécution est fermé puis
--    regrant au seul rôle `authenticated` (section 6).
-- =====================================================================

create function public.notifications_a_verifier()
returns table (
  id       uuid,
  cree_le  timestamptz,
  motif    text,
  devis_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.created_at, n.incomplet_motif, n.devis_id
  from public.notifications_devis n
  join public.devis d on d.id = n.devis_id
  where n.statut_traitement = 'incomplet'
    and public.current_garage_id() is not null
    and d.garage_id = public.current_garage_id()
  order by n.created_at asc
$$;

comment on function public.notifications_a_verifier() is
  'Notifications de devis bloquees faute de donnees, du garage du compte connecte. Perimetre determine cote serveur.';

create function public.notification_reessayer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage uuid;
begin
  v_garage := public.current_garage_id();
  if v_garage is null then
    raise exception 'Aucun garage associe au compte connecte';
  end if;

  update public.notifications_devis n
  set statut_traitement = 'en_attente',
      incomplet_motif   = null
  from public.devis d
  where n.id = p_id
    and d.id = n.devis_id
    and d.garage_id = v_garage
    and n.statut_traitement = 'incomplet';

  if not found then
    raise exception 'Notification introuvable, deja traitee, ou hors perimetre';
  end if;
end;
$$;

comment on function public.notification_reessayer(uuid) is
  'Remet une notification incomplete en file. Le prochain passage planifie la reprendra.';

create function public.notification_abandonner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage uuid;
begin
  v_garage := public.current_garage_id();
  if v_garage is null then
    raise exception 'Aucun garage associe au compte connecte';
  end if;

  update public.notifications_devis n
  set statut_traitement = 'abandonne'
  from public.devis d
  where n.id = p_id
    and d.id = n.devis_id
    and d.garage_id = v_garage
    and n.statut_traitement = 'incomplet';

  if not found then
    raise exception 'Notification introuvable, deja traitee, ou hors perimetre';
  end if;
end;
$$;

comment on function public.notification_abandonner(uuid) is
  'Sort definitivement une notification incomplete de la file, sans la supprimer.';

-- =====================================================================
-- 6. Matrice ACL complète des trois RPC
--
--    `revoke ... from public` suffirait fonctionnellement, mais anon,
--    authenticated et service_role sont révoqués explicitement pour que
--    l'intention soit lisible dans le catalogue et qu'un GRANT ajouté
--    ailleurs par erreur soit annulé par un rejeu de cette section.
--
--    service_role est révoqué volontairement : n8n n'utilise pas ces RPC,
--    il écrit directement avec sa clé de service. La surface reste donc
--    minimale.
-- =====================================================================

revoke all on function public.notifications_a_verifier()    from public, anon, authenticated, service_role;
revoke all on function public.notification_reessayer(uuid)  from public, anon, authenticated, service_role;
revoke all on function public.notification_abandonner(uuid) from public, anon, authenticated, service_role;

grant execute on function public.notifications_a_verifier()    to authenticated;
grant execute on function public.notification_reessayer(uuid)  to authenticated;
grant execute on function public.notification_abandonner(uuid) to authenticated;

commit;
