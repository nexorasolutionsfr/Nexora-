// Génération du XML Factur-X, profil BASIC (norme EN 16931, syntaxe CII).
//
// POURQUOI CE FICHIER EXISTE
//
// La réforme française impose aux TPE d'émettre des factures électroniques au
// 1er septembre 2027 : c'est l'échéance de tous les garages. Une facture
// électronique n'est pas un PDF envoyé par e-mail — c'est un jeu de données
// structuré, lisible par une machine, qui transite par une plateforme agréée.
//
// Ce module produit ce jeu de données. Il ne dépend de rien : ni réseau, ni
// React, ni Supabase, ni bibliothèque tierce. C'est délibéré — une facture
// mal formée est rejetée par la plateforme et revient au garage sans qu'il
// comprenne pourquoi, donc cette partie doit être éprouvée par des tests, pas
// par l'usage.
//
// PROFIL RETENU : BASIC
//
// Factur-X définit cinq profils, du MINIMUM à l'EXTENDED. BASIC est le premier
// qui porte le détail des lignes, ce qui est indispensable ici : un garage
// facture de la main-d'oeuvre ET des pièces, et la réforme demande justement de
// distinguer prestations de services et livraisons de biens.
//
// CE QU'IL NE FAIT PAS
//
// Il ne produit pas le PDF/A-3 qui embarque ce XML, et ne transmet rien. Le
// raccordement à une plateforme agréée reste à faire, et beaucoup de
// plateformes acceptent le XML seul en se chargeant de l'assemblage.

const PROFIL_BASIC = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic";

// Codes UNTDID 1001 : 380 = facture commerciale, 381 = avoir.
const TYPE_FACTURE = "380";
const TYPE_AVOIR = "381";

// Codes UNTDID 5305 pour la catégorie de TVA.
//   S  = taux normal
//   E  = exonéré
// La franchise en base relève de E, avec la mention légale en clair : c'est le
// cas de l'éditeur, et de certains garages.
const CATEGORIE_TVA_STANDARD = "S";
const CATEGORIE_TVA_EXONEREE = "E";

export class ErreurFacturX extends Error {}

function texte(valeur) {
  return String(valeur ?? "").trim();
}

// Échappement XML. Les cinq entités, et pas seulement les trois habituelles :
// un nom de client contenant une apostrophe — « Garage de l'Étoile » — casserait
// un attribut, et ce sont des noms qui existent vraiment.
export function echapper(valeur) {
  return texte(valeur)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Les montants Factur-X s'écrivent avec un point décimal et deux décimales,
// jamais dans le format d'affichage français. Une virgule ici et la facture est
// rejetée à la validation du schéma.
export function montant(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) {
    throw new ErreurFacturX("Montant non numérique dans la facture");
  }
  return n.toFixed(2);
}

// Les quantités admettent quatre décimales : une main-d'oeuvre se facture
// couramment en fractions d'heure.
export function quantite(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) {
    throw new ErreurFacturX("Quantité non numérique dans la facture");
  }
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

// Format 102 de l'UNTDID 2379 : AAAAMMJJ, sans séparateur.
export function dateFacturX(valeur) {
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) {
    throw new ErreurFacturX("Date de facture illisible");
  }
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

// Une pièce est une livraison de biens, une main-d'oeuvre une prestation de
// services. La distinction existe déjà dans les lignes d'ordre de réparation :
// on la réutilise plutôt que de demander au garage de la ressaisir.
export function categorieOperation(lignes = []) {
  let biens = false;
  let services = false;
  for (const l of lignes) {
    if (l.type === "piece") biens = true;
    else services = true;
  }
  if (biens && services) return "mixte";
  if (biens) return "biens";
  return "services";
}

