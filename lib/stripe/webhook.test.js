import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import {
  ErreurWebhook,
  STATUTS_OUVERTS,
  decouperEntete,
  ecritureDepuisEvenement,
  verifierSignature,
} from './webhook.js'

const SECRET = 'whsec_test_0123456789'
const GARAGE = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

function signer(corps, horodatage, secret = SECRET) {
  const empreinte = createHmac('sha256', secret).update(`${horodatage}.${corps}`, 'utf8').digest('hex')
  return { entete: `t=${horodatage},v1=${empreinte}`, empreinte }
}

// ── Signature ───────────────────────────────────────────────────────────────

test('une signature valide est acceptée', () => {
  const corps = '{"type":"ping"}'
  const t = 1_700_000_000
  const { entete } = signer(corps, t)
  assert.equal(verifierSignature(corps, entete, SECRET, { maintenantSecondes: t }), true)
})

test('une signature calculée avec un autre secret est refusée', () => {
  const corps = '{"type":"ping"}'
  const t = 1_700_000_000
  const { entete } = signer(corps, t, 'whsec_autre')
  assert.throws(
    () => verifierSignature(corps, entete, SECRET, { maintenantSecondes: t }),
    (e) => e instanceof ErreurWebhook && e.code === 'signature_invalide',
  )
})

test('un corps modifié après signature est refusé', () => {
  const t = 1_700_000_000
  const { entete } = signer('{"montant":79}', t)
  assert.throws(
    () => verifierSignature('{"montant":1}', entete, SECRET, { maintenantSecondes: t }),
    (e) => e.code === 'signature_invalide',
  )
})

test('un événement rejoué hors de la fenêtre est refusé', () => {
  const corps = '{"type":"ping"}'
  const t = 1_700_000_000
  const { entete } = signer(corps, t)
  assert.throws(
    () => verifierSignature(corps, entete, SECRET, { maintenantSecondes: t + 301 }),
    (e) => e.code === 'horodatage_hors_fenetre',
  )
  // Une horloge en avance est tout aussi suspecte qu'un rejeu.
  assert.throws(
    () => verifierSignature(corps, entete, SECRET, { maintenantSecondes: t - 301 }),
    (e) => e.code === 'horodatage_hors_fenetre',
  )
  assert.equal(verifierSignature(corps, entete, SECRET, { maintenantSecondes: t + 299 }), true)
})

test('pendant une rotation de secret, deux v1 coexistent et une seule suffit', () => {
  const corps = '{"type":"ping"}'
  const t = 1_700_000_000
  const { empreinte } = signer(corps, t)
  const entete = `t=${t},v1=${'0'.repeat(64)},v1=${empreinte},v0=ignoré`
  assert.equal(verifierSignature(corps, entete, SECRET, { maintenantSecondes: t }), true)
})

test('un en-tête absent ou illisible est refusé sans planter', () => {
  assert.throws(() => decouperEntete(''), (e) => e.code === 'signature_absente')
  assert.throws(() => decouperEntete(undefined), (e) => e.code === 'signature_absente')
  assert.throws(() => decouperEntete('n_importe_quoi'), (e) => e.code === 'signature_illisible')
  assert.throws(() => decouperEntete('t=abc,v1=xx'), (e) => e.code === 'signature_illisible')
  assert.throws(() => decouperEntete('t=1700000000'), (e) => e.code === 'signature_illisible')
})

test('un secret absent est une erreur de configuration, pas une signature invalide', () => {
  assert.throws(
    () => verifierSignature('{}', 't=1,v1=aa', ''),
    (e) => e.code === 'secret_absent',
  )
})

// ── Traduction des événements ───────────────────────────────────────────────

