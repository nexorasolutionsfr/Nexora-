// Lecture de VRAIES factures, sans rien déposer nulle part — sur ce Mac seulement.
//
//   node scripts/recette/factures/lecture-locale.mjs <dossier> [--details]
//
// Le dossier contient les PDF et `attendus.json` (ce qu'une lecture correcte
// doit proposer, au format de scripts/recette/factures/corpus.mjs). Chaque PDF
// suit le MÊME chemin que la route de lecture (lib/auto/lecture/service.js) :
// contenu vérifié, pages comptées, limites, lecture gratuite du texte (unpdf,
// lib/auto/lecture/texte-pdf.js), normalisation de la proposition — mais sans
// compte, sans base, sans stockage : aucun appel réseau n'est fait, le fichier
// ne quitte pas cette machine. Aucun service de lecture extérieur n'est appelé
// (la lecture payante n'est pas chargée ici).
//
// Ce que ce mode ne mesure pas : le dépôt, la vérification côté serveur hébergé
// et l'écran de confirmation. Pour cela : lecture-essai.mjs (base Test).
//
// Par défaut, AUCUNE valeur lue n'est affichée : seulement les classes par
// champ. `--details` les affiche. Le rapport complet (valeurs comprises) est
// écrit dans le dossier lui-même : rapport-lecture-locale.json.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import { creerFournisseurTextePdf } from "../../../lib/auto/lecture/texte-pdf.js";
import { normaliserProposition } from "../../../lib/auto/lecture/proposition.js";
import { compterPagesPdf, lisibleAutomatiquement } from "../../../lib/auto/lecture/limites.js";
import { verifierContenu } from "../../../lib/auto/documents.js";

const [dossier, ...options] = process.argv.slice(2);
const details = options.includes("--details");
if (!dossier) {
  console.error("Usage : node scripts/recette/factures/lecture-locale.mjs <dossier> [--details]");
  process.exit(1);
}

// Même comparaison que lecture-essai.mjs.
const normaliserTexte = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const CHAMPS = [
  ["dateFacture", (a, b) => a === b],
  ["dateIntervention", (a, b) => a === b],
  ["professionnel", (a, b) => normaliserTexte(b).includes(normaliserTexte(a)) || normaliserTexte(a).includes(normaliserTexte(b))],
  ["immatriculation", (a, b) => a === b],
  ["kilometrage", (a, b) => a === b],
  ["montantTtc", (a, b) => Math.round(a * 100) === Math.round(b * 100)],
];

const attendus = JSON.parse(readFileSync(join(dossier, "attendus.json"), "utf8"));
const presents = new Set(readdirSync(dossier).filter((f) => extname(f).toLowerCase() === ".pdf"));
const lecteur = creerFournisseurTextePdf();
const aujourdhui = new Date().toISOString().slice(0, 10);
const bilan = { documents: 0, proposes: 0, nonLus: [], nonFactures: [], classes: {} };
const rapport = [];

for (const attendu of attendus) {
  if (!presents.has(attendu.fichier)) {
    console.error(`Absent du dossier : ${attendu.fichier}`);
    continue;
  }
  bilan.documents += 1;
  const octets = new Uint8Array(readFileSync(join(dossier, attendu.fichier)));
  const ligne = { fichier: attendu.fichier, etat: null, champs: {} };
  const contenu = verifierContenu(octets.subarray(0, 1024), "application/pdf");
  const pages = compterPagesPdf(octets);
  const lisible = lisibleAutomatiquement({ typeMime: "application/pdf", taille: octets.byteLength, pages, formats: ["application/pdf"] });
  if (!contenu.valide || contenu.typeMime !== "application/pdf") ligne.etat = "illisible : contenu";
  else if (!lisible.lisible) ligne.etat = `non lu : ${lisible.raison}`;
  else {
    try {
      const { brut } = await lecteur.lire({ typeMime: "application/pdf", base64: Buffer.from(octets).toString("base64") });
      const proposition = normaliserProposition(brut, { aujourdhui });
      ligne.etat = "propose";
      bilan.proposes += 1;
      // Un document qui n'est pas une facture (un devis…) : on vérifie qu'il est
      // reconnu comme tel, pas ses champs — même règle que lecture-essai.mjs.
      if (attendu.estFacture === false) {
        ligne.etat = proposition.estFacture === false ? "pas une facture : reconnu" : "pas une facture : NON reconnu";
        bilan.nonFactures.push(`${attendu.fichier} — ${ligne.etat}`);
        rapport.push(ligne);
        console.log(`${attendu.fichier} — ${ligne.etat}`);
        continue;
      }
      for (const [nom, egal] of CHAMPS) {
        const lu = proposition.champs?.[nom] ?? { valeur: null };
        const valeurAttendue = attendu[nom] ?? null;
        const issue = valeurAttendue == null
          ? (lu.valeur == null ? "absence_correcte" : "invente")
          : (lu.valeur == null ? "manque" : (egal(valeurAttendue, lu.valeur) ? "extrait" : "errone"));
        bilan.classes[issue] = (bilan.classes[issue] ?? 0) + 1;
        ligne.champs[nom] = { issue, lu: lu.valeur ?? null, attendu: valeurAttendue, certitude: lu.certitude ?? null };
      }
    } catch (e) {
      ligne.etat = `non lu : ${e?.code ?? "erreur"}`;
    }
  }
  if (ligne.etat !== "propose") bilan.nonLus.push(`${attendu.fichier} — ${ligne.etat}`);
  rapport.push(ligne);
  const resume = Object.entries(ligne.champs).map(([nom, c]) => `${nom}:${c.issue}${details ? `(${JSON.stringify(c.lu)})` : ""}`).join("  ");
  console.log(`${attendu.fichier} — ${ligne.etat}${resume ? `\n    ${resume}` : ""}`);
}

writeFileSync(join(dossier, "rapport-lecture-locale.json"), JSON.stringify({ quand: new Date().toISOString(), bilan, rapport }, null, 2));
console.log(`\n${bilan.proposes}/${bilan.documents} document(s) lus ; classes : ${JSON.stringify(bilan.classes)}`);
if (bilan.nonLus.length) console.log(`Non lus :\n  ${bilan.nonLus.join("\n  ")}`);
if (bilan.nonFactures.length) console.log(`Pas des factures :\n  ${bilan.nonFactures.join("\n  ")}`);
console.log(`Rapport (valeurs comprises) : ${join(dossier, "rapport-lecture-locale.json")} — sur ce Mac seulement.`);
