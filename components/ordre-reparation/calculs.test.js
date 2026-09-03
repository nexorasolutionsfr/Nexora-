import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  trouverOrdrePourRendezVous,
  filtrerRendezVousEligibles,
  estDevisCompatible,
  filtrerDevisAttachables,
  validerLigneForm,
  calculerTotalEstimeHT,
  peutModifierLignes,
  traduireErreurOR,
} from './calculs.js'

function rdv(overrides) {
  return { id: 'rdv-1', client_id: 'client-1', vehicule_id: 'veh-1', garage_id: 'garage-1', ...overrides }
}

function devis(overrides) {
  return { id: 'devis-1', statut: 'accepte', garage_id: 'garage-1', client_id: 'client-1', vehicule_id: 'veh-1', ...overrides }
}

function ligne(overrides) {
  return { id: 'ligne-1', quantite: 1, prix_unitaire_ht: 10, ...overrides }
}

test('trouverOrdrePourRendezVous retrouve un OR existant sur son rendez_vous_id', () => {
  const ordres = [{ id: 'or-1', rendez_vous_id: 'rdv-1' }, { id: 'or-2', rendez_vous_id: 'rdv-2' }]
  assert.equal(trouverOrdrePourRendezVous(ordres, 'rdv-2').id, 'or-2')
  assert.equal(trouverOrdrePourRendezVous(ordres, 'rdv-absent'), null)
  assert.equal(trouverOrdrePourRendezVous(ordres, null), null)
})

test('filtrerRendezVousEligibles exclut les rendez-vous ayant déjà un OR', () => {
  const rendezVous = [rdv({ id: 'rdv-1' }), rdv({ id: 'rdv-2' })]
  const ordres = [{ id: 'or-1', rendez_vous_id: 'rdv-1' }]
  const eligibles = filtrerRendezVousEligibles(rendezVous, ordres)
  assert.deepEqual(eligibles.map((r) => r.id), ['rdv-2'])
})

test("filtrerRendezVousEligibles restreint au client et au véhicule quand on part d'un devis (contrat E.3)", () => {
  const rendezVous = [
    rdv({ id: 'rdv-meme-client-vehicule' }),
    rdv({ id: 'rdv-autre-client', client_id: 'client-2' }),
    rdv({ id: 'rdv-autre-vehicule', vehicule_id: 'veh-2' }),
  ]
  const eligibles = filtrerRendezVousEligibles(rendezVous, [], { clientId: 'client-1', vehiculeId: 'veh-1' })
  assert.deepEqual(eligibles.map((r) => r.id), ['rdv-meme-client-vehicule'])
})

test('estDevisCompatible exige accepte + même garage + même client + même véhicule', () => {
  const contexte = { garageId: 'garage-1', clientId: 'client-1', vehiculeId: 'veh-1' }
  assert.equal(estDevisCompatible(devis(), contexte), true)
  assert.equal(estDevisCompatible(devis({ statut: 'en_attente' }), contexte), false)
  assert.equal(estDevisCompatible(devis({ garage_id: 'garage-2' }), contexte), false)
  assert.equal(estDevisCompatible(devis({ client_id: 'client-2' }), contexte), false)
  assert.equal(estDevisCompatible(devis({ vehicule_id: 'veh-2' }), contexte), false)
  assert.equal(estDevisCompatible(null, contexte), false)
})

test('filtrerDevisAttachables ne garde que les devis compatibles', () => {
  const contexte = { garageId: 'garage-1', clientId: 'client-1', vehiculeId: 'veh-1' }
  const devisList = [devis({ id: 'd-ok' }), devis({ id: 'd-refuse', statut: 'refuse' }), devis({ id: 'd-autre-vehicule', vehicule_id: 'veh-2' })]
  assert.deepEqual(filtrerDevisAttachables(devisList, contexte).map((d) => d.id), ['d-ok'])
})

test('validerLigneForm accepte une ligne main_oeuvre valide avec durée', () => {
  const { valide, erreurs } = validerLigneForm({ type: 'main_oeuvre', libelle: 'Diagnostic', quantite: 1, prix_unitaire_ht: '', duree_minutes: 30 })
  assert.equal(valide, true)
  assert.deepEqual(erreurs, {})
})

test('validerLigneForm accepte une ligne piece valide sans durée ni prix', () => {
  const { valide } = validerLigneForm({ type: 'piece', libelle: 'Filtre à huile', quantite: 2, prix_unitaire_ht: null, duree_minutes: null })
  assert.equal(valide, true)
})

test('validerLigneForm refuse une durée sur une ligne piece (CHECK ordres_reparation_lignes_duree_check)', () => {
  const { valide, erreurs } = validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: 1, prix_unitaire_ht: 5, duree_minutes: 10 })
  assert.equal(valide, false)
  assert.ok(erreurs.duree_minutes)
})

