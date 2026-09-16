// Coût estimé d'une lecture, en micro-dollars (1 $ = 1 000 000 µ$).
//
// Tarifs publics relevés le 16 sept. 2026
// (https://platform.claude.com/docs/en/about-claude/pricing), hors taxes.
// C'est une ESTIMATION calculée sur l'usage renvoyé par le fournisseur : la
// facture réelle fait foi (console du fournisseur), et une tentative échouée
// ou interrompue peut être facturée sans que Nexora le sache.
//
// Un modèle absent de cette table n'est pas utilisé : sans tarif, pas
// d'estimation, donc pas de contrôle du budget.

export const TARIFS_USD_PAR_MILLION = {
  "claude-haiku-4-5-20251001": { entree: 1, sortie: 5 },
  "claude-haiku-4-5": { entree: 1, sortie: 5 },
};

// Avec un prix en $ par million de jetons, jetons × prix = µ$.
export function coutMicroUsd(usage, modele) {
  const tarif = TARIFS_USD_PAR_MILLION[modele];
  if (!tarif || !usage) return null;
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  const entree = n(usage.input_tokens) + n(usage.cache_read_input_tokens) * 0.1 + n(usage.cache_creation_input_tokens) * 1.25;
  return Math.ceil(entree * tarif.entree + n(usage.output_tokens) * tarif.sortie);
}

// Réserve prise sur le budget avant l'appel : le pire cas permis par les limites.
export function reserveMicroUsd({ jetonsEntree, jetonsSortieMax }, modele) {
  const tarif = TARIFS_USD_PAR_MILLION[modele];
  if (!tarif) return null;
  return Math.ceil(jetonsEntree * tarif.entree + jetonsSortieMax * tarif.sortie);
}

export function formaterUsd(microUsd) {
  if (!Number.isFinite(microUsd)) return "—";
  return `${(microUsd / 1e6).toFixed(4).replace(".", ",")} $`;
}
