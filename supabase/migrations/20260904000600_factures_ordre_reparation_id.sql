-- Suite du correctif de facturation (recette pilote du 2026-09-04).
-- handleGenererFacture lisait rendez_vous.devis_id, colonne qui n'a jamais
-- existé sur rendez_vous — la condition était donc toujours fausse et le
-- code retombait sur un prix de catalogue quasi toujours absent (facture à
-- 0 €). La source de vérité correcte est l'ordre de réparation terminé
-- (ordres_reparation), pas rendez_vous ni le devis directement : c'est le
-- seul objet qui reflète le travail réellement exécuté, pas l'intention
-- initiale (contrat recette-pilote-corrections-v1.md, section C).
--
-- Additif : colonne nullable, aucune ligne existante modifiée. devis_id
-- reste tel quel pour la traçabilité mais n'est plus utilisé pour calculer
-- un montant.
alter table public.factures
  add column ordre_reparation_id uuid references public.ordres_reparation(id) on delete set null;

create index factures_ordre_reparation_idx
  on public.factures (ordre_reparation_id);

comment on column public.factures.ordre_reparation_id is
  'Ordre de réparation dont les lignes ont été reprises pour établir cette facture. Traçabilité uniquement : factures.lignes est un instantané figé au moment de la génération, il ne se recalcule jamais depuis cette référence.';
