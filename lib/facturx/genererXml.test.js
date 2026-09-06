import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ErreurFacturX,
  categorieOperation,
  dateFacturX,
  echapper,
  genererXml,
  montant,
  quantite,
  repartitionTva,
} from './genererXml.js'

const GARAGE = {
  nom_garage: 'Garage Dupont',
  siren: '552100554',
  adresse: '12 rue des Ateliers, 52100 Saint-Dizier',
  tva_sur_les_debits: false,
}

const FACTURE = {
  numero: 'F-2026-0042',
  created_at: '2026-09-05T10:00:00Z',
  lignes: [
    { description: 'Révision complète', type: 'main_oeuvre', quantite: 1.5, prix_unitaire_ht: 60, taux_tva: 20 },
    { description: 'Filtre à huile', type: 'piece', quantite: 1, prix_unitaire_ht: 18.5, taux_tva: 20 },
  ],
}

const PARTICULIER = { nom: 'Jean Dupont', est_professionnel: false }
const PRO = { nom: 'Transports Martin', est_professionnel: true, siren: '542051180' }

// ---------------------------------------------------------------------------
// Formats — c'est là que les factures se font rejeter
// ---------------------------------------------------------------------------

test('les montants utilisent le point décimal, jamais la virgule', () => {
  // Un montant en format français est rejeté à la validation du schéma, et la
  // facture revient au garage sans explication utilisable.
  assert.equal(montant(1234.5), '1234.50')
  assert.equal(montant(0), '0.00')
  assert.equal(montant('18.5'), '18.50')
  assert.doesNotMatch(montant(1234.5), /,/)
})

test('un montant non numérique est refusé plutôt que rendu NaN', () => {
  assert.throws(() => montant('abc'), ErreurFacturX)
  assert.throws(() => montant(undefined), ErreurFacturX)
})

test('les quantités admettent les fractions d heure', () => {
  assert.equal(quantite(1.5), '1.5')
  assert.equal(quantite(1), '1.0')
  assert.equal(quantite(0.25), '0.25')
})

test('les dates suivent le format 102, AAAAMMJJ', () => {
  assert.equal(dateFacturX('2026-09-05T10:00:00Z'), '20260905')
  assert.equal(dateFacturX('2026-01-01T00:00:00Z'), '20260101')
  assert.throws(() => dateFacturX('pas une date'), ErreurFacturX)
})

test('l échappement couvre les cinq entités', () => {
  // « Garage de l'Étoile » existe vraiment : une apostrophe non échappée casse
  // le document.
  assert.equal(echapper(`Garage de l'Étoile & Fils <"test">`),
    'Garage de l&apos;Étoile &amp; Fils &lt;&quot;test&quot;&gt;')
})

// ---------------------------------------------------------------------------
// Règles métier
// ---------------------------------------------------------------------------

test('la catégorie d opération se déduit des lignes', () => {
  assert.equal(categorieOperation([{ type: 'piece' }]), 'biens')
  assert.equal(categorieOperation([{ type: 'main_oeuvre' }]), 'services')
  assert.equal(categorieOperation([{ type: 'piece' }, { type: 'main_oeuvre' }]), 'mixte')
  // Une ligne sans type est une prestation : c'est le cas par défaut d'un
  // garage, et présumer une livraison de biens serait plus risqué.
  assert.equal(categorieOperation([{}]), 'services')
})

test('la TVA est regroupée par taux, pas par ligne', () => {
  const r = repartitionTva([
    { quantite: 1, prix_unitaire_ht: 100, taux_tva: 20 },
    { quantite: 2, prix_unitaire_ht: 50, taux_tva: 20 },
    { quantite: 1, prix_unitaire_ht: 30, taux_tva: 10 },
  ])
  assert.equal(r.length, 2, 'deux taux appliqués, donc deux blocs')
  assert.deepEqual(r[0], { taux: 10, base: 30, montant: 3, categorie: 'S' })
  assert.deepEqual(r[1], { taux: 20, base: 200, montant: 40, categorie: 'S' })
})

test('un taux à zéro passe en catégorie exonérée', () => {
  // C'est le cas d'un garage en franchise en base : la catégorie S avec un taux
  // à 0 serait rejetée, il faut E.
  const r = repartitionTva([{ quantite: 1, prix_unitaire_ht: 100, taux_tva: 0 }])
  assert.equal(r[0].categorie, 'E')
})

// ---------------------------------------------------------------------------
// Document complet
// ---------------------------------------------------------------------------

test('le document déclare le profil BASIC et la bonne syntaxe', () => {
  const xml = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /urn:factur-x\.eu:1p0:basic/)
  assert.match(xml, /<rsm:CrossIndustryInvoice/)
  assert.match(xml, /<ram:TypeCode>380<\/ram:TypeCode>/)
})

test('les totaux sont cohérents entre eux', () => {
  const xml = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  // 1.5 × 60 = 90 ; 1 × 18.50 = 18.50 ; HT = 108.50 ; TVA 20 % = 21.70 ; TTC = 130.20
  assert.match(xml, /<ram:LineTotalAmount>108\.50<\/ram:LineTotalAmount>/)
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">21\.70<\/ram:TaxTotalAmount>/)
  assert.match(xml, /<ram:GrandTotalAmount>130\.20<\/ram:GrandTotalAmount>/)
  assert.match(xml, /<ram:DuePayableAmount>130\.20<\/ram:DuePayableAmount>/)
})

