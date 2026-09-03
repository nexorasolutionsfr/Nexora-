// Notifications de devis résilientes V1 — logique pure, sans React ni
// Supabase, pour rester testable avec `node --test` (convention du dépôt :
// voir components/ordre-reparation/calculs.js et son calculs.test.js).

import { MOTIF_AIDE, MOTIF_LABEL, MOTIFS_INCOMPLET } from "./notificationsDevisConstants.js";

export function estMotifConnu(code) {
  return MOTIFS_INCOMPLET.includes(code);
}

// Un motif inconnu ne doit jamais être affiché brut : il proviendrait
// d'une divergence entre la contrainte SQL et cette liste, et pourrait à
// ce titre contenir autre chose qu'un code court.
export function traduireMotif(code) {
  if (!code) return "Raison non précisée";
  return MOTIF_LABEL[code] || "Raison non précisée";
}

export function aideMotif(code) {
  if (!code) return "";
  return MOTIF_AIDE[code] || "";
}

// La RPC ordonne déjà du plus ancien au plus récent. Ce tri défensif
// garantit l'ordre même si l'appelant réordonne ou concatène.
export function trierNotifications(liste) {
  if (!Array.isArray(liste)) return [];
  return [...liste].sort((a, b) => {
    const da = Date.parse(a?.cree_le ?? "");
    const db = Date.parse(b?.cree_le ?? "");
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return da - db;
  });
}

export function compterNotifications(liste) {
  return Array.isArray(liste) ? liste.length : 0;
}

// Référence courte et non identifiante affichée dans la liste : les huit
// premiers caractères de l'UUID du devis suffisent à retrouver la ligne
// sans afficher un identifiant complet.
export function referenceDevis(devisId) {
  if (typeof devisId !== "string" || devisId.length < 8) return "—";
  return devisId.slice(0, 8);
}

export function formaterAnciennete(creeLe, maintenant = new Date()) {
  const t = Date.parse(creeLe ?? "");
  if (Number.isNaN(t)) return "";
  const jours = Math.floor((maintenant.getTime() - t) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} jours`;
}

export function traduireErreurNotification(error) {
  if (!error) return "Une erreur est survenue. Réessayez.";
  const message = error.message || "";

  if (error.code === "42501") {
    return "Cette action n'est pas autorisée pour votre compte.";
  }
  if (message.includes("Aucun garage")) {
    return "Aucun garage n'est associé à votre compte.";
  }
  if (message.includes("hors perimetre")) {
    return "Cette notification n'appartient pas à votre garage.";
  }
  if (message.includes("deja traitee")) {
    return "Cette notification a déjà été traitée. Actualisez la liste.";
  }
  if (message.includes("introuvable")) {
    return "Cette notification n'est plus disponible. Actualisez la liste.";
  }

  return "Une erreur est survenue. Réessayez.";
}
