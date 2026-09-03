import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aideMotif,
  compterNotifications,
  estMotifConnu,
  formaterAnciennete,
  referenceDevis,
  traduireErreurNotification,
  traduireMotif,
  trierNotifications,
} from './calculs.js'
import { MOTIFS_INCOMPLET, MOTIF_AIDE, MOTIF_LABEL } from './notificationsDevisConstants.js'

test('chaque code de motif autorisé a un libellé et une aide', () => {
  for (const code of MOTIFS_INCOMPLET) {
    assert.equal(typeof MOTIF_LABEL[code], 'string', `libellé manquant pour ${code}`)
    assert.ok(MOTIF_LABEL[code].length > 0, `libellé vide pour ${code}`)
    assert.equal(typeof MOTIF_AIDE[code], 'string', `aide manquante pour ${code}`)
    assert.ok(MOTIF_AIDE[code].length > 0, `aide vide pour ${code}`)
  }
})

test('aucun libellé ne référence un code absent du domaine SQL', () => {
  for (const code of Object.keys(MOTIF_LABEL)) {
    assert.ok(MOTIFS_INCOMPLET.includes(code), `${code} n'est pas dans le domaine autorisé`)
  }
})

test('estMotifConnu distingue les codes du domaine', () => {
  assert.equal(estMotifConnu('vehicule_absent'), true)
  assert.equal(estMotifConnu('code_invente'), false)
  assert.equal(estMotifConnu(null), false)
})

test('un motif inconnu ne fuit jamais tel quel dans l’interface', () => {
  // Garde-fou : si la contrainte SQL et la liste divergeaient un jour, la
  // valeur brute (potentiellement autre chose qu’un code court) ne doit
  // pas être affichée.
  assert.equal(traduireMotif('client-nom-prenom@exemple.fr'), 'Raison non précisée')
  assert.equal(traduireMotif('code_invente'), 'Raison non précisée')
  assert.equal(traduireMotif(null), 'Raison non précisée')
  assert.equal(traduireMotif('vehicule_absent'), 'Véhicule introuvable')
})

test('aideMotif reste vide pour un code inconnu', () => {
  assert.equal(aideMotif('code_invente'), '')
  assert.equal(aideMotif(null), '')
  assert.ok(aideMotif('client_absent').length > 0)
})

test('trierNotifications remet les plus anciennes en premier', () => {
  const trie = trierNotifications([
    { id: 'c', cree_le: '2026-09-03T10:00:00Z' },
    { id: 'a', cree_le: '2026-09-01T10:00:00Z' },
    { id: 'b', cree_le: '2026-09-02T10:00:00Z' },
  ])
  assert.deepEqual(trie.map((n) => n.id), ['a', 'b', 'c'])
})

test('trierNotifications tolère les dates absentes ou invalides', () => {
  const trie = trierNotifications([
    { id: 'sans-date' },
    { id: 'valide', cree_le: '2026-09-01T10:00:00Z' },
    { id: 'invalide', cree_le: 'pas-une-date' },
  ])
  assert.equal(trie[0].id, 'valide')
  assert.equal(trie.length, 3)
})

test('trierNotifications ne mute pas l’entrée et tolère le non-tableau', () => {
  const source = [{ id: 'b', cree_le: '2026-09-02T10:00:00Z' }, { id: 'a', cree_le: '2026-09-01T10:00:00Z' }]
  const copie = [...source]
  trierNotifications(source)
  assert.deepEqual(source, copie)
  assert.deepEqual(trierNotifications(null), [])
  assert.deepEqual(trierNotifications(undefined), [])
})

test('compterNotifications alimente le badge sans planter', () => {
  assert.equal(compterNotifications([{}, {}]), 2)
  assert.equal(compterNotifications([]), 0)
  assert.equal(compterNotifications(null), 0)
})

test('referenceDevis raccourcit sans exposer l’identifiant complet', () => {
  const uuid = '51399084-f3c7-45a0-b412-ea550987338c'
  const ref = referenceDevis(uuid)
  assert.equal(ref, '51399084')
  assert.ok(ref.length < uuid.length, "la référence doit être plus courte que l'identifiant")
  assert.ok(uuid.startsWith(ref), 'la référence doit rester un préfixe fidèle')
  assert.equal(referenceDevis(null), '—')
  assert.equal(referenceDevis('court'), '—')
})

test('formaterAnciennete reste lisible et borné', () => {
  const maintenant = new Date('2026-09-10T12:00:00Z')
  assert.equal(formaterAnciennete('2026-09-10T09:00:00Z', maintenant), "aujourd'hui")
  assert.equal(formaterAnciennete('2026-09-09T09:00:00Z', maintenant), 'hier')
  assert.equal(formaterAnciennete('2026-09-05T09:00:00Z', maintenant), 'il y a 5 jours')
  assert.equal(formaterAnciennete('pas-une-date', maintenant), '')
  assert.equal(formaterAnciennete(null, maintenant), '')
})

test('traduireErreurNotification couvre les refus des RPC', () => {
  assert.equal(
    traduireErreurNotification({ message: 'Aucun garage associe au compte connecte' }),
    "Aucun garage n'est associé à votre compte."
  )
  assert.equal(
    traduireErreurNotification({ message: 'Notification introuvable, deja traitee, ou hors perimetre' }),
    "Cette notification n'appartient pas à votre garage."
  )
  assert.equal(
    traduireErreurNotification({ code: '42501', message: 'permission denied for function' }),
    "Cette action n'est pas autorisée pour votre compte."
  )
  assert.equal(traduireErreurNotification(null), 'Une erreur est survenue. Réessayez.')
  assert.equal(
    traduireErreurNotification({ message: 'quelque chose d’inattendu' }),
    'Une erreur est survenue. Réessayez.'
  )
})

test('traduireErreurNotification ne renvoie jamais le message brut de la base', () => {
  const brut = 'ERROR: relation "clients" does not exist at character 42'
  const rendu = traduireErreurNotification({ message: brut })
  assert.ok(!rendu.includes('relation'))
  assert.ok(!rendu.includes('character'))
})