test('checkout.session.completed noue le garage à Stripe sans ouvrir l’accès', () => {
  const r = ecritureDepuisEvenement({
    type: 'checkout.session.completed',
    created: 1_700_000_000,
    data: { object: {
      client_reference_id: GARAGE,
      customer: 'cus_1',
      subscription: 'sub_1',
      metadata: { offre: 'atelier', periodicite: 'annuel' },
    } },
  })
  assert.deepEqual(r.cible, { colonne: 'id', valeur: GARAGE })
  assert.equal(r.champs.stripe_subscription_id, 'sub_1')
  assert.equal(r.champs.forfait, 'atelier')
  assert.equal(r.champs.abonnement_periodicite, 'annuel')
  // Le paiement ne décide pas de l'accès : c'est customer.subscription.* qui
  // le fait. Cet événement ne doit donc rien dire de abonnement_actif.
  assert.equal('abonnement_actif' in r.champs, false)
  assert.equal(r.evenementLe.toISOString(), new Date(1_700_000_000_000).toISOString())
  // Un rattachement de session ne sait rien qu'il faudrait effacer.
  assert.equal(r.ecraserLesNuls, false)
})

test('une session sans garage rattaché est une erreur, pas un silence', () => {
  assert.throws(
    () => ecritureDepuisEvenement({
      type: 'checkout.session.completed',
      created: 1,
      data: { object: { customer: 'cus_1', subscription: 'sub_1' } },
    }),
    (e) => e.code === 'garage_absent',
  )
})

test('un client_reference_id qui n’est pas un UUID est rejeté', () => {
  assert.throws(
    () => ecritureDepuisEvenement({
      type: 'checkout.session.completed',
      created: 1,
      data: { object: { client_reference_id: "'; drop table garages; --" } },
    }),
    (e) => e.code === 'garage_absent',
  )
})

test('un abonnement actif ouvre l’accès et fixe le forfait', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.updated',
    created: 1_700_000_100,
    data: { object: {
      id: 'sub_1', customer: 'cus_1', status: 'active',
      metadata: { garage_id: GARAGE, offre: 'atelier-plus' },
      items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    } },
  })
  assert.deepEqual(r.cible, { colonne: 'id', valeur: GARAGE })
  assert.equal(r.champs.abonnement_actif, true)
  assert.equal(r.champs.abonnement_statut, 'active')
  assert.equal(r.champs.forfait, 'atelier-plus')
  assert.equal(r.champs.abonnement_periodicite, 'mensuel')
})

test('un essai Stripe en cours ouvre déjà l’accès', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.created',
    created: 1,
    data: { object: { id: 'sub_1', status: 'trialing', metadata: { garage_id: GARAGE, offre: 'essentiel' } } },
  })
  assert.equal(r.champs.abonnement_actif, true)
})

test('une carte refusée ne ferme pas l’atelier tant que Stripe relance', () => {
  assert.equal(STATUTS_OUVERTS.has('past_due'), true)
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.updated',
    created: 1,
    data: { object: { id: 'sub_1', status: 'past_due', metadata: { garage_id: GARAGE, offre: 'atelier' } } },
  })
  assert.equal(r.champs.abonnement_actif, true)
  assert.equal(r.champs.forfait, 'atelier')
})

test('quand Stripe renonce vraiment, l’accès se ferme', () => {
  for (const statut of ['unpaid', 'canceled', 'incomplete_expired', 'paused']) {
    const r = ecritureDepuisEvenement({
      type: 'customer.subscription.updated',
      created: 1,
      data: { object: { id: 'sub_1', status: statut, metadata: { garage_id: GARAGE, offre: 'atelier' } } },
    })
    assert.equal(r.champs.abonnement_actif, false, statut)
    // Un forfait qui survit à l'abonnement ferait afficher au tableau de bord
    // des modules que plus personne ne paie.
    assert.equal(r.champs.forfait, null, statut)
    assert.equal(r.champs.abonnement_periodicite, null, statut)
    // Ici, au contraire, les nuls sont la décision à écrire.
    assert.equal(r.ecraserLesNuls, true, statut)
  }
})

