import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  arrondir2,
  calculerLigne,
  calculerTotaux,
  devisStatutModifiable,
  devisALignes,
  validerLigneDevisForm,
  normaliserLigneDevis,
  trierLignes,
  deplacerLigne,
  preremplirDepuisPrestation,
  lignesDevisVersOR,
  traduireErreurDevisLignes,
  formatEuro,
} from './calculs.js'

// --- Arrondi : identique à round(numeric, 2) de PostgreSQL ---------------

test('arrondir2 : demi-cent vers le haut, y compris les cas piégeux du binaire', () => {
  assert.equal(arrondir2(1.005), 1.01)      // 1.005*100 = 100.49999999999999 en JS
  assert.equal(arrondir2(2.675), 2.68)
  assert.equal(arrondir2(0.005), 0.01)
  assert.equal(arrondir2(0.004), 0)
  assert.equal(arrondir2(37.05), 37.05)
  assert.equal(arrondir2(3.705), 3.71)
  assert.equal(arrondir2('12.345'), 12.35)
  assert.equal(arrondir2(NaN), 0)
  assert.equal(arrondir2(undefined), 0)
})

// --- Calcul par ligne : mêmes cas que le banc SQL ------------------------

test('calculerLigne reproduit les colonnes générées : 1.5 × 80 @ 20 %', () => {
  assert.deepEqual(calculerLigne({ quantite: 1.5, prix_unitaire_ht: 80, taux_tva: 20 }),
    { montant_ht: 120, montant_tva: 24, montant_ttc: 144 })
})

test('calculerLigne : 3 × 12,35 @ 10 % → HT 37,05, TVA 3,71 (arrondi PAR ligne)', () => {
  // 37.05 * 0.10 = 3.705 → 3.71 côté base (round numeric). Un arrondi du
  // total ou une TVA calculée avant arrondi du HT donnerait autre chose.
  assert.deepEqual(calculerLigne({ quantite: 3, prix_unitaire_ht: 12.35, taux_tva: 10 }),
    { montant_ht: 37.05, montant_tva: 3.71, montant_ttc: 40.76 })
})

test('calculerLigne : quantité décimale et TVA à 5,5 %', () => {
  const r = calculerLigne({ quantite: 0.333, prix_unitaire_ht: 99.99, taux_tva: 5.5 })
  assert.equal(r.montant_ht, 33.3)      // 33.29667 → 33.30
  assert.equal(r.montant_tva, 1.83)     // 33.30 * 0.055 = 1.8315 → 1.83
  assert.equal(r.montant_ttc, 35.13)
})

test('calculerLigne : entrées invalides → zéros, jamais NaN', () => {
  assert.deepEqual(calculerLigne({ quantite: 'abc', prix_unitaire_ht: 10, taux_tva: 20 }),
    { montant_ht: 0, montant_tva: 0, montant_ttc: 0 })
})

// --- Totaux ---------------------------------------------------------------

test('calculerTotaux : taux mixtes, somme des lignes arrondies (mêmes chiffres que le banc)', () => {
  const lignes = [
    { quantite: 1.5, prix_unitaire_ht: 80, taux_tva: 20 },     // 120 / 24
    { quantite: 3, prix_unitaire_ht: 12.35, taux_tva: 10 },    // 37.05 / 3.71
  ]
  assert.deepEqual(calculerTotaux(lignes), { total_ht: 157.05, total_tva: 27.71, total_ttc: 184.76, nb_lignes: 2 })
})

test('calculerTotaux : les colonnes générées de la base font foi quand elles sont présentes', () => {
  const lignes = [{ quantite: 1, prix_unitaire_ht: 999, taux_tva: 20, montant_ht: 10, montant_tva: 2 }]
  assert.deepEqual(calculerTotaux(lignes), { total_ht: 10, total_tva: 2, total_ttc: 12, nb_lignes: 1 })
})

test('calculerTotaux : devis vide → 0, jamais null ni NaN', () => {
  assert.deepEqual(calculerTotaux([]), { total_ht: 0, total_tva: 0, total_ttc: 0, nb_lignes: 0 })
  assert.deepEqual(calculerTotaux(undefined), { total_ht: 0, total_tva: 0, total_ttc: 0, nb_lignes: 0 })
})

