// Fournisseur de lecture GRATUIT : le texte contenu dans le PDF, lu sur le
// serveur (bibliothèque libre unpdf), puis les règles de lib/auto/lecture/regles.js.
//
// Rien ne sort de Nexora, rien n'est facturé. Même interface que tout
// fournisseur (voir anthropic.js). Limites : PDF seulement ; un PDF scanné
// (image sans texte) n'est pas lu.

import { ErreurLecture } from "./anthropic.js";
import { VERSION_REGLES, lireTexteFacture } from "./regles.js";

// Texte par page d'un PDF. Injectable pour les tests.
async function extraireAvecUnpdf(octets) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(octets);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

export function creerFournisseurTextePdf({ extraire = extraireAvecUnpdf, maintenant = () => Date.now() } = {}) {
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
        pages = await extraire(new Uint8Array(Buffer.from(base64, "base64")));
      } catch {
        throw new ErreurLecture("pdf_illisible", { facturation: "non_facturee" });
      }
      if (!Array.isArray(pages) || pages.join("").replace(/\s/g, "").length < 30) {
        throw new ErreurLecture("pdf_sans_texte", { facturation: "non_facturee" });
      }
      return { brut: lireTexteFacture(pages), usage: null, dureeMs: maintenant() - debut };
    },
  };
}
