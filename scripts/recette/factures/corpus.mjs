// Corpus de factures FICTIVES pour la recette de la lecture automatique.
//
//   node scripts/recette/factures/corpus.mjs [dossier de sortie]
//
// Produit 13 documents (PDF, photos, ticket, un document qui n'est pas une
// facture) et `attendus.json`, les valeurs qu'une lecture correcte doit
// proposer. Tout est inventé : professionnels, adresses, SIRET, client. Chaque
// document porte la mention « DOCUMENT FICTIF — RECETTE NEXORA ».
//
// Rendu : Google Chrome sans interface (PDF et captures), puis photo.py
// (Pillow) pour les photos abîmées. Les fichiers produits ne vont pas dans le
// dépôt.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sortie = process.argv[2] || join(tmpdir(), "nexora-factures-fictives");
mkdirSync(sortie, { recursive: true });

const euros = (n) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
const dateFr = (iso) => iso.split("-").reverse().join("/");
const km = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const PRO = {
  tilleuls: { nom: "Garage des Tilleuls", adresse: "12 rue des Tilleuls, 00000 Recetteville", siret: "SIRET 000 000 001 00011 (fictif)" },
  atlantique: { nom: "Auto Atlantique Services", adresse: "3 boulevard de l'Essai, 00001 Portfictif", siret: "SIRET 000 000 002 00012 (fictif)" },
  rondpoint: { nom: "Centre Auto du Rond-Point", adresse: "ZA du Rond-Point, 00002 Simulé-sur-Loire", siret: "SIRET 000 000 003 00013 (fictif)" },
  pneus: { nom: "Pneus Service Ouest", adresse: "8 impasse des Gommes, 00003 Exempleville", siret: "SIRET 000 000 004 00014 (fictif)" },
  domicile: { nom: "Méca'Domicile 44", adresse: "Intervention à domicile — 00004 Nulle-Part", siret: "SIRET 000 000 005 00015 (fictif)" },
  ct: { nom: "Contrôle Technique des Marais", adresse: "1 route des Marais, 00005 Testbourg", siret: "Agrément fictif S00X000 — SIRET 000 000 006 00016 (fictif)" },
  detailing: { nom: "Éclat Detailing", adresse: "22 quai du Lustre, 00006 Recetteville", siret: "SIRET 000 000 007 00017 (fictif)" },
  express: { nom: "Express Vidange Nord", adresse: "Rocade Nord, 00007 Démoville", siret: "SIRET 000 000 008 00018 (fictif)" },
};

const CLIENT = "Client : M. Client Fictif — 1 rue de la Recette, 00000 Recetteville";

// lignes : [désignation, quantité, prix unitaire HT]
const FACTURES = [
  {
    code: "F01", pro: PRO.tilleuls, numero: "FA-2026-0142", date: "2026-02-10", immat: "GH-456-JK", vehicule: "Renault Clio V 1.5 Blue dCi", km: 55800,
    lignes: [["Vidange huile moteur (main-d'œuvre)", 1, 35], ["Huile moteur 5W30 — 4,5 L", 1, 38.25], ["Filtre à huile", 1, 14], ["Joint de bouchon de vidange", 1, 2.5]],
    attendu: { typePrincipal: "vidange", types: ["vidange"] },
  },
  {
    code: "F02", pro: PRO.atlantique, numero: "2026-06-00871", date: "2026-06-18", immat: "GH-456-JK", vehicule: "Renault Clio V", km: 59950,
    lignes: [["Révision constructeur 60 000 km (forfait)", 1, 249], ["Balais d'essuie-glace avant", 1, 32.5]],
    attendu: { typePrincipal: "revision", types: ["revision", "autre"] },
  },
  {
    code: "F03", pro: PRO.rondpoint, numero: "CA-25-11-3390", date: "2025-11-22", immat: "GH-456-JK", vehicule: "Renault Clio V", km: 49300,
    lignes: [["Plaquettes de frein avant", 1, 64.9], ["Disques de frein avant", 2, 59.9], ["Main-d'œuvre freinage avant", 1, 72], ["Vidange + filtre à huile", 1, 79]],
    attendu: { typePrincipal: "freinage", types: ["freinage", "vidange"] },
  },
  {
    code: "F04", pro: PRO.pneus, numero: "PSO-0412", date: "2026-04-03", dateIntervention: "2026-03-30", deuxPages: true, immat: "GH-456-JK", vehicule: "Renault Clio V", km: 57100,
    lignes: [["Pneu 185/65 R15 88H été", 2, 79], ["Montage et équilibrage", 2, 18], ["Contrôle et réglage du parallélisme", 1, 59]],
    attendu: { typePrincipal: "pneus", types: ["pneus", "autre", "reparation"] },
  },
  {
    code: "F05", pro: PRO.tilleuls, numero: "FA-2026-0033", date: "2026-01-15", immat: "GH-456-JK", vehicule: "Renault Clio V", km: null,
    lignes: [["Batterie 12 V 70 Ah EFB", 1, 139], ["Pose et test du circuit de charge", 1, 25]],
    attendu: { typePrincipal: "batterie", types: ["batterie", "autre", "reparation"] },
  },
  {
    code: "F06", pro: PRO.domicile, numero: "MD-2026-118", date: "2026-07-02", immat: "GH-456-JK", vehicule: "Renault Clio V", km: 60400,
    lignes: [["Recharge climatisation R1234yf et contrôle d'étanchéité", 1, 75], ["Frais de déplacement", 1, 15]],
    attendu: { typePrincipal: "climatisation", types: ["climatisation", "autre"] },
  },
  {
    code: "F07", pro: PRO.ct, numero: "CTM-25-04-0562", date: "2025-04-30", immat: "GH-456-JK", vehicule: "Renault Clio V", km: 38214,
    lignes: [["Contrôle technique périodique véhicule léger", 1, 65]],
    attendu: { typePrincipal: "controle_technique", types: ["controle_technique"] },
  },
  {
    code: "F08", pro: PRO.detailing, numero: "ED-0805", date: "2026-08-05", immat: "GH-456-JK", vehicule: "Renault Clio V", km: null,
    lignes: [["Lavage intérieur et extérieur complet", 1, 90], ["Rénovation des optiques avant", 1, 34.17]],
    attendu: { typePrincipal: "lavage", types: ["lavage", "carrosserie", "autre"] },
  },
  {
    code: "F11", pro: PRO.express, numero: "T-240502-17", date: "2024-05-02", immat: "GH-456-JK", vehicule: "Clio", km: 31000, ticket: true,
    lignes: [["Vidange express 5W40", 1, 66.58]],
    attendu: { typePrincipal: "vidange", types: ["vidange"] },
  },
  {
    code: "F12", pro: PRO.tilleuls, numero: "FA-2026-0391", date: "2026-05-20", immat: "AB-123-CD", vehicule: "Peugeot 208", km: 58700,
    lignes: [["Pneu 4 saisons 195/55 R16", 2, 125], ["Montage, équilibrage, valves", 1, 41.67]],
    attendu: { typePrincipal: "pneus", types: ["pneus", "autre"] },
  },
];

