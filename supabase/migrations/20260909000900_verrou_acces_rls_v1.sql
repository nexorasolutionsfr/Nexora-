-- L'accès fermé devient une règle de la BASE, plus seulement de l'interface.
--
-- CE QUI EXISTAIT
--
-- `acces_garage_ouvert()` était écrite, testée, et utilisée par ZÉRO policy.
-- Le garde vivait uniquement dans `NexoraDashboard.jsx`, dont le commentaire
-- affirmait pourtant « l'autorité reste la base ». Elle ne l'était pas : un
-- essai échu n'empêchait aucune lecture ni aucune écriture par l'API.
--
-- DEUX FAMILLES DE POLICIES, ET UN PIÈGE
--
-- L'inventaire a montré que fermer `current_garage_id()` n'aurait couvert que
-- la MOITIÉ des tables :
--
--   Famille 1 — 15 policies passent par `current_garage_id()` :
--     actions_ia, clients, demandes, devis, factures, liste_attente,
--     mecaniciens, notifications_atelier, prestations, propositions_rdv,
--     rendez_vous, vehicules.
--
--   Famille 2 — 20 policies portent la sous-requête en clair :
--     `garage_id in (select id from garages where owner_user_id = auth.uid())`
--     inspections*, ordres_reparation*, devis_lignes, travaux_differes*,
--     revenue_recovery_*, opportunites_actions, rappels_manques,
--     erreurs_automatisation.
--
-- Ne traiter que la première aurait laissé les ordres de réparation et les
-- contrôles véhicule entièrement ouverts, ce qui est précisément le cœur du
-- produit. Les deux familles passent donc désormais par la même porte.
--
-- CE QUI RESTE OUVERT, ET POURQUOI
--
--   · `garages` — le garage lit toujours sa propre ligne. Sans ça, l'écran
--     « votre accès est terminé » ne saurait pas quoi afficher, et la route de
--     paiement ne pourrait plus retrouver le garage pour le réabonner. Fermer
--     cette table enfermerait le garage dehors sans porte.
--
--   · Les liens publics (devis, facture, atelier, contrôle par jeton) — ce
--     sont des fonctions SECURITY DEFINER qui ne passent par aucune de ces
--     policies. Un client qui a reçu un devis ne doit pas être puni parce que
--     l'essai de son garagiste a expiré : il n'y est pour rien, et le lien
--     qu'on lui a envoyé doit continuer de fonctionner.
--
-- LE SENS DE LA RÈGLE
--
-- Fermé par défaut. `mes_garages_ouverts()` ne rend rien quand l'accès est
-- clos, et une policy qui ne trouve aucun garage ne laisse passer aucune
-- ligne. La vérification en fin de migration s'assure en retour qu'AUCUN
-- garage existant ne se retrouve fermé — un contrôle d'accès qui ferme trop
-- est aussi grave qu'un contrôle qui ouvre trop.

begin;

-- ── La porte unique ─────────────────────────────────────────────────────────

create or replace function public.mes_garages_ouverts()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select g.id
  from public.garages g
  where g.owner_user_id = auth.uid()
    -- On appelle la règle plutôt que de la recopier : deux définitions de
    -- « l'accès est ouvert » finiraient par diverger, et le jour où elles
    -- divergent, l'une des deux laisse passer ce que l'autre refuse.
    and public.acces_garage_ouvert(g.id)
$$;

comment on function public.mes_garages_ouverts() is
  'Les garages que le compte connecté peut utiliser : les siens, et dont l''accès est ouvert. Porte unique des policies.';

-- `anon` DOIT pouvoir exécuter cette fonction, et ce n'est pas une largesse.
--
-- 22 policies du schéma s'appliquent au rôle `public`, donc à `anon`. Une
-- requête anonyme sur ces tables évalue donc la policy, donc appelle cette
-- fonction. Sans le droit, PostgreSQL renvoie « permission denied for function »
-- au lieu d'une liste vide — une erreur 401 là où le comportement correct est
-- « tu ne vois rien ».
--
-- Vérifié : la première version de cette migration révoquait `anon`, et toute
-- lecture anonyme de `clients`, `rendez_vous`, `prestations` ou
-- `ordres_reparation` renvoyait aussitôt cette erreur.
--
-- Le droit ne fuit rien : la fonction filtre sur `owner_user_id = auth.uid()`,
-- qui vaut NULL pour un visiteur anonyme. Elle ne rend donc jamais une ligne.
revoke all on function public.mes_garages_ouverts() from public, service_role;
grant execute on function public.mes_garages_ouverts() to authenticated, anon;

-- ── Famille 1 : une seule fonction à changer ────────────────────────────────

create or replace function public.current_garage_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select * from public.mes_garages_ouverts() limit 1
$$;

-- Même raison, et c'était déjà le cas avant cette migration : `anon` avait le
-- droit d'exécuter `current_garage_id()`. Le lui retirer aurait transformé un
-- « rien à voir » silencieux en erreur bruyante.
revoke all on function public.current_garage_id() from public, service_role;
grant execute on function public.current_garage_id() to authenticated, anon;

