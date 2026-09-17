// « Aujourd'hui » : la voiture que la personne consulte, et la seule chose à
// faire en premier.
//
// Pur et testé (aujourdhui.test.js) ; l'écran n'y ajoute que la mise en forme.
// Trois règles tenues ici plutôt qu'à l'affichage :
//
// - la voiture affichée est celle qu'on consultait, sinon la principale,
//   sinon la première ajoutée : une personne qui n'en a qu'une ne la choisit
//   jamais ;
// - une seule action est mise en avant, la plus urgente ; les autres restent
//   accessibles sans encombrer l'écran ;
// - quand rien n'est calculable, l'écran dit **ce qui manque**. Il ne dit
//   jamais que la voiture va bien : Nexora ne connaît que ce qui est
//   enregistré, et l'absence d'alerte n'est pas un bon état ;
// - une échéance en retard ou proche sur une AUTRE voiture est signalée d'une
//   ligne : « Aujourd'hui » répond à « que dois-je savoir maintenant », pas
//   seulement « pour la voiture que je regarde ».

const RANG = { depasse: 3, proche: 2, ok: 1, neutre: 0 };

// Le plus urgent d'abord : une échéance critique passe devant, puis le
// niveau, puis la date (`tri` = jours restants, ou +Infini sans date).
export function parUrgence(a, b) {
  return (
    Number(Boolean(b.critique)) - Number(Boolean(a.critique)) ||
    RANG[b.niveau] - RANG[a.niveau] ||
    a.tri - b.tri
  );
}

export function choisirVoiture(vehicules = [], idMemorise = null) {
  const actives = vehicules.filter((v) => !v.archive_le);
  return (
    actives.find((v) => v.id === idMemorise) ??
    actives.find((v) => v.principal) ??
    actives[0] ??
    null
  );
}

// `urgence` dit pourquoi cette action est la première, et l'écran en tire sa
// phrase : « en retard », « bientôt », « à venir », ou « à compléter ».
function urgenceDe(element, horizonJours) {
  if (element.etat === "a_completer") return "a_completer";
  if (element.niveau === "depasse") return "depasse";
  if (element.niveau === "proche") return "proche";
  return element.tri <= horizonJours ? "horizon" : "plus_tard";
}

// elements : la sortie de `construireAPrevoir` (toutes voitures confondues).
export function etatAujourdhui({ elements = [], vehiculeId = null, horizonJours = 60 } = {}) {
  const siennes = elements.filter((el) => el.vehicule?.id === vehiculeId);
  const datees = siennes.filter((el) => el.etat === "a_faire").sort(parUrgence);
  const aCompleter = siennes.filter((el) => el.etat === "a_completer").sort(parUrgence);

  // Un rappel reporté reste affiché avec sa date, mais ne reprend pas la
  // première place : la personne a demandé qu'on la laisse tranquille.
  const candidates = datees.filter((el) => !el.reporteJusquau);
  const choisie = candidates[0] ?? aCompleter[0] ?? datees[0] ?? null;

  const principale = choisie ? { element: choisie, urgence: urgenceDe(choisie, horizonJours) } : null;
  const autres = [...datees, ...aCompleter].filter((el) => el !== choisie).sort(parUrgence);

  // Les autres voitures : seulement ce qui presse vraiment, et jamais un
  // rappel que la personne a demandé de repousser.
  const ailleurs = elements
    .filter((el) => el.vehicule?.id && el.vehicule.id !== vehiculeId)
    .filter((el) => el.etat === "a_faire" && !el.reporteJusquau && (el.niveau === "depasse" || el.niveau === "proche"))
    .sort(parUrgence);

  return {
    principale,
    autres,
    aCompleter,
    ailleurs,
    // Aucune échéance n'est calculable : l'écran explique ce qui manque au
    // lieu de laisser croire qu'il n'y a rien à faire.
    rienDeCalculable: datees.length === 0,
    total: siennes.length,
  };
}