function totaux(lignes) {
  const ht = Math.round(lignes.reduce((s, [, q, pu]) => s + q * pu, 0) * 100) / 100;
  const tva = Math.round(ht * 20) / 100;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

const STYLE = `
  @page { size: A4; margin: 16mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1c2430; font-size: 11pt; }
  .entete { display: flex; justify-content: space-between; border-bottom: 2px solid #1c2430; padding-bottom: 8px; }
  .pro { font-size: 17pt; font-weight: bold; }
  .petit { font-size: 9pt; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th, td { border-bottom: 1px solid #ccd; padding: 6px 4px; text-align: left; }
  td.n, th.n { text-align: right; }
  .totaux { margin-top: 10px; margin-left: auto; width: 45%; }
  .totaux td { border: none; padding: 3px 4px; }
  .ttc td { font-weight: bold; font-size: 13pt; border-top: 2px solid #1c2430; }
  .fictif { position: fixed; bottom: 4mm; left: 0; right: 0; text-align: center; font-size: 8pt; color: #b33; letter-spacing: 1px; }
  .saut { page-break-before: always; }
  .ticket { width: 76mm; font-family: "Courier New", monospace; font-size: 10pt; }
`;

function html(f) {
  const t = totaux(f.lignes);
  const vehicule = `Véhicule : ${f.vehicule} — Immatriculation ${f.immat}${f.km != null ? ` — Kilométrage : ${km(f.km)} km` : ""}`;
  const lignes = f.lignes.map(([d, q, pu]) => `<tr><td>${d}</td><td class="n">${q}</td><td class="n">${euros(pu)}</td><td class="n">${euros(q * pu)}</td></tr>`).join("");
  if (f.ticket) {
    return `<!doctype html><meta charset="utf-8"><style>${STYLE} body{margin:6mm}</style><div class="ticket">
      <b>${f.pro.nom.toUpperCase()}</b><br>${f.pro.adresse}<br>${f.pro.siret}<br>--------------------------------<br>
      TICKET ${f.numero}<br>LE ${dateFr(f.date)} 10:42<br>${f.vehicule.toUpperCase()} ${f.immat}<br>KM ${km(f.km)}<br>--------------------------------<br>
      ${f.lignes.map(([d, q, pu]) => `${d}<br>&nbsp;&nbsp;${q} x ${euros(pu)} HT`).join("<br>")}<br>--------------------------------<br>
      TOTAL HT ${euros(t.ht)}<br>TVA 20% ${euros(t.tva)}<br><b>TOTAL TTC ${euros(t.ttc)}</b><br>CB ${euros(t.ttc)}<br>--------------------------------<br>
      <span style="color:#b33">DOCUMENT FICTIF — RECETTE NEXORA</span></div>`;
  }
  const dates = f.dateIntervention
    ? `Ordre de réparation du ${dateFr(f.dateIntervention)}<br><b>Facture ${f.numero} du ${dateFr(f.date)}</b>`
    : `<b>Facture ${f.numero}</b><br>Date : ${dateFr(f.date)}`;
  const conditions = `<p class="petit">Conditions : paiement à réception. Pénalités de retard au taux légal. Garantie pièces et main-d'œuvre 12 mois ou 20 000 km. Prochain entretien conseillé : consulter le carnet du constructeur.</p>`;
  return `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
    <div class="entete"><div><div class="pro">${f.pro.nom}</div><div class="petit">${f.pro.adresse}<br>${f.pro.siret}</div></div><div style="text-align:right">${dates}</div></div>
    <p>${CLIENT}<br>${vehicule}</p>
    <table><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU HT</th><th class="n">Total HT</th></tr></thead><tbody>${lignes}</tbody></table>
    ${f.deuxPages ? `<p class="petit">Détail des travaux en page 2.</p><div class="saut"></div><p class="petit">Suite de la facture ${f.numero}</p>` : ""}
    <table class="totaux"><tr><td>Total HT</td><td class="n">${euros(t.ht)}</td></tr><tr><td>TVA 20 %</td><td class="n">${euros(t.tva)}</td></tr><tr class="ttc"><td>Total TTC</td><td class="n">${euros(t.ttc)}</td></tr></table>
    ${conditions}
    <div class="fictif">DOCUMENT FICTIF — RECETTE NEXORA — AUCUNE VALEUR</div>`;
}

const HTML_ATTESTATION = `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>
  <div class="entete"><div><div class="pro">Assurances Fictives Mutuelles</div><div class="petit">Siège : 5 avenue de l'Exemple, 00008 Nulle-Ville</div></div><div style="text-align:right"><b>Attestation d'assurance</b><br>Période du 01/01/2026 au 31/12/2026</div></div>
  <p>${CLIENT}</p><p>Véhicule assuré : Renault Clio V — GH-456-JK<br>Contrat n° AFM-000000 — Formule tous risques</p>
  <p>Assistance 0 km : 00 00 00 00 00 (numéro fictif)</p>
  <div class="fictif">DOCUMENT FICTIF — RECETTE NEXORA — AUCUNE VALEUR</div>`;

function chrome(args) {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--hide-scrollbars", ...args], { stdio: "ignore" });
}

const attendus = [];
for (const f of FACTURES) {
  const fichierHtml = join(sortie, `${f.code}.html`);
  writeFileSync(fichierHtml, f.ticket ? html(f) : html(f));
  const t = totaux(f.lignes);
  const commun = {
    dateFacture: f.date,
    dateIntervention: f.dateIntervention ?? null,
    professionnel: f.pro.nom,
    immatriculation: f.immat.replace(/-/g, ""),
    kilometrage: f.km,
    montantTtc: t.ttc,
    estFacture: true,
    ...f.attendu,
  };
  if (f.ticket) {
    chrome([`--screenshot=${join(sortie, `${f.code}-capture.png`)}`, "--window-size=420,900", `file://${fichierHtml}`]);
    attendus.push({ fichier: `${f.code}-photo.jpg`, source: `${f.code}-capture.png`, photo: "ticket", ...commun });
    continue;
  }
  chrome([`--print-to-pdf=${join(sortie, `${f.code}.pdf`)}`, `file://${fichierHtml}`]);
  attendus.push({ fichier: `${f.code}.pdf`, ...commun });
  if (f.code === "F03" || f.code === "F01") {
    chrome([`--screenshot=${join(sortie, `${f.code}-capture.png`)}`, "--window-size=1240,1600", `file://${fichierHtml}`]);
    attendus.push({ fichier: f.code === "F03" ? "F09-photo.jpg" : "F10-photo.jpg", source: `${f.code}-capture.png`, photo: f.code === "F03" ? "inclinee" : "terne", ...commun });
  }
}

writeFileSync(join(sortie, "ATTESTATION.html"), HTML_ATTESTATION);
chrome([`--print-to-pdf=${join(sortie, "F13.pdf")}`, `file://${join(sortie, "ATTESTATION.html")}`]);
attendus.push({ fichier: "F13.pdf", estFacture: false, dateFacture: null, dateIntervention: null, professionnel: null, immatriculation: "GH456JK", kilometrage: null, montantTtc: null, typePrincipal: null, types: [] });

for (const a of attendus.filter((x) => x.photo)) {
  execFileSync("python3", [new URL("./photo.py", import.meta.url).pathname, join(sortie, a.source), join(sortie, a.fichier), a.photo], { stdio: "inherit" });
}

writeFileSync(join(sortie, "attendus.json"), JSON.stringify(attendus, null, 2));
console.log(`${attendus.length} documents fictifs dans ${sortie}`);