-- ── Famille 2 : la sous-requête en clair passe par la même porte ────────────
--
-- La réécriture est CHIRURGICALE : on ne remplace que la sous-requête
-- elle-même, en laissant intact tout ce qui l'entoure. Une policy qui
-- porterait une condition supplémentaire la conserve.
--
-- Le filtre de sélection compare les expressions débarrassées de leurs
-- espaces : PostgreSQL réécrit et reformate les expressions de policy, donc
-- comparer le texte brut ne trouverait rien.

do $$
declare
  p record;
  nouveau_qual text;
  nouveau_wc   text;
  motif constant text :=
    'SELECT\s+garages\.id\s+FROM\s+garages\s+WHERE\s*\(\s*garages\.owner_user_id\s*=\s*auth\.uid\(\)\s*\)';
  traitees integer := 0;
begin
  for p in
    select tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename <> 'garages'
      and regexp_replace(coalesce(qual, '') || coalesce(with_check, ''), '\s', '', 'g')
          like '%garage_idIN(SELECTgarages.idFROMgaragesWHERE(garages.owner_user_id=auth.uid()))%'
  loop
    nouveau_qual := regexp_replace(p.qual, motif, 'SELECT public.mes_garages_ouverts()', 'g');
    nouveau_wc   := regexp_replace(p.with_check, motif, 'SELECT public.mes_garages_ouverts()', 'g');

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format(
      'create policy %I on public.%I as %s for %s to %s %s %s',
      p.policyname,
      p.tablename,
      p.permissive,
      p.cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(p.roles) as r),
      case when nouveau_qual is null then '' else 'using (' || nouveau_qual || ')' end,
      case when nouveau_wc is null then '' else 'with check (' || nouveau_wc || ')' end
    );
    traitees := traitees + 1;
  end loop;

  -- Zéro policy réécrite n'est PAS une erreur : c'est ce qui se passe si la
  -- migration est rejouée, tout étant déjà en place. C'est la vérification
  -- finale qui juge du résultat, pas ce compteur.
  raise notice '% policies reecrites vers mes_garages_ouverts()', traitees;
end $$;

-- ── Vérification ────────────────────────────────────────────────────────────

do $$
declare
  restantes  integer;
  fermes     integer;
  couvertes  integer;
  garages_ok integer;
begin
  -- 1. Plus aucune policy ne porte la sous-requête en clair.
  select count(*) into restantes
  from pg_policies
  where schemaname = 'public' and tablename <> 'garages'
    and regexp_replace(coalesce(qual, '') || coalesce(with_check, ''), '\s', '', 'g')
        like '%garage_idIN(SELECTgarages.idFROMgaragesWHERE(garages.owner_user_id=auth.uid()))%';
  if restantes > 0 then
    raise exception '% policies contournent encore le verrou d''acces', restantes;
  end if;

  -- 2. Les deux familles passent bien par la porte.
  select count(*) into couvertes
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%mes_garages_ouverts%';
  if couvertes = 0 then
    raise exception 'Aucune policy ne reference mes_garages_ouverts()';
  end if;
  raise notice '% policies passent par mes_garages_ouverts(), plus % via current_garage_id()',
    couvertes,
    (select count(*) from pg_policies where schemaname='public'
       and (coalesce(qual,'')||coalesce(with_check,'')) like '%current_garage_id%');

  -- 3. LE POINT QUI COMPTE : personne ne perd l'acces.
  --    Un controle qui ferme trop est aussi grave qu'un controle qui ouvre trop.
  select count(*) into fermes
  from public.garages g
  where not public.acces_garage_ouvert(g.id);
  if fermes > 0 then
    raise exception '% garage(s) auraient l''acces coupe par ce verrou', fermes;
  end if;

  select count(*) into garages_ok from public.garages;
  raise notice 'verrou pose, % garage(s) tous ouverts', garages_ok;

  -- 4. Le garage doit continuer a lire SA PROPRE ligne, meme acces ferme :
  --    sans cela, l'ecran « votre acces est termine » n'a rien a afficher et
  --    la route de paiement ne peut plus le retrouver pour le reabonner.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages' and cmd = 'SELECT'
      and coalesce(qual, '') like '%owner_user_id%'
      and coalesce(qual, '') not like '%acces_garage_ouvert%'
      and coalesce(qual, '') not like '%mes_garages_ouverts%'
  ) then
    raise exception 'La lecture de sa propre ligne garages est conditionnee a l''acces : le garage serait enferme dehors sans porte';
  end if;

  -- 5. Les deux roles qui evaluent des policies doivent pouvoir appeler les
  --    deux fonctions. 22 policies s'appliquent au role `public`, donc a
  --    `anon` : sans le droit, une requete anonyme recoit « permission denied
  --    for function » au lieu d'une liste vide.
  --
  --    Ce piege a ete rencontre pour de vrai : la premiere version de cette
  --    migration revoquait `anon`, et toute lecture anonyme echouait en 401.
  if not has_function_privilege('authenticated', 'public.mes_garages_ouverts()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.mes_garages_ouverts()', 'EXECUTE') then
    raise exception 'mes_garages_ouverts() est fermee a authenticated ou a anon : les policies leveraient une erreur au lieu de filtrer';
  end if;
  if not has_function_privilege('authenticated', 'public.current_garage_id()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.current_garage_id()', 'EXECUTE') then
    raise exception 'current_garage_id() est fermee a authenticated ou a anon : les policies leveraient une erreur au lieu de filtrer';
  end if;
end $$;

commit;