test('chaque ligne porte son numéro d ordre', () => {
  const xml = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.match(xml, /<ram:LineID>1<\/ram:LineID>/)
  assert.match(xml, /<ram:LineID>2<\/ram:LineID>/)
})

test('le SIREN du vendeur porte le schéma 0002', () => {
  // 0002 est l'identifiant du répertoire SIRENE dans la liste ISO 6523. Sans
  // lui, la plateforme ne sait pas comment lire le numéro.
  const xml = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.match(xml, /<ram:ID schemeID="0002">552100554<\/ram:ID>/)
})

test('le SIREN du client professionnel apparaît, celui du particulier non', () => {
  const pro = genererXml({ facture: FACTURE, garage: GARAGE, client: PRO })
  assert.match(pro, /542051180/)
  const part = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.doesNotMatch(part, /schemeID="0002">(?!552100554)/)
})

// ---------------------------------------------------------------------------
// Refus explicites — mieux vaut bloquer que produire une facture rejetable
// ---------------------------------------------------------------------------

test('sans SIREN du garage, on refuse et on dit où le renseigner', () => {
  assert.throws(
    () => genererXml({ facture: FACTURE, garage: { ...GARAGE, siren: null }, client: PARTICULIER }),
    (e) => e instanceof ErreurFacturX && /Paramètres/.test(e.message),
  )
})

test('un client professionnel sans SIREN est refusé', () => {
  // C'est une mention obligatoire : produire la facture quand même ferait
  // tomber une amende de 15 € sur le garage.
  assert.throws(
    () => genererXml({ facture: FACTURE, garage: GARAGE, client: { ...PRO, siren: null } }),
    (e) => e instanceof ErreurFacturX && /professionnel/.test(e.message),
  )
})

test('une facture sans numéro est refusée', () => {
  assert.throws(
    () => genererXml({ facture: { ...FACTURE, numero: '' }, garage: GARAGE, client: PARTICULIER }),
    ErreurFacturX,
  )
})

// ---------------------------------------------------------------------------
// Cas particuliers du terrain
// ---------------------------------------------------------------------------

test('la franchise en base porte sa mention légale dans le document', () => {
  const xml = genererXml({
    facture: { ...FACTURE, lignes: [{ description: 'Révision', quantite: 1, prix_unitaire_ht: 100, taux_tva: 0 }] },
    garage: GARAGE,
    client: PARTICULIER,
  })
  assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/)
  assert.match(xml, /article 293 B du CGI/)
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">0\.00<\/ram:TaxTotalAmount>/)
})

test('l option TVA sur les débits est portée en clair', () => {
  const xml = genererXml({ facture: FACTURE, garage: { ...GARAGE, tva_sur_les_debits: true }, client: PARTICULIER })
  assert.match(xml, /d&apos;après les débits/)
  const sans = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.doesNotMatch(sans, /débits/)
})

test('l adresse de livraison n apparaît que si elle diffère', () => {
  const avec = genererXml({
    facture: { ...FACTURE, adresse_livraison: '5 impasse du Pont, 52100 Saint-Dizier' },
    garage: GARAGE, client: PARTICULIER,
  })
  assert.match(avec, /ShipToTradeParty/)
  const sans = genererXml({ facture: FACTURE, garage: GARAGE, client: PARTICULIER })
  assert.doesNotMatch(sans, /ShipToTradeParty/)
})

test('une facture sans lignes reste émettable sur son montant global', () => {
  // Les factures antérieures au devis multi-lignes n'ont pas de détail. Les
  // refuser rendrait tout l'historique inexploitable.
  const xml = genererXml({
    facture: { numero: 'F-2025-001', created_at: '2026-01-15T00:00:00Z', lignes: [], montant_ht: 250 },
    garage: GARAGE, client: PARTICULIER,
  })
  assert.match(xml, /<ram:LineTotalAmount>250\.00<\/ram:LineTotalAmount>/)
  assert.match(xml, /Prestation atelier/)
})

test('un nom de client à apostrophe ne casse pas le document', () => {
  const xml = genererXml({
    facture: FACTURE, garage: GARAGE,
    client: { nom: "Garage de l'Étoile & Fils", est_professionnel: false },
  })
  assert.match(xml, /Garage de l&apos;Étoile &amp; Fils/)
  assert.doesNotMatch(xml, /l'Étoile/)
})

test('les balises ouvertes sont toutes refermées', () => {
  // Contrôle grossier mais efficace : autant de chevrons ouvrants que de
  // fermants pour chaque nom de balise rencontré.
  const xml = genererXml({ facture: FACTURE, garage: GARAGE, client: PRO })
  const ouvrantes = [...xml.matchAll(/<((?:ram|rsm|udt):[A-Za-z]+)[\s>]/g)].map((m) => m[1])
  const fermantes = [...xml.matchAll(/<\/((?:ram|rsm|udt):[A-Za-z]+)>/g)].map((m) => m[1])
  const compte = (liste) => liste.reduce((acc, n) => ({ ...acc, [n]: (acc[n] || 0) + 1 }), {})
  assert.deepEqual(compte(ouvrantes), compte(fermantes))
})
