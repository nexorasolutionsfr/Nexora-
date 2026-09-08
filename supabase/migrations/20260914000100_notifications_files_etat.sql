-- Les files de notification disent maintenant ce qui est parti, et pourquoi.
--
-- Avant : une seule colonne booléenne `envoye`, écrite par le workflow même
-- quand aucun message ne partait (client sans adresse). La file mentait, et
-- personne ne pouvait distinguer « envoyé », « impossible » et « à réessayer ».
--
-- Additive et réversible : aucune colonne supprimée, aucune ligne effacée.
-- `envoye` reste la source de vérité historique ; `statut` la complète.
--
--   en_attente     : à traiter
--   envoi_en_cours : réservée par un traitement ; y rester après une panne
--                    signale un envoi INCERTAIN — jamais repris automatiquement
--   envoye         : le fournisseur a accepté le message
--   bloque         : donnée indispensable manquante, aucun envoi possible
--   sans_lien      : créée hors session utilisateur, son lien n'a pas pu être
--                    produit (voir 20260914000300) — non envoyable en l'état

do $$
declare t text;
begin
  foreach t in array array['notifications_devis','notifications_factures',
                           'notifications_atelier','notifications_proposition']
  loop
    execute format('alter table public.%I add column if not exists statut text not null default ''en_attente''', t);
    execute format('alter table public.%I add column if not exists tentatives integer not null default 0', t);
    execute format('alter table public.%I add column if not exists derniere_erreur text', t);
    -- Reprise : sans elle, tout l'historique déjà envoyé repartirait au premier
    -- passage du traitement, qui filtre désormais sur `statut`.
    execute format('update public.%I set statut = ''envoye'' where envoye = true and statut = ''en_attente''', t);
    execute format($f$alter table public.%I drop constraint if exists %I$f$, t, t || '_statut_connu');
    execute format($f$alter table public.%I add constraint %I check
      (statut in ('en_attente','envoi_en_cours','envoye','bloque','sans_lien'))$f$, t, t || '_statut_connu');
    execute format('create index if not exists %I on public.%I (statut) where statut = ''en_attente''',
                   'idx_' || t || '_a_traiter', t);
  end loop;
end $$;
