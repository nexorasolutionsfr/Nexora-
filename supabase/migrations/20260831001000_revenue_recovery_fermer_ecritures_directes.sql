-- Revenue Recovery V1 — correctif : ferme les écritures directes que la
-- Data API laissait encore ouvertes au navigateur.
-- Migration additive côté schéma (uniquement des REVOKE), non destructive.
--
-- Deux failles confirmées :
--
-- 1. `authenticated` avait INSERT direct sur revenue_recovery_tentatives et
--    revenue_recovery_evenements. Un utilisateur connecté aurait pu créer
--    une tentative ou un événement d'audit directement via la Data API,
--    en contournant toute vérification d'éligibilité, d'activation par
--    garage, de permission ou de transition — aucune de ces validations
--    ne vit dans une contrainte de table, seulement dans les fonctions
--    métier. Un GRANT insert direct sur ces deux tables rendait donc ces
--    fonctions contournables, pas obligatoires.
--
-- 2. `authenticated` avait EXECUTE sur revenue_recovery_marquer_tentative().
--    Un utilisateur connecté aurait pu déclarer lui-même un email comme
--    "envoyé" ou "en échec", sans que l'envoi ait réellement eu lieu —
--    cette déclaration doit venir de la couche serveur qui a réellement
--    parlé au fournisseur d'email, jamais du client.
--
-- Correctif : fermeture complète des deux. Aucune fonction de remplacement
-- n'est créée ici pour la création d'une tentative — elle dépend du futur
-- lot d'envoi et devra, dans la même transaction, vérifier le garage
-- activé, la permission autorisée, l'absence d'opposition et
-- l'idempotence. Ce lot est explicitement hors périmètre de cette session
-- (aucun envoi, aucune interface). Le seul effet observable aujourd'hui :
-- revenue_recovery_tentatives et revenue_recovery_evenements deviennent
-- entièrement en lecture seule pour authenticated (elles l'étaient déjà
-- pour tout le reste : aucun update, aucun delete n'a jamais été accordé).

revoke insert on public.revenue_recovery_tentatives from authenticated;
revoke insert on public.revenue_recovery_evenements from authenticated;

revoke execute on function public.revenue_recovery_marquer_tentative(uuid, text, text) from authenticated;
-- Le `revoke all ... from public` de la migration 20260831000600 reste en
-- place : PUBLIC n'a jamais eu de droit implicite sur cette fonction.
-- Après ce correctif, plus aucun rôle applicatif (authenticated, anon)
-- n'a EXECUTE dessus — seule une future couche serveur, avec des
-- identifiants privilégiés et son propre scope garage vérifié, pourra
-- l'appeler (même posture que revenue_recovery_definir_autorisation_garage,
-- déjà fermée de la même façon depuis 20260831000900).

comment on function public.revenue_recovery_marquer_tentative(uuid, text, text) is
  'Seul point d''écriture autorisé sur statut/erreur d''une tentative. Fermé à authenticated et anon : appelable uniquement par la future couche serveur Nexora, jamais depuis le navigateur.';

-- revenue_recovery_enregistrer_permission() reste accordée à
-- authenticated : son contrôle est complet (vérifie auth.uid() contre le
-- garage, vérifie que client_id/travail_differe_id appartiennent à ce
-- garage, impose la machine à états avec preuve distincte obligatoire pour
-- lever une opposition, verrouille par advisory lock) — c'est une écriture
-- du garage lui-même sur ses propres décisions de permission, pas une
-- déclaration a posteriori d'un fait technique comme un envoi réussi.
