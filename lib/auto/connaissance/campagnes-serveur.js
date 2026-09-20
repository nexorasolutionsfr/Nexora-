// La lecture de la base officielle des rappels, côté SERVEUR.
//
// Pourquoi le serveur et pas le navigateur, alors que l'API l'autorise
// (`access-control-allow-origin: *`) : si le navigateur interrogeait
// directement data.economie.gouv.fr, l'adresse IP de la personne partirait
// chez un tiers pour consulter sa propre voiture. Le serveur, lui, demande
// « les rappels Peugeot » — ce qui ne désigne personne.
//
// Ce qui part d'ici : un nom de marque. Jamais une plaque, un VIN, une
// adresse, un identifiant de compte ni une date personnelle.
//
// Ce n'est pas une « intégration sortante » au sens où l'entend l'interrupteur
// du projet : aucun secret, aucun envoi, aucune dépense, aucune écriture.
// C'est une lecture publique et anonyme, et elle reste donc active en
// prévisualisation — sinon la page n'aurait rien à montrer là où on la
// recette. Son garde-fou lui est propre : campagnes-serveur.test.js vérifie
// qu'aucun autre fichier n'atteint cette adresse.
//
// Source : RappelConso V2, DGCCRF — Licence Ouverte v2.0 (voir sources.js).

export const API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records";

export const CHAMPS = [
  "id",
  "numero_fiche",
  "date_publication",
  "marque_produit",
  "modeles_ou_references",
  "identification_produits",
  "motif_rappel",
  "risques_encourus",
  "conduites_a_tenir_par_le_consommateur",
  "lien_vers_la_fiche_rappel",
  "sous_categorie_produit",
];

// Six heures : la base est publiée une fois par jour. Recharger plus souvent
// ne rend rien de plus et consomme le quota commun (50 000 appels par jour).
export const REVALIDATION_SECONDES = 6 * 60 * 60;
export const PAR_PAGE = 100;
export const MAX_FICHES = 300;

// Un nom de marque, et rien d'autre : pas de guillemet, pas de parenthèse,
// rien qui puisse refermer la requête ODSQL.
export function marqueSure(marque) {
  if (typeof marque !== "string") return null;
  const propre = marque
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 /-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return propre.length >= 1 && propre.length <= 40 ? propre : null;
}

function adresse(marques, offset) {
  const guillemets = marques.map((m) => `"${m}"`).join(", ");
  const where = [
    'categorie_produit="automobiles et moyens de déplacement"',
    'sous_categorie_produit="automobiles, motos, scooters"',
    `marque_produit in (${guillemets})`,
  ].join(" and ");
  const q = new URLSearchParams({
    where,
    select: CHAMPS.join(","),
    order_by: "date_publication desc",
    limit: String(PAR_PAGE),
    offset: String(offset),
  });
  return `${API}?${q}`;
}

// { etat: "lues", fiches, total, tronque } | { etat: "indisponible", raison }
//
// Ne lève jamais : une base publique indisponible est un état normal de
// l'écran, pas une panne de Nexora.
export async function fichesDeLaMarque(marques, { fetchImpl, revalidate = REVALIDATION_SECONDES, maxFiches = MAX_FICHES } = {}) {
  const sures = (Array.isArray(marques) ? marques : [marques]).map(marqueSure).filter(Boolean);
  if (sures.length === 0) return { etat: "indisponible", raison: "marque_illisible" };

  const lecteur = fetchImpl ?? globalThis.fetch;
  if (typeof lecteur !== "function") return { etat: "indisponible", raison: "pas_de_reseau" };

  const fiches = [];
  let total = 0;
  let offset = 0;

  try {
    do {
      const reponse = await lecteur(adresse(sures, offset), {
        headers: { Accept: "application/json" },
        next: { revalidate },
      });
      if (!reponse.ok) return { etat: "indisponible", raison: `statut_${reponse.status}` };
      const corps = await reponse.json();
      total = Number(corps?.total_count) || 0;
      const page = Array.isArray(corps?.results) ? corps.results : [];
      fiches.push(...page);
      offset += PAR_PAGE;
      if (page.length < PAR_PAGE) break;
    } while (offset < total && fiches.length < maxFiches);
  } catch {
    // Réseau coupé, réponse illisible, délai dépassé : même conséquence.
    return { etat: "indisponible", raison: "injoignable" };
  }

  return { etat: "lues", fiches, total, tronque: total > fiches.length };
}
