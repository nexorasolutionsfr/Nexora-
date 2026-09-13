import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  construireChronologie,
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
  // Il y a bien un geste — créer un rendez-vous — donc une destination.
  // C'est le fil qui la donne, plus un calcul parallèle.
  assert.equal(dossier.prochaineAction.cible, 'agenda')
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


// ---------------------------------------------------------------------------
// Revue du 13 septembre 2026 — les cas qui échouaient avant ce lot.
// ---------------------------------------------------------------------------

test("la destination vient du fil, pas d'un second calcul", () => {
  // Dossier clos : aucune destination, donc aucun bouton dominant.
  const clos = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'r1', date_debut: '2026-09-01T09:00:00Z', statut: 'Terminé' }],
      devis: [], ordresReparation: [],
      factures: [{ id: 'f1', statut: 'payee', rendez_vous_id: 'r1', created_at: '2026-09-02T00:00:00Z' }],
    },
    MAINTENANT
  )
  assert.equal(clos.fil.quiAgit, 'personne')
  assert.equal(clos.fil.cible, null)
  assert.equal(clos.prochaineAction.cible, null)

  // Ordre ouvert : la phrase parle de l'ordre, le bouton y mène.
  const ouvert = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
      devis: [{ id: 'd1', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' }],
      ordresReparation: [{ id: 'o1', rendez_vous_id: 'r1', devis_id: 'd1', statut: 'confirme' }],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(ouvert.fil.etat, 'Ordre de réparation ouvert')
  assert.equal(ouvert.prochaineAction.cible, 'ordres_reparation')
})

test("une facture déjà envoyée n'est jamais présentée comme à envoyer", () => {
  const base = {
    vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
    rendezVous: [{ id: 'r1', date_debut: '2026-09-10T09:00:00Z', statut: 'Terminé' }],
    devis: [], ordresReparation: [],
    factures: [{ id: 'f1', statut: 'en_attente', rendez_vous_id: 'r1', created_at: '2026-09-11T00:00:00Z' }],
  }

  const sansEtat = construireDossierVehicule(base, MAINTENANT)
  assert.match(sansEtat.fil.prochaineAction, /confirmez son envoi/)

  const envoyee = construireDossierVehicule({ ...base, etatEnvoiFacture: 'envoye' }, MAINTENANT)
  assert.equal(envoyee.fil.etat, 'Facture envoyée')
  assert.equal(envoyee.fil.quiAgit, 'client')
  assert.ok(!/confirmez son envoi/.test(envoyee.fil.prochaineAction))

  const programme = construireDossierVehicule({ ...base, etatEnvoiFacture: 'en_attente_envoi' }, MAINTENANT)
  assert.equal(programme.fil.etat, "Facture en attente d'envoi")
  assert.equal(programme.fil.cible, null)

  const incertain = construireDossierVehicule({ ...base, etatEnvoiFacture: 'envoi_en_cours' }, MAINTENANT)
  assert.match(incertain.fil.etat, /à vérifier/)
  assert.equal(incertain.fil.quiAgit, 'garage')
})

test("un devis envoyé attend le client, il ne se renvoie pas", () => {
  const base = {
    vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
    rendezVous: [{ id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
    devis: [{ id: 'd1', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }],
    ordresReparation: [{ id: 'o1', rendez_vous_id: 'r1', devis_id: 'd1', statut: 'brouillon' }],
    factures: [],
  }
  const envoye = construireDossierVehicule({ ...base, etatEnvoiDevis: 'envoye' }, MAINTENANT)
  // L'ordre existe : le fil parle d'abord de l'ordre. L'important est qu'aucun
  // état n'annonce un envoi à faire alors qu'il a eu lieu.
  assert.ok(!/confirmez son envoi/.test(envoye.fil.prochaineAction))
})

test("une ancienne facture ne devient pas la facture du nouveau rendez-vous", () => {
  // Cas 1 de la revue : visite terminée et facturée l'an dernier, nouvelle
  // visite prévue demain. L'ancienne version rattachait la facture payée au
  // nouveau rendez-vous et annonçait « dossier clos ».
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [
        { id: 'ancien', date_debut: '2025-10-01T09:00:00Z', statut: 'Terminé' },
        { id: 'nouveau', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' },
      ],
      devis: [],
      ordresReparation: [],
      factures: [{ id: 'f-ancienne', statut: 'payee', rendez_vous_id: 'ancien', created_at: '2025-10-02T00:00:00Z' }],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.rdv.id, 'nouveau')
  assert.equal(dossier.intervention.facture, null)
  assert.equal(dossier.fil.etat, 'Rendez-vous prévu')
  assert.ok(!/clos/.test(dossier.fil.prochaineAction))
})

test("un ancien devis refusé ne colle pas au nouveau rendez-vous", () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'nouveau', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
      devis: [{ id: 'd-refuse', statut: 'refuse', created_at: '2025-01-01T00:00:00Z' }],
      ordresReparation: [],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.devis, null)
  assert.equal(dossier.fil.etat, 'Rendez-vous prévu')
})

