// Lecture GRATUITE d'une facture : règles appliquées au texte d'un PDF.
//
// Aucun service extérieur, aucun coût : le texte vient du PDF lui-même
// (lib/auto/lecture/texte-pdf.js). Les règles suivent les usages des factures
// françaises (« Total TTC », « Net à payer », dates, plaques SIV/FNI, « Km ») et
// rendent le même format que tout fournisseur (SCHEMA_PROPOSITION), ensuite
// normalisé par lib/auto/lecture/proposition.js.
//
// Prudence avant tout :
// - un kilométrage de garantie, de prochain entretien ou d'assistance n'est
//   jamais pris ; une date d'échéance, de mise en circulation ou de validité
//   non plus ;
// - ce qui est deviné (professionnel, opérations sans mot-clé, date sans
//   libellé) est « incertain » ;
// - un devis ou une attestation n'est pas une facture.
//
// Pur et testé (regles.test.js).

export const VERSION_REGLES = "regles-1";

const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

const sansAccents = (texte) => texte.normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLowerCase();
const lue = (valeur) => ({ valeur, certitude: "lue" });
const incertaine = (valeur) => ({ valeur, certitude: "incertaine" });
const rien = () => ({ valeur: null, certitude: "incertaine" });

function lignesDe(pages) {
  return pages
    .join("\n")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function iso(annee, mois, jour) {
  const a = annee < 100 ? 2000 + annee : annee;
  const d = new Date(Date.UTC(a, mois - 1, jour));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour || a < 1990 || a > 2100) return null;
  return `${a}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// Toutes les dates d'une ligne : { iso, debut, fin }.
export function datesDansLigne(ligne) {
  const trouvees = [];
  const ajouter = (valeur, m) => valeur && trouvees.push({ iso: valeur, debut: m.index, fin: m.index + m[0].length });
  for (const m of ligne.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) ajouter(iso(+m[1], +m[2], +m[3]), m);
  for (const m of ligne.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
    if (trouvees.some((t) => m.index >= t.debut && m.index < t.fin)) continue;
    ajouter(iso(+m[3], +m[2], +m[1]), m);
  }
  const sa = sansAccents(ligne);
  for (const m of sa.matchAll(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/g)) {
    ajouter(iso(+m[3], MOIS[m[2]], +m[1]), m);
  }
  return trouvees.sort((a, b) => a.debut - b.debut);
}

const DATE_EXCLUE = /echeance|circulation|valable|validite|periode|garantie|naissance|prochain|jusqu|expir|etabli|livraison prevue|au \d/;
const DATE_INTERVENTION = /intervention|realis|ordre de reparation|\bo\.?r\.?\b|travaux|entree atelier|date de depot/;
const DATE_FACTURE = /factur|\bdate\b|\bemis|\bticket\b/;

function lireDates(lignes) {
  const candidates = [];
  lignes.forEach((ligne, i) => {
    for (const d of datesDansLigne(ligne)) {
      // Le libellé est avant la date, sur la ligne ou, si elle est presque
      // vide, sur la ligne précédente.
      let contexte = sansAccents(ligne.slice(0, d.debut));
      const lettres = (ligne.slice(0, d.debut) + ligne.slice(d.fin)).replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (lettres.length <= 12 && i > 0) contexte = `${sansAccents(lignes[i - 1])} ${contexte}`;
      candidates.push({ iso: d.iso, contexte, ligne: sansAccents(ligne) });
    }
  });
  const retenues = candidates.filter((c) => !DATE_EXCLUE.test(c.contexte.slice(-60)) && !DATE_EXCLUE.test(c.ligne.slice(0, 40)));
  const intervention = retenues.find((c) => DATE_INTERVENTION.test(c.contexte.slice(-60)));
  const autres = retenues.filter((c) => c !== intervention);
  const parFacture = autres.find((c) => /factur/.test(c.contexte.slice(-60)));
  const parDate = autres.find((c) => DATE_FACTURE.test(c.contexte.slice(-40)));
  const facture = parFacture ?? parDate ?? autres[0] ?? null;
  return {
    dateFacture: facture ? (parFacture || parDate ? lue(facture.iso) : incertaine(facture.iso)) : rien(),
    dateIntervention: intervention && intervention.iso !== facture?.iso ? lue(intervention.iso) : rien(),
  };
}

// ---------------------------------------------------------------------------
// Montants
// ---------------------------------------------------------------------------

// Montants d'une ligne (les dates retirées) : { valeur, debut }.
export function montantsDansLigne(ligne) {
  let propre = ligne;
  for (const d of datesDansLigne(ligne)) propre = propre.slice(0, d.debut) + " ".repeat(d.fin - d.debut) + propre.slice(d.fin);
  const montants = [];
  for (const m of propre.matchAll(/(?<![\d,.])(\d{1,3}(?:[ .]\d{3})+|\d+)[,.](\d{2})(?![\d%])/g)) {
    montants.push({ valeur: Number(`${m[1].replace(/[ .]/g, "")}.${m[2]}`), debut: m.index });
  }
  for (const m of propre.matchAll(/(?<![\d,.])(\d{1,6})\s*(?:€|eur\b|euros?\b)/gi)) {
    if (!montants.some((x) => x.debut <= m.index && m.index < x.debut + m[0].length + 3)) montants.push({ valeur: Number(m[1]), debut: m.index });
  }
  return montants.sort((a, b) => a.debut - b.debut);
}

const TTC_FORT = /net\s*a\s*payer|total\s*t\.?\s*t\.?\s*c|montant\s*t\.?\s*t\.?\s*c|total\s*a\s*payer|reste\s*a\s*payer|montant\s*a\s*payer/;
const TOTAL_FAIBLE = /\btotal\b/;
const PAS_UN_TOTAL_TTC = /h\.?\s*t\b|hors\s*taxe|t\.?\s*v\.?\s*a|acompte|remise|sous-total|deja regle/;

function montantApres(lignes, i, position) {
  const surLaLigne = montantsDansLigne(lignes[i]).find((m) => m.debut >= position);
  if (surLaLigne) return surLaLigne.valeur;
  const suivante = lignes[i + 1];
  if (suivante && !/[a-z]{3}/i.test(suivante.replace(/eur|€/gi, ""))) return montantsDansLigne(suivante)[0]?.valeur ?? null;
  return null;
}

function lireMontant(lignes) {
  let fort = null;
  let faible = null;
  let ht = null;
  let tva = null;
  lignes.forEach((ligne, i) => {
    const sa = sansAccents(ligne);
    const mFort = TTC_FORT.exec(sa);
    if (mFort) {
      const v = montantApres(lignes, i, mFort.index);
      if (v != null) fort = v; // le dernier total TTC du document
      return;
    }
    const mHt = /total\s*h\.?\s*t\b|montant\s*h\.?\s*t\b|total\s*hors\s*taxe/.exec(sa);
    if (mHt) ht = montantApres(lignes, i, mHt.index) ?? ht;
    const mTva = /^(?:total\s*)?t\.?\s*v\.?\s*a\b/.exec(sa);
    if (mTva) tva = montantApres(lignes, i, mTva.index) ?? tva;
    const mTotal = TOTAL_FAIBLE.exec(sa);
    if (mTotal && !PAS_UN_TOTAL_TTC.test(sa)) {
      const v = montantApres(lignes, i, mTotal.index);
      if (v != null) faible = v;
    }
  });
  if (fort != null) {
    const incoherent = ht != null && tva != null && Math.abs(ht + tva - fort) > 0.02;
    return incoherent ? incertaine(fort) : lue(fort);
  }
  if (faible != null) return incertaine(faible);
  return rien();
}

// ---------------------------------------------------------------------------
// Kilométrage
// ---------------------------------------------------------------------------

const KM_EXCLU = /garanti|prochain|dans\s|tous les|chaque|intervalle|jusqu|avant\s|recommand|conseill|assistance|valable|limite|offert|maximum|mini|^\s*a\s*$|\ba\s*$/;
const NOMBRE_KM = /(\d{1,3}(?:[ .]\d{3})+|\d{1,7})/;

function lireKilometrage(lignes) {
  const libelles = [];
  const suffixes = [];
  for (const ligne of lignes) {
    const sa = sansAccents(ligne);
    for (const m of sa.matchAll(new RegExp(`(kilometrage|kilometres?|km\\s*compteur|compteur|\\bkms?\\b)\\s*(?:releve|au compteur|actuel)?\\s*[:=]?\\s*${NOMBRE_KM.source}\\s*(?:km)?(?![\\d/])`, "g"))) {
      const avant = sa.slice(Math.max(0, m.index - 40), m.index + m[1].length + 12);
      if (KM_EXCLU.test(avant)) continue;
      libelles.push(Number(m[2].replace(/[ .]/g, "")));
    }
    for (const m of sa.matchAll(new RegExp(`${NOMBRE_KM.source}\\s*km\\b`, "g"))) {
      const avant = sa.slice(Math.max(0, m.index - 40), m.index);
      if (KM_EXCLU.test(avant) || /(kilometrage|compteur|kms?)\s*[:=]?\s*$/.test(avant)) continue;
      suffixes.push(Number(m[1].replace(/[ .]/g, "")));
    }
  }
  const plausibles = (liste) => [...new Set(liste.filter((n) => n > 0 && n <= 2000000))];
  const parLibelle = plausibles(libelles);
  if (parLibelle.length) return parLibelle.length === 1 ? lue(parLibelle[0]) : incertaine(parLibelle[0]);
  const parSuffixe = plausibles(suffixes).filter((n) => n >= 100);
  if (parSuffixe.length) return incertaine(parSuffixe[0]);
  return rien();
}

// ---------------------------------------------------------------------------
// Immatriculation
// ---------------------------------------------------------------------------

const SIV = /\b([A-HJ-NP-TV-Z]{2})[ -]?(\d{3})[ -]?([A-HJ-NP-TV-Z]{2})\b/g;
const FNI = /\b(\d{1,4})[ -]?([A-Z]{1,3})[ -]?(\d{2}|2A|2B)\b/g;

function lireImmatriculation(lignes) {
  const trouvees = [];
  for (const ligne of lignes) {
    const contexteVehicule = /immat|plaque|vehicule|\bimm\b/.test(sansAccents(ligne));
    for (const m of ligne.matchAll(SIV)) trouvees.push({ valeur: `${m[1]}${m[2]}${m[3]}`, sur: contexteVehicule });
    if (/immat|plaque/.test(sansAccents(ligne))) {
      const apres = ligne.slice(sansAccents(ligne).search(/immat|plaque/));
      for (const m of apres.matchAll(FNI)) trouvees.push({ valeur: `${m[1]}${m[2]}${m[3]}`, sur: true });
    }
  }
  const distinctes = [...new Set(trouvees.map((t) => t.valeur))];
  if (!distinctes.length) return rien();
  const premiere = trouvees.find((t) => t.sur) ?? trouvees[0];
  return distinctes.length === 1 && premiere.sur ? lue(premiere.valeur) : incertaine(premiere.valeur);
}

// ---------------------------------------------------------------------------
// Professionnel
// ---------------------------------------------------------------------------

const PAS_UN_NOM = /factur|devis|\bdate\b|siret|siren|\brcs\b|\btva\b|\btel\b|telephone|@|www\.|http|\brue\b|avenue|chemin|boulevard|impasse|\broute\b|\bzone\b|\bza\b|\bzi\b|\bquai\b|\bplace\b|cedex|\b\d{5}\b|client|vehicule|\bn°|capital|page\s*\d/;

function lireProfessionnel(lignes) {
  for (const ligne of lignes.slice(0, 8)) {
    let candidat = ligne;
    const sa = sansAccents(ligne);
    const coupure = sa.search(/factur|devis|\bdate\b/);
    if (coupure > 3) candidat = ligne.slice(0, coupure);
    candidat = candidat.replace(/\((?:fictif|fictive)\)/gi, "").replace(/[—–-]\s*$/, "").trim();
    const lettres = candidat.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (lettres.length < 3 || candidat.length > 60 || /^\d/.test(candidat)) continue;
    if (PAS_UN_NOM.test(sansAccents(candidat))) continue;
    return incertaine(candidat);
  }
  return rien();
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

const TYPES_PAR_MOTS = [
  ["controle_technique", /controle technique|contre-visite/],
  ["revision", /revision|entretien constructeur|forfait entretien|plan d'entretien/],
  ["distribution", /distribution|courroie|pompe a eau/],
  ["freinage", /frein|plaquette|disque|etrier/],
  ["pneus", /pneu|equilibrage|parallelisme|geometrie|valve|crevaison|jante/],
  ["batterie", /batterie/],
  ["climatisation", /climatisation|\bclim\b|r1234|r134/],
  ["vidange", /vidange|huile moteur|filtre a huile/],
  ["carrosserie", /carrosserie|pare-brise|parebrise|vitrage|peinture|rayure|bosse|retrovis/],
  ["lavage", /lavage|nettoyage|detailing|aspiration|lustrage|polissage|renovation des optiques/],
];

export function typeParMots(libelle) {
  const sa = sansAccents(libelle);
  return TYPES_PAR_MOTS.find(([, motif]) => motif.test(sa))?.[0] ?? "autre";
}

const PAS_UNE_OPERATION =
  /total|t\.?\s*v\.?\s*a|net a payer|montant|remise|acompte|sous-total|report|\bdont\b|regle|paiement|\bcb\b|especes|cheque|client|^vehicule|vehicule\s*(assure\s*)?:|immat|kilom|factur|devis|\bdate\b|siret|capital|iban|\bbic\b|garantie|conditions|penalit|designation|libelle|\bqte\b|prix unitaire|merci|jeton/;

function libelleOperation(ligne) {
  return ligne
    .replace(/(\s+[-]?\d[\d\s.,]*\s*(?:€|eur|euros?|ht|ttc|%|x)?)+\s*$/i, "")
    .replace(/^(?=[A-Z0-9-]*[\d-])[A-Z0-9][A-Z0-9-]{2,}\s+(?=[A-Za-zÀ-ÿ])/, "")
    .replace(/\s*[—–-]\s*$/, "")
    .trim();
}

function lireOperations(lignes) {
  const brutes = [];
  lignes.forEach((ligne, i) => {
    const sa = sansAccents(ligne);
    if (PAS_UNE_OPERATION.test(sa) || !montantsDansLigne(ligne).length) return;
    let libelle = libelleOperation(ligne);
    // Montant seul sur sa ligne : le libellé est juste au-dessus.
    if (libelle.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 4 && i > 0 && !montantsDansLigne(lignes[i - 1]).length && !PAS_UNE_OPERATION.test(sansAccents(lignes[i - 1]))) {
      libelle = lignes[i - 1];
    }
    if (libelle.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 4) return;
    brutes.push({ libelle: libelle.slice(0, 120), type: typeParMots(libelle) });
  });
  // Pièces et main-d'œuvre d'une même opération : lignes voisines de même type.
  const regroupees = [];
  for (const op of brutes) {
    const precedente = regroupees[regroupees.length - 1];
    if (precedente && op.type !== "autre" && precedente.type === op.type) {
      precedente.libelle = `${precedente.libelle}, ${op.libelle}`.slice(0, 120);
    } else {
      regroupees.push({ ...op });
    }
  }
  return regroupees.slice(0, 30).map((o) => ({ ...o, certitude: o.type === "autre" ? "incertaine" : "lue" }));
}

// ---------------------------------------------------------------------------
// Ensemble
// ---------------------------------------------------------------------------

function estFacture(lignes, montant) {
  const texte = sansAccents(lignes.join("\n"));
  const facture = /\bfactur|\bticket\b|\brecu\b|note d'honoraires/.test(texte);
  const devis = /\bdevis\b|bon pour accord|valable \d+ jours/.test(texte);
  const attestation = /attestation|certificat|proces-verbal|carte grise/.test(texte);
  const encaissement = /merci de votre visite|paiement|\bcb\b|especes|\bregle\b/.test(texte);
  if (devis && !facture) return false;
  if (attestation && !facture && montant.valeur == null) return false;
  return facture || (montant.valeur != null && encaissement);
}

// pages : le texte de chaque page. Rend l'objet au format SCHEMA_PROPOSITION.
export function lireTexteFacture(pages) {
  const lignes = lignesDe(Array.isArray(pages) ? pages : [String(pages ?? "")]);
  const { dateFacture, dateIntervention } = lireDates(lignes);
  const montant = lireMontant(lignes);
  return {
    est_facture_vehicule: estFacture(lignes, montant),
    date_facture: dateFacture,
    date_intervention: dateIntervention,
    professionnel: lireProfessionnel(lignes),
    immatriculation: lireImmatriculation(lignes),
    kilometrage: lireKilometrage(lignes),
    montant_ttc: montant,
    operations: lireOperations(lignes),
  };
}
