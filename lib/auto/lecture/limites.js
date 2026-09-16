// Limites de la lecture automatique : ce qui peut partir chez le fournisseur,
// combien de fois, et pour quel coût au plus. Au-delà, la facture reste
// conservée et se renseigne à la main.
//
// Pur et testé (limites.test.js).

export const LIMITES_LECTURE = {
  tailleMaxOctets: 5 * 1024 * 1024,
  pagesMax: 4,
  // PDF dont le nombre de pages ne se lit pas : accepté seulement s'il est léger.
  tailleMaxPagesInconnues: 1.5 * 1024 * 1024,
  jetonsEntreeMax: 25000,
  jetonsSortieMax: 1500,
  tentativesParDocument: 2,
  lecturesParCompte24h: 10,
  delaiMs: 45000,
};

// Formats que le fournisseur lit. HEIC/HEIF : conservés, jamais lus.
export const FORMATS_LISIBLES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// Nombre de pages d'un PDF sans bibliothèque : objets « /Type /Page », ou le
// plus grand « /Count » des arbres de pages. null si illisible (flux compressés).
export function compterPagesPdf(octets) {
  if (!octets || octets.length < 8) return null;
  const texte = Buffer.from(octets.buffer ?? octets, octets.byteOffset ?? 0, octets.byteLength ?? octets.length).toString("latin1");
  if (!texte.startsWith("%PDF-")) return null;
  const pages = texte.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  let compte = 0;
  for (const m of texte.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) {
    compte = Math.max(compte, Number(m[1] ?? m[2]));
  }
  const n = Math.max(pages, compte);
  return n > 0 ? n : null;
}

// Rend { lisible: true } ou { lisible: false, raison } avec raison parmi
// "format", "taille", "pages".
export function lisibleAutomatiquement({ typeMime, taille, pages = null }) {
  if (!FORMATS_LISIBLES.includes(typeMime)) return { lisible: false, raison: "format" };
  if (!Number.isFinite(taille) || taille <= 0 || taille > LIMITES_LECTURE.tailleMaxOctets) return { lisible: false, raison: "taille" };
  if (typeMime === "application/pdf") {
    if (pages == null && taille > LIMITES_LECTURE.tailleMaxPagesInconnues) return { lisible: false, raison: "pages" };
    if (pages != null && pages > LIMITES_LECTURE.pagesMax) return { lisible: false, raison: "pages" };
  }
  return { lisible: true };
}