function ligneXml(l, index) {
  const qte = Number(l.quantite) || 0;
  const pu = Number(l.prix_unitaire_ht) || 0;
  const total = Math.round(qte * pu * 100) / 100;
  const taux = Number(l.taux_tva ?? 0);
  const categorie = taux > 0 ? CATEGORIE_TVA_STANDARD : CATEGORIE_TVA_EXONEREE;
  // C62 = unité indifférenciée (UN/ECE Recommandation 20). HUR existe pour
  // l'heure, mais une main-d'oeuvre facturée « 1 forfait » n'est pas une heure :
  // on ne prétend pas savoir.
  return `      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${index + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${echapper(l.description || l.libelle || "Prestation")}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${montant(pu)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="C62">${quantite(qte)}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${categorie}</ram:CategoryCode>
            <ram:RateApplicablePercent>${montant(taux)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${montant(total)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
}

// Regroupe la TVA par taux : la norme attend un bloc par taux appliqué, pas un
// bloc par ligne. Deux lignes à 20 % donnent un seul bloc.
export function repartitionTva(lignes = []) {
  const parTaux = new Map();
  for (const l of lignes) {
    const taux = Number(l.taux_tva ?? 0);
    const base = Math.round((Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * 100) / 100;
    const courant = parTaux.get(taux) || 0;
    parTaux.set(taux, Math.round((courant + base) * 100) / 100);
  }
  return [...parTaux.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taux, base]) => ({
      taux,
      base,
      montant: Math.round(base * taux) / 100,
      categorie: taux > 0 ? CATEGORIE_TVA_STANDARD : CATEGORIE_TVA_EXONEREE,
    }));
}

/**
 * Produit le XML Factur-X d'une facture.
 *
 * @param {object} facture  numero, created_at, lignes, statut
 * @param {object} garage   nom_garage, siren, adresse, tva_sur_les_debits
 * @param {object} client   nom, siren, est_professionnel, adresse
 */
export function genererXml({ facture, garage, client }) {
  if (!facture) throw new ErreurFacturX("Facture absente");
  if (!texte(facture.numero)) {
    throw new ErreurFacturX("La facture n'a pas de numéro : une facture électronique doit en porter un.");
  }
  if (!garage || !texte(garage.siren)) {
    throw new ErreurFacturX(
      "Le SIREN du garage est absent. Renseignez-le dans Paramètres, section Facturation électronique.",
    );
  }
  if (!texte(garage.nom_garage)) {
    throw new ErreurFacturX("Le nom du garage est absent.");
  }
  // Entre professionnels, le SIREN du client est une mention obligatoire de la
  // réforme. Sur un particulier il n'existe pas, et la facture relève de
  // l'e-reporting : on ne le réclame donc pas.
  if (client?.est_professionnel && !texte(client.siren)) {
    throw new ErreurFacturX(
      "Ce client est un professionnel : son SIREN est obligatoire sur la facture. Renseignez-le dans sa fiche.",
    );
  }

  const lignes = Array.isArray(facture.lignes) && facture.lignes.length
    ? facture.lignes
    : [{ description: "Prestation atelier", quantite: 1, prix_unitaire_ht: facture.montant_ht || 0, taux_tva: 0 }];

  const tva = repartitionTva(lignes);
  const totalHt = Math.round(tva.reduce((s, t) => s + t.base, 0) * 100) / 100;
  const totalTva = Math.round(tva.reduce((s, t) => s + t.montant, 0) * 100) / 100;
  const totalTtc = Math.round((totalHt + totalTva) * 100) / 100;

  const blocsTva = tva
    .map(
      (t) => `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${montant(t.montant)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${
          t.categorie === CATEGORIE_TVA_EXONEREE
            ? `\n        <ram:ExemptionReason>TVA non applicable, article 293 B du CGI</ram:ExemptionReason>`
            : ""
        }
        <ram:BasisAmount>${montant(t.base)}</ram:BasisAmount>
        <ram:CategoryCode>${t.categorie}</ram:CategoryCode>${
          t.categorie === CATEGORIE_TVA_EXONEREE
            ? `\n        <ram:ExemptionReasonCode>VATEX-EU-O</ram:ExemptionReasonCode>`
            : ""
        }
        <ram:RateApplicablePercent>${montant(t.taux)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`,
    )
    .join("\n");

  const identifiantClient = texte(client?.siren)
    ? `\n          <ram:SpecifiedLegalOrganization>
            <ram:ID schemeID="0002">${echapper(client.siren)}</ram:ID>
          </ram:SpecifiedLegalOrganization>`
    : "";

  const livraison = texte(facture.adresse_livraison)
    ? `\n      <ram:ShipToTradeParty>
        <ram:PostalTradeAddress>
          <ram:LineOne>${echapper(facture.adresse_livraison)}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:ShipToTradeParty>`
    : "";

  // Quatrième mention obligatoire de la réforme, portée en clair : la structure
  // Factur-X BASIC n'a pas de champ dédié à l'option pour les débits.
  const mentionDebits = garage.tva_sur_les_debits
    ? `\n    <ram:IncludedNote>
      <ram:Content>${echapper("Option pour le paiement de la TVA d'après les débits")}</ram:Content>
    </ram:IncludedNote>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${PROFIL_BASIC}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${echapper(facture.numero)}</ram:ID>
    <ram:TypeCode>${facture.est_avoir ? TYPE_AVOIR : TYPE_FACTURE}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dateFacturX(facture.created_at || Date.now())}</udt:DateTimeString>
    </ram:IssueDateTime>${mentionDebits}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lignes.map(ligneXml).join("\n")}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${echapper(garage.nom_garage)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${echapper(garage.siren)}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:LineOne>${echapper(garage.adresse || "")}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${echapper(client?.nom || "Client")}</ram:Name>${identifiantClient}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${livraison}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${blocsTva}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${montant(totalHt)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${montant(totalHt)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${montant(totalTva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${montant(totalTtc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${montant(totalTtc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/** Nom de fichier conventionnel : le XML embarqué s'appelle toujours ainsi. */
export const NOM_FICHIER_FACTURX = "factur-x.xml";