test('plusieurs rendez-vous et plusieurs ordres : chacun reste avec le sien', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [
        { id: 'r-vieux', date_debut: '2026-01-05T09:00:00Z', statut: 'Terminé' },
        { id: 'r-actif', date_debut: '2026-09-11T09:00:00Z', statut: 'Confirmé', statut_atelier: 'intervention' },
      ],
      devis: [
        { id: 'd-vieux', statut: 'accepte', created_at: '2026-01-01T00:00:00Z' },
        { id: 'd-actif', statut: 'accepte', created_at: '2026-09-10T00:00:00Z' },
      ],
      ordresReparation: [
        { id: 'o-vieux', rendez_vous_id: 'r-vieux', devis_id: 'd-vieux', statut: 'termine' },
        { id: 'o-actif', rendez_vous_id: 'r-actif', devis_id: 'd-actif', statut: 'confirme' },
      ],
      factures: [{ id: 'f-vieille', statut: 'payee', rendez_vous_id: 'r-vieux', created_at: '2026-01-06T00:00:00Z' }],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.rdv.id, 'r-actif')
  assert.equal(dossier.intervention.ordre.id, 'o-actif')
  assert.equal(dossier.intervention.devis.id, 'd-actif')
  assert.equal(dossier.intervention.facture, null, "la facture de la visite précédente n'appartient pas à celle-ci")
})

test("un devis sans ordre n'est pas rattaché de force au rendez-vous", () => {
  // Le modèle ne porte pas la relation devis → rendez-vous. On ne l'invente
  // pas ; le devis reste visible ailleurs.
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
      devis: [{ id: 'd1', statut: 'en_attente', created_at: '2026-09-11T00:00:00Z' }],
      ordresReparation: [],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.devis, null)
})

test('sans aucun rendez-vous, un devis seul reste montrable', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [], ordresReparation: [], factures: [],
      devis: [{ id: 'd1', statut: 'en_attente', created_at: '2026-09-11T00:00:00Z' }],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.devis.id, 'd1')
  assert.equal(dossier.intervention.facture, null)
  assert.equal(dossier.fil.etat, 'Devis établi')
})

test("un devis en attente reste visible même si le modèle ne le rattache pas", () => {
  // `ordres_reparation_check_integrite` exige un devis accepté pour le
  // rattacher à un ordre : un devis en attente n'a donc aucun lien avec une
  // visite. Il ne doit pas disparaître pour autant.
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
      devis: [{ id: 'd-attente', statut: 'en_attente', created_at: '2026-09-11T00:00:00Z' }],
      ordresReparation: [],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.devis, null, "pas rattaché de force à la visite")
  assert.equal(dossier.devisSansRattachement.length, 1)
  assert.equal(dossier.devisSansRattachement[0].id, 'd-attente')
})

test('un devis rattaché à un ordre ne figure pas dans les non-rattachés', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [{ id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }],
      devis: [
        { id: 'd-lie', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' },
        { id: 'd-libre', statut: 'refuse', created_at: '2026-08-01T00:00:00Z' },
      ],
      ordresReparation: [{ id: 'o1', rendez_vous_id: 'r1', devis_id: 'd-lie', statut: 'confirme' }],
      factures: [],
    },
    MAINTENANT
  )
  assert.equal(dossier.intervention.devis.id, 'd-lie')
  assert.deepEqual(dossier.devisSansRattachement.map((d) => d.id), ['d-libre'])
})

