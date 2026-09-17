// Corpus de CONTRÔLE : factures fictives d'une autre mise en page, écrites
// AVANT les règles de lecture gratuite et jamais utilisées pour les régler.
// Elles mesurent la lecture sur des documents qu'elle n'a pas « vus ».
//
//   node scripts/recette/factures/corpus-controle.mjs [dossier de sortie]
//
// Pièges volontaires : date écrite en toutes lettres, date au format 12.06.2026,
// kilométrage de prochaine vidange ou de garantie, date de mise en
// circulation, total sur la ligne suivante, montant sans mention TTC, devis
// (pas une facture), PDF scanné sans texte, ancienne plaque (FNI).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sortie = process.argv[2] || join(tmpdir(), "nexora-factures-controle");
mkdirSync(sortie, { recursive: true });

const STYLE = `
  @page { size: A4; margin: 12mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #222; font-size: 10.5pt; }
  .bandeau { background: #0d3b66; color: #fff; padding: 10px 14px; }
  .bandeau h1 { margin: 0; font-size: 15pt; letter-spacing: 1px; }
  .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
  .cadre { border: 1px solid #999; padding: 8px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 5px; border: 1px solid #bbb; }
  .droite { text-align: right; }
  .pile { width: 40%; margin: 10px 0 0 auto; }
  .pile div { padding: 3px 0; }
  .mention { position: fixed; bottom: 3mm; width: 100%; text-align: center; font-size: 7.5pt; color: #a33; }
`;
const mention = `<div class="mention">DOCUMENT FICTIF — RECETTE NEXORA — AUCUNE VALEUR</div>`;