test('calculerTotaux : accumulation sans dérive flottante sur beaucoup de lignes', () => {
  const lignes = Array.from({ length: 100 }, () => ({ quantite: 1, prix_unitaire_ht: 0.1, taux_tva: 20 }))
  const t = calculerTotaux(lignes)
  assert.equal(t.total_ht, 10)
  assert.equal(t.total_tva, 2)
  assert.equal(t.total_ttc, 12)
})

// --- Immuabilité : miroir de devis_statut_modifiable, fermé par défaut ----

test('devisStatutModifiable : brouillon et en_attente seulement', () => {
  assert.equal(devisStatutModifiable('brouillon'), true)
  assert.equal(devisStatutModifiable('en_attente'), true)
  assert.equal(devisStatutModifiable('accepte'), false)
  assert.equal(devisStatutModifiable('refuse'), false)
  assert.equal(devisStatutModifiable('statut_exotique'), false)
  assert.equal(devisStatutModifiable(null), false)
  assert.equal(devisStatutModifiable(undefined), false)
  assert.equal(devisStatutModifiable(''), false)
})

test('devisALignes : devis historique sans ligne reconnu comme mono-prestation', () => {
  assert.equal(devisALignes({ devis_lignes: [] }), false)
  assert.equal(devisALignes({}), false)
  assert.equal(devisALignes(null), false)
  assert.equal(devisALignes({ devis_lignes: [{ id: 'l1' }] }), true)
})

// --- Validation : reflète les CHECK de devis_lignes -----------------------

test('validerLigneDevisForm : ligne correcte', () => {
  const r = validerLigneDevisForm({ type: 'piece', libelle: 'Filtre', quantite: '2', prix_unitaire_ht: '12.35', taux_tva: '20' })
  assert.equal(r.valide, true)
  assert.deepEqual(r.erreurs, {})
})

test('validerLigneDevisForm : chaque contrainte remonte sur son champ', () => {
  const r = validerLigneDevisForm({ type: 'remise', libelle: '   ', quantite: 0, prix_unitaire_ht: -1, taux_tva: 101 })
  assert.equal(r.valide, false)
  assert.deepEqual(Object.keys(r.erreurs).sort(), ['libelle', 'prix_unitaire_ht', 'quantite', 'taux_tva', 'type'])
})

test('validerLigneDevisForm : le prix HT est obligatoire sur un devis (contrairement à l\'OR)', () => {
  const r = validerLigneDevisForm({ type: 'piece', libelle: 'X', quantite: 1, prix_unitaire_ht: '', taux_tva: 20 })
  assert.equal(r.valide, false)
  assert.ok(r.erreurs.prix_unitaire_ht)
  assert.equal(validerLigneDevisForm({ type: 'piece', libelle: 'X', quantite: 1, prix_unitaire_ht: 0, taux_tva: 0 }).valide, true)
})

test('normaliserLigneDevis : types numériques et libellé nettoyé', () => {
  assert.deepEqual(
    normaliserLigneDevis({ type: 'piece', libelle: '  Filtre ', quantite: '2', prix_unitaire_ht: '12.345', taux_tva: '20', prestation_id: '' }),
    { type: 'piece', libelle: 'Filtre', quantite: 2, prix_unitaire_ht: 12.35, taux_tva: 20, prestation_id: null },
  )
})

// --- Ordre et réordonnancement --------------------------------------------

test('trierLignes : position puis created_at, sans muter l\'entrée', () => {
  const entree = [
    { id: 'c', position: 1, created_at: '2026-01-03' },
    { id: 'a', position: 0, created_at: '2026-01-02' },
    { id: 'b', position: 0, created_at: '2026-01-01' },
  ]
  const copie = entree.slice()
  assert.deepEqual(trierLignes(entree).map((l) => l.id), ['b', 'a', 'c'])
  assert.deepEqual(entree, copie)
})

test('deplacerLigne : monte une ligne et ne renvoie que les positions qui changent', () => {
  const lignes = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 }]
  const { lignes: apres, positionsAChanger } = deplacerLigne(lignes, 2, 'haut')
  assert.deepEqual(apres.map((l) => l.id), ['a', 'c', 'b'])
  assert.deepEqual(positionsAChanger, [{ id: 'c', position: 1 }, { id: 'b', position: 2 }])
})

