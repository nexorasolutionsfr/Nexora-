-- Une fiche atelier (ordre de réparation), une facture — garantie en base,
-- même pour deux demandes simultanées.
--
-- POURQUOI
-- Reproduit sur Test le 15 septembre 2026 : deux clics rapides sur « Générer
-- la facture » ont créé F-2026-0003 et F-2026-0004 pour la même fiche. Ni
-- contrainte ni trigger ne l'interdisaient ; l'écran (PR #104) protège un
-- double clic dans un onglet, pas deux onglets ou deux postes au même instant.
--
-- LA RÈGLE MÉTIER, VÉRIFIÉE AVANT D'ÉCRIRE CETTE MIGRATION
-- - La facture se génère depuis une fiche atelier terminée ; une fiche par
--   visite (`ordres_reparation_rendez_vous_unique`).
-- - Le schéma ne connaît ni avoir, ni acompte, ni facture rectificative ;
--   une facture non payée se corrige elle-même (20260904001000).
-- - Des factures SANS fiche atelier existent (historique, saisie manuelle) :
--   elles ne sont pas concernées.
-- La clé est donc la FICHE ATELIER, pas la visite. Si des avoirs ou des
-- acomptes sont un jour introduits, cette règle devra porter un type de
-- document.
--
-- CE QUE LA MIGRATION NE FAIT PAS
-- - Aucune ligne existante n'est lue pour validation, modifiée ou supprimée :
--   un doublon antérieur (Test : F-2026-0003/0004) reste tel quel, avec sa
--   numérotation. Pas d'index unique, qui échouerait sur ce doublon.
-- - Aucun numéro n'est consommé par un refus : ce trigger s'exécute avant
--   `trg_assigner_numero_facture` (ordre alphabétique des triggers BEFORE
--   INSERT), et le compteur du garage est transactionnel.
--
-- ATOMICITÉ
-- Verrou consultatif de transaction sur la fiche atelier, puis recherche d'une
-- facture existante. Deux insertions concurrentes attendent le même verrou ;
-- la seconde, relancée après la validation de la première, la voit (nouvel
-- instantané par instruction en READ COMMITTED) et échoue. SECURITY DEFINER :
-- la recherche ne dépend pas de ce que l'appelant a le droit de lire.

create or replace function public.factures_une_par_ordre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ordre_reparation_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('facture-ordre:' || new.ordre_reparation_id::text, 0)
  );

  if exists (
    select 1 from public.factures f
     where f.ordre_reparation_id = new.ordre_reparation_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'factures: cet ordre de reparation a deja sa facture',
      hint = 'facture_existante';
  end if;

  return new;
end;
$$;

revoke execute on function public.factures_une_par_ordre() from public;
revoke execute on function public.factures_une_par_ordre() from anon;
revoke execute on function public.factures_une_par_ordre() from authenticated;

drop trigger if exists factures_une_par_ordre_trigger on public.factures;
create trigger factures_une_par_ordre_trigger
  before insert on public.factures
  for each row
  execute function public.factures_une_par_ordre();

comment on function public.factures_une_par_ordre() is
  'Une facture par ordre de réparation : refuse une seconde facture pour la même fiche, y compris en concurrence (verrou consultatif). Factures sans fiche non concernées ; lignes existantes ni validées ni modifiées ; aucun numéro consommé par un refus.';
