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

-- Par défaut, PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle
-- fonction : révoqué explicitement, puis ré-accordé seulement à
-- authenticated. Jamais à anon.
revoke all on function public.revenue_recovery_marquer_tentative(uuid, text, text) from public;
grant execute on function public.revenue_recovery_marquer_tentative(uuid, text, text) to authenticated;

comment on function public.revenue_recovery_marquer_tentative(uuid, text, text) is
  'Seul point d''écriture autorisé sur statut/erreur d''une tentative. N''est appelé par aucun code applicatif dans cette session (aucun envoi implémenté) — prépare uniquement la transition pour le lot d''envoi futur.';