test('deplacerLigne : hors bornes → aucune modification', () => {
  const lignes = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }]
  assert.deepEqual(deplacerLigne(lignes, 0, 'haut').positionsAChanger, [])
  assert.deepEqual(deplacerLigne(lignes, 1, 'bas').positionsAChanger, [])
})

// --- Prestation : pré-remplissage, jamais source de vérité ----------------

test('preremplirDepuisPrestation copie nom et prix, garde la provenance', () => {
  assert.deepEqual(preremplirDepuisPrestation({ id: 'p1', nom: 'Vidange', prix_ht: 89.9 }),
    { type: 'main_oeuvre', libelle: 'Vidange', prix_unitaire_ht: 89.9, taux_tva: 20, prestation_id: 'p1' })
  assert.equal(preremplirDepuisPrestation({ id: 'p2', nom: 'Sans prix' }).prix_unitaire_ht, '')
  assert.equal(preremplirDepuisPrestation(null), null)
})

// --- Reprise vers l'OR : copie par valeur ---------------------------------

test('lignesDevisVersOR : copie par valeur, dans l\'ordre, sans TVA ni durée', () => {
  const lignes = [
    { id: 'l2', position: 1, type: 'piece', libelle: 'Filtre', quantite: '3', prix_unitaire_ht: 12.35, taux_tva: 10 },
    { id: 'l1', position: 0, type: 'main_oeuvre', libelle: 'MO', quantite: 1.5, prix_unitaire_ht: 80, taux_tva: 20 },
  ]
  assert.deepEqual(lignesDevisVersOR(lignes), [
    { type: 'main_oeuvre', libelle: 'MO', quantite: 1.5, prix_unitaire_ht: 80, duree_minutes: null },
    { type: 'piece', libelle: 'Filtre', quantite: 3, prix_unitaire_ht: 12.35, duree_minutes: null },
  ])
  // Aucune référence au devis d'origine ne fuit dans l'OR.
  assert.ok(lignesDevisVersOR(lignes).every((l) => !('id' in l) && !('devis_id' in l) && !('taux_tva' in l)))
})

// --- Erreurs : sous-chaînes reprises de la migration ----------------------

test('traduireErreurDevisLignes : contraintes nommées et garde-fous', () => {
  assert.equal(traduireErreurDevisLignes({ code: '23514', message: 'violates check constraint "devis_lignes_quantite_positive"' }), 'La quantité doit être strictement positive.')
  assert.equal(traduireErreurDevisLignes({ code: '23514', message: 'violates check constraint "devis_lignes_taux_tva_borne"' }), 'Le taux de TVA doit être compris entre 0 et 100.')
  assert.equal(traduireErreurDevisLignes({ message: 'devis_lignes: le devis est verrouille (statut=accepte), ses lignes ne peuvent plus etre modifiees' }), 'Ce devis est verrouillé : ses lignes ne peuvent plus être modifiées.')
  assert.equal(traduireErreurDevisLignes({ message: 'devis: un devis verrouille (statut=refuse) ne peut pas etre supprime' }), 'Un devis verrouillé ne peut pas être supprimé.')
  assert.equal(traduireErreurDevisLignes({ message: 'devis: un devis verrouille (statut=accepte) ne peut plus etre modifie' }), 'Ce devis est verrouillé et ne peut plus être modifié.')
  assert.equal(traduireErreurDevisLignes({ code: '42501', message: 'permission denied' }), 'Cette action n\'est pas autorisée sur ce devis.')
  assert.equal(traduireErreurDevisLignes({ message: 'devis_lignes: prestation hors garage' }), 'Cette prestation n\'appartient pas à ce garage.')
  assert.equal(traduireErreurDevisLignes(null), 'Une erreur est survenue. Réessayez.')
})

test('formatEuro : virgule française, deux décimales', () => {
  assert.equal(formatEuro(184.76), '184,76 €')
  assert.equal(formatEuro(0), '0,00 €')
  assert.equal(formatEuro('x'), '0,00 €')
})
