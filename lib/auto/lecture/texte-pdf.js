// Fournisseur de lecture GRATUIT : le texte contenu dans le PDF, lu sur le
// serveur (bibliothèque libre unpdf), puis les règles de lib/auto/lecture/regles.js.
//
// Rien ne sort de Nexora, rien n'est facturé. Même interface que tout
// fournisseur (voir anthropic.js). Limites : PDF seulement ; un PDF scanné
// (image sans texte) n'est pas lu.
//
// Contenu non fiable : le nombre de pages est revérifié une fois le PDF
// ouvert (le décompte fait avant, sur le fichier brut, peut être trompé), et
// l'extraction est interrompue au-delà d'un délai. Aucun texte lu n'est
// journalisé.

import { ErreurLecture } from "./anthropic.js";
import { VERSION_REGLES, lireTexteFacture } from "./regles.js";

export const PAGES_MAX_TEXTE = 4;
export const DELAI_EXTRACTION_MS = 15000;

export class TropDePages extends Error {}

// Texte par page d'un PDF. Injectable pour les tests.
async function extraireAvecUnpdf(octets, { pagesMax = PAGES_MAX_TEXTE } = {}) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(octets);
  if (pdf.numPages > pagesMax) throw new TropDePages();
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

function avecDelai(promesse, delaiMs) {
  let minuterie;
  const delai = new Promise((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new ErreurLecture("delai_depasse", { facturation: "non_facturee" })), delaiMs);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuterie));
}

export function creerFournisseurTextePdf({ extraire = extraireAvecUnpdf, maintenant = () => Date.now(), pagesMax = PAGES_MAX_TEXTE, delaiMs = DELAI_EXTRACTION_MS } = {}) {
  return {
    nom: "texte_pdf",
    modele: VERSION_REGLES,
    gratuit: true,

    async compterJetons() {
      return { jetonsEntree: 0 };
    },

    async lire({ typeMime, base64 }) {
      if (typeMime !== "application/pdf") throw new ErreurLecture("format_non_lu", { facturation: "non_facturee" });
      const debut = maintenant();
      let pages;
      try {
        pages = await avecDelai(extraire(new Uint8Array(Buffer.from(base64, "base64")), { pagesMax }), delaiMs);
      } catch (e) {
        if (e instanceof ErreurLecture) throw e;
        if (e instanceof TropDePages) throw new ErreurLecture("pdf_trop_long", { facturation: "non_facturee" });
        throw new ErreurLecture("pdf_illisible", { facturation: "non_facturee" });
      }
      if (!Array.isArray(pages) || pages.join("").replace(/\s/g, "").length < 30) {
        throw new ErreurLecture("pdf_sans_texte", { facturation: "non_facturee" });
      }
      return { brut: lireTexteFacture(pages), usage: null, dureeMs: maintenant() - debut };
    },
  };
}