// ---------------------------------------------------------------------------
// Cas 4 de la recette : ne jamais conseiller d'établir un devis quand il en
// existe déjà un que le modèle n'a pas su rattacher.
// ---------------------------------------------------------------------------

const RDV_SEUL = { id: 'r1', date_debut: '2026-09-12T09:00:00Z', statut: 'Confirmé' }

test("un devis non rattaché : on demande de le vérifier, pas d'en créer un autre", () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [RDV_SEUL],
      devis: [{ id: 'd1', statut: 'en_attente', montant_ttc: 240, created_at: '2026-09-11T00:00:00Z' }],
      ordresReparation: [], factures: [],
    },
    MAINTENANT
  )
  assert.equal(
    dossier.fil.prochaineAction,
    "Un devis existe déjà pour ce véhicule. Vérifiez s'il concerne ce rendez-vous avant d'en créer un autre."
  )
  assert.equal(dossier.fil.quiAgit, 'garage')
  // Un seul devis : on l'ouvre directement.
  assert.equal(dossier.fil.cible, 'devis')
  assert.equal(dossier.devisSansRattachement.length, 1)
  // Le devis n'est toujours pas rattaché à l'intervention.
  assert.equal(dossier.intervention.devis, null)
})

test('plusieurs devis non rattachés : on renvoie vers leur liste', () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [RDV_SEUL],
      devis: [
        { id: 'd1', statut: 'en_attente', montant_ttc: 240, created_at: '2026-09-11T00:00:00Z' },
        { id: 'd2', statut: 'refuse', montant_ttc: 90, created_at: '2026-09-05T00:00:00Z' },
      ],
      ordresReparation: [], factures: [],
    },
    MAINTENANT
  )
  assert.match(dossier.fil.prochaineAction, /Un devis existe déjà/)
  assert.equal(dossier.fil.cible, 'devis_sans_intervention')
  assert.equal(dossier.devisSansRattachement.length, 2)
})

test("aucun devis : le conseil d'en établir un reste légitime", () => {
  const dossier = construireDossierVehicule(
    {
      vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
      rendezVous: [RDV_SEUL], devis: [], ordresReparation: [], factures: [],
    },
    MAINTENANT
  )
  assert.match(dossier.fil.prochaineAction, /Établissez le devis/)
  assert.equal(dossier.fil.cible, 'agenda')
  assert.equal(dossier.devisSansRattachement.length, 0)
})

test("aucun écran ne recommande de créer un devis quand il en existe un", () => {
  // Garde-fou général : quelle que soit la situation, dès qu'un devis existe
  // pour ce véhicule, aucune phrase du fil ne doit inviter à en établir un.
  const situations = [
    { nom: 'devis en attente', devis: [{ id: 'd', statut: 'en_attente', created_at: '2026-09-01T00:00:00Z' }], ordres: [] },
    { nom: 'devis refusé', devis: [{ id: 'd', statut: 'refuse', created_at: '2026-09-01T00:00:00Z' }], ordres: [] },
    { nom: 'devis accepté non rattaché', devis: [{ id: 'd', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' }], ordres: [] },
    {
      nom: 'devis accepté rattaché à un ordre',
      devis: [{ id: 'd', statut: 'accepte', created_at: '2026-09-01T00:00:00Z' }],
      ordres: [{ id: 'o', rendez_vous_id: 'r1', devis_id: 'd', statut: 'confirme' }],
    },
  ]
  for (const s of situations) {
    const dossier = construireDossierVehicule(
      {
        vehicule: VEHICULE_FIXTURE, client: CLIENT_FIXTURE,
        rendezVous: [RDV_SEUL], devis: s.devis, ordresReparation: s.ordres, factures: [],
      },
      MAINTENANT
    )
    assert.ok(
      !/Établissez le devis/.test(dossier.fil.prochaineAction),
      `« ${s.nom} » : l'écran conseille encore d'établir un devis — ${dossier.fil.prochaineAction}`
    )
  }
})
