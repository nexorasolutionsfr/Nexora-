-- Revenue Recovery V1 — correctif : transition de statut des tentatives.
-- Migration additive, idempotente, non destructive.
--
-- Contradiction corrigée : la migration précédente (20260831000400)
-- déclarait le contenu d'une tentative immuable et n'accordait aucun GRANT
-- update à `authenticated`, mais ne donnait alors AUCUN moyen réel de faire
-- passer une tentative de "en_preparation" à "envoyee"/"echec" — le modèle
-- était incomplet, pas seulement strict.
--
-- Choix retenu (explicite, entre les deux options possibles) : la
-- tentative reste une table physique (nécessaire : l'index unique partiel
-- d'idempotence a besoin d'une colonne "statut" réelle, une dérivation pure
-- par événements ne peut pas porter une contrainte d'unicité). Seuls
-- `statut` et `erreur` peuvent changer, exclusivement via cette fonction
-- SECURITY DEFINER étroite — jamais par un GRANT update général au
-- frontend. Le contenu envoyé, le destinataire, le canal, la clé
-- d'idempotence et toutes les colonnes d'origine restent physiquement
-- non modifiables (aucune voie d'écriture ne les touche, ici ou ailleurs).

create or replace function public.revenue_recovery_marquer_tentative(
  p_tentative_id uuid,
  p_statut text,
  p_erreur text default null
)
returns public.revenue_recovery_tentatives
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentative public.revenue_recovery_tentatives;
begin
  if p_statut not in ('envoyee', 'echec') then
    raise exception 'Statut cible invalide : % (seuls envoyee/echec sont atteignables depuis cette fonction)', p_statut;
  end if;

  -- Verrou de ligne : sérialise deux appels concurrents sur la même
  -- tentative (ex. retry réseau qui se chevauche avec le traitement
  -- original) — l'un des deux échouera sur la vérification de statut
  -- ci-dessous plutôt que de créer un état incohérent.
  select * into v_tentative
  from public.revenue_recovery_tentatives
  where id = p_tentative_id
  for update;

  if not found then
    raise exception 'Tentative % introuvable', p_tentative_id;
  end if;

  -- SECURITY DEFINER contourne le RLS : la vérification d'appartenance au
  -- garage de l'appelant doit donc être refaite explicitement ici.
  if not exists (
    select 1 from public.garages
    where id = v_tentative.garage_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé à la tentative %', p_tentative_id;
  end if;

  -- Transition autorisée uniquement depuis en_preparation : un état
  -- terminal (envoyee/echec) ne peut plus être modifié, même vers lui-même.
  if v_tentative.statut <> 'en_preparation' then
    raise exception 'Transition refusée : tentative % déjà au statut définitif %', p_tentative_id, v_tentative.statut;
  end if;

  update public.revenue_recovery_tentatives
  set statut = p_statut, erreur = p_erreur
  where id = p_tentative_id
  returning * into v_tentative;

  -- Le journal d'événements est mis à jour dans la même transaction que le
  -- changement de statut : jamais désynchronisé, jamais oublié par un futur
  -- appelant. Le trigger existant sur revenue_recovery_evenements force de
  -- toute façon acteur/created_at et revérifie la cohérence garage.
  insert into public.revenue_recovery_evenements
    (garage_id, travail_differe_id, tentative_id, type_evenement, detail)
  values (
    v_tentative.garage_id,
    v_tentative.travail_differe_id,
    v_tentative.id,
    case when p_statut = 'envoyee' then 'envoi_reussi' else 'envoi_echec' end,
    p_erreur
  );

  return v_tentative;
end;
$$;

-- Ce projet Supabase accorde EXECUTE par défaut à anon, authenticated ET
-- service_role au moment de la création d'une fonction dans le schéma
-- public (privilèges par défaut configurés au niveau du schéma) — pas
-- seulement à PUBLIC. Un simple `revoke all ... from public` ne retire donc
-- pas ces GRANT directs : chaque rôle applicatif doit être révoqué
-- explicitement, avant tout nouveau GRANT.
--
-- Aucun rôle applicatif n'a besoin d'appeler cette fonction aujourd'hui :
-- déclarer un envoi comme réussi/échoué doit venir de la couche serveur qui
-- a réellement parlé au fournisseur d'email, jamais d'un utilisateur
-- connecté (authenticated) ni d'un accès anonyme (anon). service_role
-- n'est pas non plus accordé ici : le lot d'envoi qui l'utilisera réellement
-- n'existe pas encore, et un GRANT prématuré serait une porte ouverte sans
-- code pour la garder fermée.
revoke all on function public.revenue_recovery_marquer_tentative(uuid, text, text) from public;
revoke all on function public.revenue_recovery_marquer_tentative(uuid, text, text) from anon;
revoke all on function public.revenue_recovery_marquer_tentative(uuid, text, text) from authenticated;
revoke all on function public.revenue_recovery_marquer_tentative(uuid, text, text) from service_role;
-- Aucun GRANT à personne : fonction volontairement inappelable par tout
-- rôle applicatif tant que le lot d'envoi n'existe pas.

comment on function public.revenue_recovery_marquer_tentative(uuid, text, text) is
  'Seul point d''écriture autorisé sur statut/erreur d''une tentative. Fermée à anon/authenticated/service_role : non appelée par aucun code applicatif dans cette session (aucun envoi implémenté), sera ouverte à service_role uniquement quand le lot d''envoi existera réellement.';
