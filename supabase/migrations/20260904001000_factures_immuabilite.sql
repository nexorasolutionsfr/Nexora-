-- Réserve levée : l'immuabilité d'une facture n'était que conventionnelle.
-- factures.lignes est un instantané qui ne se recalcule jamais tout seul
-- (20260904000600), mais rien n'empêchait de le réécrire après coup.
--
-- AUDIT DU MODÈLE AVANT VERROUILLAGE — ce qui existe réellement aujourd'hui :
--
--   1. handleGenererFacture : INSERT, statut 'en_attente'.
--   2. handleMarquerFacturePayee : UPDATE {statut='payee', date_paiement}.
--   3. handleSauvegarderFacture : UPDATE {motif, lignes, montant_ht,
--      montant_ttc}, exposé par le bouton « Modifier » de FactureDetailModal.
--      Ce bouton n'est aujourd'hui conditionné par aucun statut : une facture
--      déjà payée peut donc voir ses montants réécrits.
--
--   Statuts réellement présents en base au moment d'écrire cette migration :
--   'en_attente' uniquement (2 lignes sur Test, 1 sur Production, aucune
--   date_paiement). Aucune facture payée n'existe nulle part : ce verrou ne
--   casse donc aucune donnée ni aucun parcours réellement exercé.
--
-- ARBITRAGE, pour ne bloquer que ce qui doit l'être :
--
--   a. Ancrages d'identité et de provenance — garage_id, ordre_reparation_id,
--      rendez_vous_id, client_id, vehicule_id, numero — figés DÈS LA
--      CRÉATION. Aucune des trois écritures ci-dessus ne les modifie :
--      les verrouiller ne retire aucune capacité existante, et ferme la
--      réattribution d'une facture à un autre garage, OR ou rendez-vous.
--   b. Contenu financier — lignes, montant_ht, montant_ttc — figé UNE FOIS LA
--      FACTURE PAYÉE. Avant encaissement, la correction reste possible :
--      c'est l'usage légitime de l'écran d'édition existant, et le supprimer
--      serait une refonte fonctionnelle non demandée.
--   c. Statut financier — la transition ne va que dans un sens : on peut
--      marquer payée, jamais dé-encaisser en silence, et date_paiement ne
--      peut plus être effacée une fois posée.
--   d. motif reste librement modifiable : c'est un texte descriptif, il ne
--      porte aucun montant.
create function public.factures_check_immuabilite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- a. Ancrages figés dès la création.
  if new.garage_id is distinct from old.garage_id then
    raise exception 'factures: le garage d''une facture ne peut plus changer';
  end if;
  if new.ordre_reparation_id is distinct from old.ordre_reparation_id then
    raise exception 'factures: l''ordre de reparation de reference ne peut plus changer';
  end if;
  if new.rendez_vous_id is distinct from old.rendez_vous_id then
    raise exception 'factures: le rendez_vous d''une facture ne peut plus changer';
  end if;
  if new.client_id is distinct from old.client_id
    or new.vehicule_id is distinct from old.vehicule_id
  then
    raise exception 'factures: le client et le vehicule d''une facture ne peuvent plus changer';
  end if;
  if new.numero is distinct from old.numero then
    raise exception 'factures: le numero d''une facture ne peut plus changer';
  end if;

  -- c. Statut financier monotone.
  if old.statut = 'payee' and new.statut is distinct from 'payee' then
    raise exception 'factures: une facture payee ne peut pas revenir a un statut non paye';
  end if;
  if old.date_paiement is not null and new.date_paiement is null then
    raise exception 'factures: la date de paiement d''une facture payee ne peut pas etre effacee';
  end if;

  -- b. Contenu financier figé une fois la facture payée.
  if old.statut = 'payee' then
    if new.lignes is distinct from old.lignes
      or new.montant_ht is distinct from old.montant_ht
      or new.montant_ttc is distinct from old.montant_ttc
    then
      raise exception 'factures: une facture payee est definitive, ses lignes et ses montants ne peuvent plus etre modifies';
    end if;
  end if;

  return new;
end;
$$;

create trigger factures_check_immuabilite_trigger
  before update on public.factures
  for each row
  execute function public.factures_check_immuabilite();

comment on function public.factures_check_immuabilite() is
  'Immuabilite reelle d''une facture. Ancrages (garage, OR, rendez-vous, client, vehicule, numero) figes des la creation ; lignes et montants figes une fois la facture payee ; statut financier monotone. La correction avant encaissement et le marquage payee restent possibles : voir l''audit en tete de 20260904001000.';

revoke execute on function public.factures_check_immuabilite() from public;
revoke execute on function public.factures_check_immuabilite() from anon;
revoke execute on function public.factures_check_immuabilite() from authenticated;
revoke execute on function public.factures_check_immuabilite() from service_role;
