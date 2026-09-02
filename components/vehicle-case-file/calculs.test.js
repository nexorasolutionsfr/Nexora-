import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  construireChronologie,
  deriverProchaineAction,
  deriverStatutGlobal,
  detecterDonneesIncompletes,
  determinerEtapeAtelierActuelle,
  trouverDernierRendezVous,
  trouverDevisEnAttente,
  trouverFactureEnAttente,
  trouverProchainRendezVous,
} from './calculs.js'

const MAINTENANT = new Date('2026-09-10T10:00:00Z')

const VEHICULE_FIXTURE = { id: 'veh-1', marque: 'Peugeot', modele: '308', immatriculation: 'AA-000-BB' }
const CLIENT_FIXTURE = { id: 'cli-1', nom: 'Client Test' }

test('trouverProchainRendezVous ignore le passé et les rendez-vous annulés', () => {
  const rendezVous = [
    { id: 'rdv-passe', date_debut: '2026-09-01T09:00:00Z', statut: 'Terminé' },
    { id: 'rdv-annule', date_debut: '2026-09-15T09:00:00Z', statut: 'Annulé' },
    { id: 'rdv-futur-1', date_debut: '2026-09-20T09:00:00Z', statut: 'Confirmé' },
    { id: 'rdv-futur-2', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' },
  ]
  const resultat = trouverProchainRendezVous(rendezVous, MAINTENANT)
  assert.equal(resultat?.id, 'rdv-futur-2')
})

test('trouverDernierRendezVous prend le plus récent parmi le passé', () => {
  const rendezVous = [
    { id: 'rdv-vieux', date_debut: '2026-08-01T09:00:00Z', statut: 'Terminé' },
    { id: 'rdv-recent', date_debut: '2026-09-05T09:00:00Z', statut: 'Terminé' },
    { id: 'rdv-futur', date_debut: '2026-09-20T09:00:00Z', statut: 'Confirmé' },
  ]
  const resultat = trouverDernierRendezVous(rendezVous, MAINTENANT)
  assert.equal(resultat?.id, 'rdv-recent')
})

test('determinerEtapeAtelierActuelle ignore "a_venir" et "restitue"', () => {
  assert.equal(determinerEtapeAtelierActuelle([{ id: 'a', statut_atelier: 'a_venir', date_debut: '2026-09-09T09:00:00Z' }]), null)
  assert.equal(determinerEtapeAtelierActuelle([{ id: 'b', statut_atelier: 'restitue', date_debut: '2026-09-09T09:00:00Z' }]), null)
  const enCours = determinerEtapeAtelierActuelle([
    { id: 'c', statut_atelier: 'diagnostic', date_debut: '2026-09-09T09:00:00Z' },
    { id: 'd', statut_atelier: 'intervention', date_debut: '2026-09-10T09:00:00Z' },
  ])
  assert.equal(enCours?.id, 'd', 'doit retenir le plus récent des statuts en cours')
})

test('trouverDevisEnAttente / trouverFactureEnAttente filtrent sur le statut brut', () => {
  const devis = [
    { id: 'dv-accepte', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' },
    { id: 'dv-attente', statut: 'en_attente', created_at: '2026-09-05T00:00:00Z' },
  ]
  assert.equal(trouverDevisEnAttente(devis)?.id, 'dv-attente')
  assert.equal(trouverDevisEnAttente([{ id: 'dv-refuse', statut: 'refuse', created_at: '2026-09-01T00:00:00Z' }]), null)

  const factures = [{ id: 'fa-payee', statut: 'payee', created_at: '2026-09-01T00:00:00Z' }]
  assert.equal(trouverFactureEnAttente(factures), null)
  assert.equal(
    trouverFactureEnAttente([...factures, { id: 'fa-attente', statut: 'en_attente', created_at: '2026-09-02T00:00:00Z' }])?.id,
    'fa-attente'
  )
})

test('deriverProchaineAction priorise devis en attente > atelier en cours > rdv à venir > facture en attente > rien', () => {
  // Devis en attente prioritaire sur tout le reste
  const casDevis = deriverProchaineAction(
    {
      rendezVous: [{ id: 'rdv', date_debut: '2026-09-20T09:00:00Z', statut: 'Confirmé', statut_atelier: 'diagnostic' }],
      devis: [{ id: 'dv', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }],
      factures: [{ id: 'fa', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }],
    },
    MAINTENANT
  )
  assert.equal(casDevis.cible, 'devis')

  // Sans devis en attente : atelier en cours prioritaire sur le rdv à venir
  const casAtelier = deriverProchaineAction(
    {
      rendezVous: [
        { id: 'rdv-en-cours', date_debut: '2026-09-09T09:00:00Z', statut: 'Confirmé', statut_atelier: 'intervention' },
        { id: 'rdv-futur', date_debut: '2026-09-20T09:00:00Z', statut: 'Confirmé' },
      ],
      devis: [],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(casAtelier.cible, 'atelier')

  // Sans atelier ni devis : rdv à venir
  const casRdv = deriverProchaineAction(
    { rendezVous: [{ id: 'rdv-futur', date_debut: '2026-09-20T09:00:00Z', statut: 'Confirmé' }], devis: [], factures: [] },
    MAINTENANT
  )
  assert.equal(casRdv.cible, 'agenda')

  // Sans rien de tout ça, mais une facture en attente
  const casFacture = deriverProchaineAction(
    { rendezVous: [], devis: [], factures: [{ id: 'fa', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }] },
    MAINTENANT
  )
  assert.equal(casFacture.cible, 'factures')

  // Dossier totalement vide
  const casVide = deriverProchaineAction({ rendezVous: [], devis: [], factures: [] }, MAINTENANT)
  assert.equal(casVide.cible, null)
  assert.equal(casVide.label, 'Aucune action en cours')
})

test('deriverStatutGlobal reflète la même priorité que la prochaine action', () => {
  assert.equal(
    deriverStatutGlobal(
      { rendezVous: [{ id: 'rdv', date_debut: '2026-09-09T09:00:00Z', statut_atelier: 'depose' }], devis: [], factures: [] },
      MAINTENANT
    ).cle,
    'atelier'
  )
  assert.equal(deriverStatutGlobal({ rendezVous: [], devis: [], factures: [] }, MAINTENANT).cle, 'aucun_suivi')
  assert.equal(
    deriverStatutGlobal(
      { rendezVous: [{ id: 'rdv', date_debut: '2026-08-01T09:00:00Z', statut: 'Terminé' }], devis: [], factures: [] },
      MAINTENANT
    ).cle,
    'a_jour'
  )
})

test('construireChronologie trie tous les événements par date croissante, sans invention', () => {
  const chronologie = construireChronologie({
    rendezVous: [{ id: 'rdv', date_debut: '2026-09-05T09:00:00Z', prestation: 'Vidange', statut: 'Terminé' }],
    devis: [{ id: 'dv', created_at: '2026-09-01T00:00:00Z', statut: 'accepte' }],
    factures: [{ id: 'fa', created_at: '2026-09-06T00:00:00Z', statut: 'payee' }],
  })
  assert.equal(chronologie.length, 3)
  assert.deepEqual(chronologie.map((e) => e.type), ['devis', 'rendez_vous', 'facture'])
})

test('construireChronologie ignore les entrées sans date exploitable, sans lever d\'erreur', () => {
  const chronologie = construireChronologie({
    rendezVous: [{ id: 'rdv-sans-date', date_debut: null, prestation: 'Vidange', statut: 'Terminé' }],
    devis: [],
    factures: [],
  })
  assert.equal(chronologie.length, 0)
})

test('detecterDonneesIncompletes signale les champs manquants sans en inventer', () => {
  assert.deepEqual(detecterDonneesIncompletes({ vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE }), {
    incomplet: false,
    champsManquantsVehicule: [],
    champsManquantsClient: [],
  })

  const incomplet = detecterDonneesIncompletes({ vehicule: { id: 'veh-2' }, client: {} })
  assert.equal(incomplet.incomplet, true)
  assert.deepEqual(incomplet.champsManquantsVehicule, ['marque/modèle', 'immatriculation'])
  assert.deepEqual(incomplet.champsManquantsClient, ['nom du client'])
})