const documents = [
  {
    fichier: "C01.pdf",
    html: `<div class="bandeau"><h1>SARL MÉCA PLUS</h1>Réparation toutes marques — 4 chemin du Test, 00010 Villefictive — RCS fictif</div>
      <div class="grille"><div class="cadre"><b>FACTURE N° 2026/118</b><br>Le 15 janvier 2026</div>
      <div class="cadre">Immat. : FT-208-KL<br>Km compteur : 88 450<br>Peugeot 308 HDi</div></div>
      <table><tr><th>Réf.</th><th>Libellé</th><th class="droite">Montant HT</th></tr>
      <tr><td>MO-DIS</td><td>REMPLACEMENT COURROIE DE DISTRIBUTION + POMPE A EAU</td><td class="droite">310,00</td></tr>
      <tr><td>KIT-4471</td><td>KIT DISTRIBUTION AVEC POMPE</td><td class="droite">308,50</td></tr></table>
      <p>Prochaine vidange à 98 450 km.</p>
      <div class="pile"><div>TOTAL H.T. 618,50</div><div>T.V.A. 20% 123,70</div><div><b>NET A PAYER TTC 742,20</b></div></div>${mention}`,
    attendu: { estFacture: true, dateFacture: "2026-01-15", dateIntervention: null, professionnel: "SARL MÉCA PLUS", immatriculation: "FT208KL", kilometrage: 88450, montantTtc: 742.2, typePrincipal: "distribution" },
  },
  {
    fichier: "C02.pdf",
    html: `<div class="bandeau"><h1>Concession Horizon Fictif</h1>Service après-vente</div>
      <div class="grille"><div class="cadre">Date facture : 12.06.2026<br>Date d'intervention : 10.06.2026<br>N° 88-771</div>
      <div class="cadre">Véhicule : Citroën C3 — CN 482 PB<br>Kilométrage : 64 120<br>Kilométrage garanti : 100 000 km</div></div>
      <table><tr><th>Désignation</th><th class="droite">Prix TTC</th></tr>
      <tr><td>Forfait vidange Premium (huile + filtre)</td><td class="droite">149,00 €</td></tr>
      <tr><td>Contrôle 30 points de sécurité</td><td class="droite">70,00 €</td></tr></table>
      <p>Révision recommandée dans 10 000 km.</p>
      <p><b>Montant TTC : 219,00 €</b> dont TVA 36,50 €</p>${mention}`,
    attendu: { estFacture: true, dateFacture: "2026-06-12", dateIntervention: "2026-06-10", professionnel: "Concession Horizon Fictif", immatriculation: "CN482PB", kilometrage: 64120, montantTtc: 219, typePrincipal: "vidange" },
  },
  {
    fichier: "C03.pdf",
    html: `<div style="display:flex;justify-content:space-between"><div><h2 style="margin:0">Vitrage Express Fictif</h2><small>Pare-brise et vitrages</small></div><div>Facture VE-2026-0310<br>Date : 2026-03-03</div></div>
      <p>Véhicule : Toyota Yaris — GA-771-QR</p>
      <table><tr><td>Remplacement pare-brise athermique</td><td class="droite">780,00 €</td></tr>
      <tr><td>Calibrage caméra d'aide à la conduite</td><td class="droite">224,00 €</td></tr></table>
      <div style="margin-top:14px;display:flex;flex-direction:column;align-items:flex-end"><div>Total HT</div><div>1 004,00 €</div><div>TVA (20 %)</div><div>200,80 €</div><div><b>Total TTC</b></div><div><b>1 204,80 €</b></div></div>${mention}`,
    attendu: { estFacture: true, dateFacture: "2026-03-03", dateIntervention: null, professionnel: "Vitrage Express Fictif", immatriculation: "GA771QR", kilometrage: null, montantTtc: 1204.8, typePrincipal: "carrosserie" },
  },
  {
    fichier: "C04.pdf",
    html: `<div class="bandeau"><h1>ATELIER DU PONT (fictif)</h1></div>
      <h2>DEVIS N° D-5521</h2><p>Établi le 20/08/2026 — valable 30 jours</p>
      <p>Véhicule : Renault Mégane — EF-334-GH — 101 300 km</p>
      <table><tr><td>Remplacement embrayage</td><td class="droite">380,00 € HT</td></tr></table>
      <p>Total TTC 456,00 €</p><p>Bon pour accord : ______</p>${mention}`,
    attendu: { estFacture: false },
  },
  {
    fichier: "C05.pdf",
    ticket: true,
    html: `<div style="width:70mm;font-family:monospace;font-size:10pt">LAVAGE AUTO JET 3000<br>Station fictive — Zone du Test<br>================<br>02-08-2026 14:12<br>Programme Prestige<br>&nbsp;&nbsp;18,00 EUR<br>================<br>TOTAL 18,00 EUR<br>Paiement jeton<br>Merci de votre visite</div>${mention}`,
    attendu: { estFacture: true, dateFacture: "2026-08-02", dateIntervention: null, professionnel: "LAVAGE AUTO JET 3000", immatriculation: null, kilometrage: null, montantTtc: 18, typePrincipal: "lavage" },
  },
  {
    fichier: "C07.pdf",
    html: `<table style="border:none"><tr><td style="border:none"><b>Garage Central Fictif</b><br>SIRET 000 000 099 00019</td><td style="border:none" class="droite">Facture n° GC-7741<br>Date : 31/10/2025<br>Date d'échéance : 30/11/2025</td></tr></table>
      <div class="cadre" style="margin:10px 0">Immatriculation : 4521-TZ-44 — Véhicule mis en circulation le 12/05/2017 — Kms : 132 800</div>
      <table><tr><th>Travaux</th><th>Qté</th><th class="droite">Total HT</th></tr>
      <tr><td>Plaquettes de frein AR</td><td>1</td><td class="droite">118,25</td></tr>
      <tr><td>Purge et liquide de frein DOT4</td><td>1</td><td class="droite">123,33</td></tr></table>
      <div class="pile"><div>Total HT : 241,58</div><div>TVA 20 % : 48,32</div><div><b>Total TTC : 289,90</b></div></div>${mention}`,
    attendu: { estFacture: true, dateFacture: "2025-10-31", dateIntervention: null, professionnel: "Garage Central Fictif", immatriculation: "4521TZ44", kilometrage: 132800, montantTtc: 289.9, typePrincipal: "freinage" },
  },
];

const attendus = [];
for (const d of documents) {
  const html = join(sortie, d.fichier.replace(".pdf", ".html"));
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${STYLE}</style>${d.html}`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${join(sortie, d.fichier)}`, `file://${html}`], { stdio: "ignore" });
  attendus.push({ fichier: d.fichier, ...d.attendu });
}

// C06 : la facture C01 scannée — un PDF qui ne contient qu'une image.
const capture = join(sortie, "C06-capture.png");
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${capture}`, "--window-size=1240,1754", `file://${join(sortie, "C01.html")}`], { stdio: "ignore" });
execFileSync("python3", ["-c", `from PIL import Image; Image.open(${JSON.stringify(capture)}).convert("RGB").save(${JSON.stringify(join(sortie, "C06.pdf"))}, "PDF", resolution=150)`]);
attendus.push({ fichier: "C06.pdf", scan: true, estFacture: true, dateFacture: "2026-01-15", montantTtc: 742.2 });

writeFileSync(join(sortie, "attendus.json"), JSON.stringify(attendus, null, 2));
console.log(`${attendus.length} documents de contrôle dans ${sortie}`);