test('un abonnement supprimé est forcé à canceled même sans statut', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.deleted',
    created: 1,
    data: { object: { id: 'sub_1', status: 'active', metadata: { garage_id: GARAGE } } },
  })
  assert.equal(r.champs.abonnement_statut, 'canceled')
  assert.equal(r.champs.abonnement_actif, false)
})

test('sans métadonnée, le garage est retrouvé par l’identifiant d’abonnement', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.updated',
    created: 1,
    data: { object: { id: 'sub_9', status: 'active' } },
  })
  assert.deepEqual(r.cible, { colonne: 'stripe_subscription_id', valeur: 'sub_9' })
})

test('une offre inconnue ne devient jamais un forfait', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.updated',
    created: 1,
    data: { object: { id: 'sub_1', status: 'active', metadata: { garage_id: GARAGE, offre: 'gratuit' } } },
  })
  assert.equal(r.champs.forfait, null)
})

test('un événement hors sujet est ignoré sans erreur', () => {
  assert.equal(ecritureDepuisEvenement({ type: 'invoice.paid', created: 1, data: { object: { id: 'in_1' } } }), null)
})

test('un événement illisible est une erreur explicite', () => {
  assert.throws(() => ecritureDepuisEvenement({}), (e) => e.code === 'evenement_illisible')
  assert.throws(() => ecritureDepuisEvenement({ type: 'x' }), (e) => e.code === 'evenement_illisible')
})

test('un abonnement qui s’ouvre pose le motif d’accès', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.updated', created: 1,
    data: { object: { id: 'sub_1', status: 'active', metadata: { garage_id: GARAGE, offre: 'atelier' } } },
  })
  assert.equal(r.champs.acces_motif, 'abonnement')
  assert.equal(r.champs.acces_fin, null)
})

test('un abonnement qui se ferme ne touche pas au motif', () => {
  // Sinon on efface l'histoire : « il a été abonné, il ne l'est plus » devient
  // « on ne sait pas pourquoi il n'a pas accès ».
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.deleted', created: 1,
    data: { object: { id: 'sub_1', metadata: { garage_id: GARAGE } } },
  })
  assert.equal('acces_motif' in r.champs, false)
  assert.equal('acces_fin' in r.champs, false)
  assert.equal(r.champs.abonnement_actif, false)
})

test('un essai Stripe compte comme un abonnement ouvert', () => {
  const r = ecritureDepuisEvenement({
    type: 'customer.subscription.created', created: 1,
    data: { object: { id: 'sub_1', status: 'trialing', metadata: { garage_id: GARAGE, offre: 'essentiel' } } },
  })
  assert.equal(r.champs.acces_motif, 'abonnement')
})

test('le rattachement de session ne bloque pas l’abonnement qui suit', () => {
  // Le défaut trouvé en recette réelle : Stripe crée l'abonnement et clôt la
  // session dans la même seconde, et livre la session en premier. Avec une
  // garde d'ordre sur les deux, l'abonnement arrivait « dépassé » et l'accès
  // ne s'ouvrait jamais — pour quelqu'un qui venait de payer.
  const session = ecritureDepuisEvenement({
    type: 'checkout.session.completed', created: 1_700_000_000,
    data: { object: { client_reference_id: GARAGE, customer: 'cus_1', subscription: 'sub_1',
                      metadata: { offre: 'atelier', periodicite: 'mensuel' } } },
  })
  const abonnement = ecritureDepuisEvenement({
    type: 'customer.subscription.created', created: 1_700_000_000,
    data: { object: { id: 'sub_1', status: 'trialing', metadata: { garage_id: GARAGE, offre: 'atelier' } } },
  })
  assert.equal(session.gardeOrdre, false, 'le rattachement ne doit pas poser de garde')
  assert.equal(abonnement.gardeOrdre, true, 'le statut, lui, doit rester protégé du désordre')
})
