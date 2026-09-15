// Ce qu'une relance préparée change à la ligne « travail différé » d'Aujourd'hui.
//
// Fonction pure, sans Supabase, pour pouvoir la tester : c'est ici que se
// décide si l'écran propose de relire et d'autoriser une relance, ou s'il
// laisse la ligne telle quelle, suivie à la main.
//
// Tant que `CAPACITES.relanceTravauxDifferes.disponible` est faux, aucune
// ligne ne mène à « Autoriser l'envoi » et aucune ne laisse croire qu'un
// message partira : on dit seulement que cet envoi n'est pas encore
// disponible. Le geste de la ligne reste celui du suivi manuel.

export const STATUTS_A_OUVRIR = ["a_relire", "bloque"];

function ajouter(ligne, mention) {
  return { ...ligne, probleme: `${ligne.probleme || ""} · ${mention}`.replace(/^ · /, "") };
}

/** Faut-il ouvrir la fenêtre de la relance au lieu du geste habituel de la ligne ? */
export function ouvreLaRelance(relance, disponible) {
  return Boolean(disponible && relance && STATUTS_A_OUVRIR.includes(relance.statut));
}

/** La ligne telle qu'elle s'affiche, compte tenu de sa relance éventuelle. */
export function decorerLigneRelance(ligne, relance, disponible) {
  if (!relance) return ligne;
  if (!disponible) {
    // Une relance déjà envoyée reste un fait ; une relance « envoi à vérifier »
    // aussi. Tout le reste ne partira pas : on ne l'annonce pas.
    if (relance.statut === "envoye") return ajouter(ligne, `relance envoyée le ${new Date(relance.updated_at).toLocaleDateString("fr-FR")}`);
    if (relance.statut === "envoi_en_cours") return ajouter(ligne, "relance : envoi à vérifier");
    if (["a_relire", "bloque", "en_attente"].includes(relance.statut)) return ajouter(ligne, "envoi des relances pas encore disponible");
    return ligne;
  }
  if (relance.statut === "a_relire") return { ...ajouter(ligne, "relance préparée, à relire"), actionLibelle: "Relire la relance" };
  if (relance.statut === "bloque") return { ...ajouter(ligne, "relance mise de côté"), actionLibelle: "Revoir la relance" };
  if (relance.statut === "en_attente") return ajouter(ligne, "relance autorisée, départ en attente");
  if (relance.statut === "envoi_en_cours") return ajouter(ligne, "relance : envoi à vérifier");
  if (relance.statut === "envoye") return ajouter(ligne, `relance envoyée le ${new Date(relance.updated_at).toLocaleDateString("fr-FR")}`);
  return ligne;
}