test('validerLigneForm refuse une durée nulle ou négative sur une ligne main_oeuvre', () => {
  assert.equal(validerLigneForm({ type: 'main_oeuvre', libelle: 'MO', quantite: 1, duree_minutes: 0 }).valide, false)
  assert.equal(validerLigneForm({ type: 'main_oeuvre', libelle: 'MO', quantite: 1, duree_minutes: -5 }).valide, false)
})

test('validerLigneForm refuse une quantité nulle ou négative', () => {
  assert.equal(validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: 0 }).valide, false)
  assert.equal(validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: -1 }).valide, false)
})

test('validerLigneForm refuse un prix HT négatif mais accepte un prix nul ou vide', () => {
  assert.equal(validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: 1, prix_unitaire_ht: -1 }).valide, false)
  assert.equal(validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: 1, prix_unitaire_ht: 0 }).valide, true)
  assert.equal(validerLigneForm({ type: 'piece', libelle: 'Filtre', quantite: 1, prix_unitaire_ht: '' }).valide, true)
})

test('validerLigneForm refuse un libellé vide ou blanc', () => {
  assert.equal(validerLigneForm({ type: 'piece', libelle: '', quantite: 1 }).valide, false)
  assert.equal(validerLigneForm({ type: 'piece', libelle: '   ', quantite: 1 }).valide, false)
})

test('calculerTotalEstimeHT additionne quantite * prix_unitaire_ht et signale un total complet quand toutes les lignes ont un prix', () => {
  const lignes = [ligne({ quantite: 2, prix_unitaire_ht: 10 }), ligne({ quantite: 1, prix_unitaire_ht: 15.5 })]
  const { total, complet } = calculerTotalEstimeHT(lignes)
  assert.equal(total, 35.5)
  assert.equal(complet, true)
})

test('calculerTotalEstimeHT signale un total partiel (jamais un prix à zéro) si une ligne a un prix null, vide ou non numérique', () => {
  const casSansPrixValide = [null, undefined, '', 'abc', NaN]
  for (const prixInvalide of casSansPrixValide) {
    const lignes = [ligne({ quantite: 2, prix_unitaire_ht: 10 }), ligne({ quantite: 3, prix_unitaire_ht: prixInvalide })]
    const { total, complet } = calculerTotalEstimeHT(lignes)
    assert.equal(complet, false, `attendu incomplet pour prix_unitaire_ht = ${String(prixInvalide)}`)
    assert.equal(total, 20, `la ligne sans prix valide ne doit jamais compter comme 0 pour prix_unitaire_ht = ${String(prixInvalide)}`)
  }
})

test('calculerTotalEstimeHT renvoie un total nul et incomplet sur une liste vide (aucun total à afficher)', () => {
  const { total, complet } = calculerTotalEstimeHT([])
  assert.equal(total, 0)
  assert.equal(complet, false)
})

test("peutModifierLignes n'autorise pas l'édition visuelle d'un OR annulé", () => {
  assert.equal(peutModifierLignes({ statut: 'brouillon' }), true)
  assert.equal(peutModifierLignes({ statut: 'confirme' }), true)
  assert.equal(peutModifierLignes({ statut: 'annule' }), false)
  assert.equal(peutModifierLignes(null), false)
})

test('traduireErreurOR reconnaît les messages exacts levés par les triggers OR', () => {
  assert.match(traduireErreurOR({ code: '23505' }), /existe déjà/)
  assert.match(traduireErreurOR({ code: '23514' }), /règles de saisie/)
  assert.match(traduireErreurOR({ message: 'ordres_reparation: le devis doit etre accepte pour etre rattache a un ordre de reparation' }), /doit être accepté/)
  assert.match(traduireErreurOR({ message: 'ordres_reparation: rendez_vous introuvable ou hors garage' }), /rendez-vous n'est plus disponible/)
  assert.match(traduireErreurOR({ message: 'ordres_reparation: mecanicien hors garage' }), /mécanicien n'appartient pas/)
  assert.match(traduireErreurOR({ message: "ordres_reparation: rendez_vous_id, vehicule_id, client_id, garage_id et created_by sont figes a la creation" }), /ne peuvent plus être modifiées/)
  assert.match(traduireErreurOR({ message: 'ordres_reparation_lignes: prestation hors garage' }), /prestation n'appartient pas/)
})

test('traduireErreurOR retombe sur un message générique pour une erreur inconnue', () => {
  assert.match(traduireErreurOR({ message: 'quelque chose de totalement inattendu' }), /Réessayez/)
  assert.match(traduireErreurOR(null), /Réessayez/)
})
