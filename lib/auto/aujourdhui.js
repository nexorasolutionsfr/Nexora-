// « Aujourd'hui » : la voiture consultée, et **une seule** chose à faire — si
// tant est qu'il y en ait une.
//
// Pur et testé (aujourdhui.test.js) ; l'écran n'y ajoute que la mise en forme.
//
// Les règles, et pourquoi elles sont ici :
//
// - la voiture affichée est celle qu'on consultait, sinon la principale,
//   sinon la première ajoutée : une personne qui n'en a qu'une ne la choisit
//   jamais ;
// - **une échéance lointaine ne prend jamais la première place.** Un contrôle
//   technique dans 21 mois n'a pas à occuper le haut de l'écran avec un
//   bouton « Enregistrer un contrôle » : il se résume plus bas, et la place
//   revient à ce qui aide aujourd'hui (constat de Baptiste, 18 sept. 2026) ;
// - quand rien n'est calculable, l'écran dit **ce qui manque** et propose la
//   démarche qui le débloque. Il ne dit jamais que la voiture va bien :
//   l'absence d'alerte n'est pas un bon état ;
// - un rappel reporté ne revient pas en tête : la personne a demandé qu'on la
//   laisse tranquille, et ce report vit en base ;
// - les échéances datées et les informations manquantes se comptent
//   **séparément** : « 1 autre échéance » qui cache une information absente
//   fait passer un trou pour une date ;
// - une échéance en retard ou proche sur une AUTRE voiture est signalée d'une
//   ligne : « Aujourd'hui » répond à « que dois-je savoir maintenant », pas
//   seulement « pour la voiture que je regarde ».

const RANG = { depasse: 3, proche: 2, ok: 1, neutre: 0 };

// Au-delà de ce délai, un relevé de kilométrage n'a plus besoin d'être
// réclamé : la personne vient de le donner.
export const FRAICHEUR_KM_JOURS = 14;

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

// Une échéance mérite-t-elle la première place ? Seulement si elle est en
// retard, proche, ou dans l'horizon que la personne a choisi.
function presse(element, horizonJours) {
  return element.niveau === "depasse" || element.niveau === "proche" || element.tri <= horizonJours;
}

function urgenceDe(element, horizonJours) {
  if (element.etat === "a_completer") return "a_completer";
  if (element.niveau === "depasse") return "depasse";
  if (element.niveau === "proche") return "proche";
  return element.tri <= horizonJours ? "horizon" : "plus_tard";
}

// Le dernier kilométrage est-il assez récent pour qu'on ne le redemande pas ?
// `dernier` est la sortie de `dernierKilometrage` ({ kilometrage, date, origine }).
export function kilometrageFrais(dernier, aujourdhui, jours = FRAICHEUR_KM_JOURS) {
  if (!dernier?.date || !aujourdhui) return false;
  const ecart = (Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${dernier.date}T00:00:00Z`)) / 86400000;
  return Number.isFinite(ecart) && ecart >= 0 && ecart <= jours;
}

// elements : la sortie de `construireAPrevoir` (toutes voitures confondues).
export function etatAujourdhui({ elements = [], vehiculeId = null, horizonJours = 60 } = {}) {
  const siennes = elements.filter((el) => el.vehicule?.id === vehiculeId);
  const datees = siennes.filter((el) => el.etat === "a_faire").sort(parUrgence);
  const aCompleter = siennes.filter((el) => el.etat === "a_completer").sort(parUrgence);

  // Ce qui presse, ce qui attendra, et ce qu'on a demandé de ne plus voir.
  const pressantes = datees.filter((el) => !el.reporteJusquau && presse(el, horizonJours));
  const lointaines = datees.filter((el) => !presse(el, horizonJours));
  const aCompleterVisibles = aCompleter.filter((el) => !el.reporteJusquau);

  const choisie = pressantes[0] ?? aCompleterVisibles[0] ?? null;
  const principale = choisie ? { element: choisie, urgence: urgenceDe(choisie, horizonJours) } : null;
  const autres = [...datees, ...aCompleter].filter((el) => el !== choisie).sort(parUrgence);

  const ailleurs = elements
    .filter((el) => el.vehicule?.id && el.vehicule.id !== vehiculeId)
    .filter((el) => el.etat === "a_faire" && !el.reporteJusquau && (el.niveau === "depasse" || el.niveau === "proche"))
    .sort(parUrgence);

  return {
    principale,
    // Les échéances connues mais lointaines : un résumé, pas une action.
    lointaines,
    aCompleter,
    autres,
    ailleurs,
    // Comptés à part : une date connue n'est pas une information manquante.
    compteurs: {
      echeances: datees.filter((el) => el !== choisie).length,
      aCompleter: aCompleter.filter((el) => el !== choisie).length,
    },
    rienDeCalculable: datees.length === 0,
    total: siennes.length,
  };
}
