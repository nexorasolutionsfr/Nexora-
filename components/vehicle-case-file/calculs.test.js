import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  construireChronologie,
  cibleProchaineAction,
  construireDossierVehicule,
  selectionnerInterventionCourante,
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

// ---------------------------------------------------------------------------
// Le fil du dossier est celui de l'atelier — les cas qui prouvaient le défaut.
//
// Avant le 13 septembre 2026, le dossier dérivait sa propre prochaine action
// sans jamais recevoir l'ordre de réparation. Les deux premiers tests ci-dessous
// échouent sur l'ancien calcul : ils sont la raison du changement.
// ---------------------------------------------------------------------------

const RDV_A_VENIR = { id: 'rdv-1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }

test("ordre terminé : on ne relance plus un client dont la voiture est réparée", () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE,
      client: CLIENT_FIXTURE,
      rendezVous: [RDV_A_VENIR],
      // Le devis est resté « en attente » : l'ancien calcul s'arrêtait là.
      devis: [{ id: 'dev-1', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }],
      ordresReparation: [{ id: 'or-1', rendez_vous_id: 'rdv-1', devis_id: 'dev-1', statut: 'termine', created_at: '2026-09-02T00:00:00Z' }],
      factures: [],
    },
    MAINTENANT
  )

  assert.ok(!/Relancer le client/.test(dossier.prochaineAction.label))
  assert.match(dossier.fil.etat, /[Tt]ravaux terminés|Voiture prête/)
  // La contradiction « ordre terminé / voiture à venir » est signalée, pas tue.
  assert.equal(dossier.fil.contradiction, true)
  assert.ok(dossier.fil.avertissement)
})

test("ordre ouvert : le dossier suit les travaux au lieu d'annoncer un rendez-vous", () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE,
      client: CLIENT_FIXTURE,
      rendezVous: [RDV_A_VENIR],
      devis: [{ id: 'dev-1', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' }],
      ordresReparation: [{ id: 'or-1', rendez_vous_id: 'rdv-1', devis_id: 'dev-1', statut: 'confirme', created_at: '2026-09-02T00:00:00Z' }],
      factures: [],
    },
    MAINTENANT
  )

  assert.equal(dossier.fil.etat, 'Ordre de réparation ouvert')
  assert.equal(dossier.prochaineAction.cible, 'ordres_reparation')
  assert.equal(dossier.fil.contradiction, false)
})

test('sans rendez-vous, sans devis, sans ordre : le dossier le dit sans rien inventer', () => {
  const dossier = construireDossierVehicule(
    { vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE, rendezVous: [], devis: [], ordresReparation: [], factures: [] },
    MAINTENANT
  )

  assert.equal(dossier.fil.etat, 'Dossier ouvert')
  assert.equal(dossier.prochaineAction.cible, null)
  assert.equal(dossier.intervention.rdv, null)
  assert.equal(dossier.intervention.ordre, null)
})

test('un rendez-vous seul, sans devis ni ordre, reste un rendez-vous', () => {
  const dossier = construireDossierVehicule(
    { vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE, rendezVous: [RDV_A_VENIR], devis: [], ordresReparation: [], factures: [] },
    MAINTENANT
  )

  assert.equal(dossier.fil.etat, 'Rendez-vous prévu')
  assert.equal(dossier.prochaineAction.cible, 'agenda')
})

test('les états métier restent distincts : le fil ne les fusionne pas', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE,
      client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'rdv-1', date_debut: '2026-09-09T09:00:00Z', statut: 'Confirmé', statut_atelier: 'attente_piece' }],
      devis: [{ id: 'dev-1', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' }],
      ordresReparation: [{ id: 'or-1', rendez_vous_id: 'rdv-1', devis_id: 'dev-1', statut: 'confirme', created_at: '2026-09-02T00:00:00Z' }],
      factures: [{ id: 'fa-1', statut: 'en_attente', rendez_vous_id: 'rdv-1', created_at: '2026-09-03T00:00:00Z' }],
    },
    MAINTENANT
  )

  // Le devis accepté, la facture en attente et l'étape d'atelier coexistent :
  // aucun statut unique ne vient les écraser.
  assert.equal(dossier.devisEnAttente, null)
  assert.equal(dossier.factureEnAttente?.id, 'fa-1')
  assert.equal(dossier.etapeAtelier?.statut_atelier, 'attente_piece')
  assert.equal(dossier.intervention.ordre?.statut, 'confirme')
})

test('données incomplètes : le fil se calcule quand même, sans lever', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: { id: 'veh-2' },
      client: null,
      rendezVous: [{ id: 'rdv-x', date_debut: null, statut: null }],
      devis: [{ id: 'dev-x', statut: null, created_at: null }],
      ordresReparation: [{ id: 'or-x', rendez_vous_id: null, statut: null, created_at: null }],
      factures: [],
    },
    MAINTENANT
  )

  assert.ok(dossier.fil.etat)
  assert.ok(dossier.fil.prochaineAction)
  assert.equal(dossier.donneesIncompletes.incomplet, true)
})

test("selectionnerInterventionCourante rattache l'ordre par son rendez-vous, et le devis par l'ordre", () => {
  const intervention = selectionnerInterventionCourante(
    {
      rendezVous: [RDV_A_VENIR],
      devis: [
        { id: 'dev-vieux', statut: 'refuse', created_at: '2026-01-01T00:00:00Z' },
        { id: 'dev-lie', statut: 'accepte', created_at: '2026-02-01T00:00:00Z' },
      ],
      ordresReparation: [{ id: 'or-1', rendez_vous_id: 'rdv-1', devis_id: 'dev-lie', statut: 'confirme' }],
      factures: [],
    },
    MAINTENANT
  )

  assert.equal(intervention.rdv.id, 'rdv-1')
  assert.equal(intervention.ordre.id, 'or-1')
  // Le devis lié à l'ordre l'emporte sur le plus récent.
  assert.equal(intervention.devis.id, 'dev-lie')
})

test('cibleProchaineAction envoie là où le travail se poursuit', () => {
  assert.equal(cibleProchaineAction({ rdv: null, devis: null, ordre: null, facture: { id: 'f' } }), 'factures')
  assert.equal(cibleProchaineAction({ rdv: null, devis: null, ordre: { id: 'o' }, facture: null }), 'ordres_reparation')
  assert.equal(cibleProchaineAction({ rdv: { id: 'r', statut_atelier: 'intervention' }, devis: null, ordre: null, facture: null }), 'atelier')
  assert.equal(cibleProchaineAction({ rdv: null, devis: { id: 'd' }, ordre: null, facture: null }), 'devis')
  assert.equal(cibleProchaineAction({ rdv: { id: 'r' }, devis: null, ordre: null, facture: null }), 'agenda')
  assert.equal(cibleProchaineAction({ rdv: null, devis: null, ordre: null, facture: null }), null)
})
