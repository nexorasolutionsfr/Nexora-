// D'où vient ce que Nexora affirme d'une voiture.
//
// Une règle sans source n'a pas le droit d'exister dans ce dossier : chaque
// entrée de `regles.js` désigne une clé d'ici, et l'écran peut toujours
// répondre « d'où sortez-vous ça ? » par un éditeur, une adresse, une version
// et la date à laquelle un humain l'a relue.
//
// Ce que ce registre n'est PAS : une autorisation de recopier une base.
// Nexora cite un texte et en tire un fait ; elle ne republie ni le document,
// ni le catalogue de personne. Les seules données réellement redistribuées
// sont celles dont la licence le permet explicitement — aujourd'hui la seule
// dans ce cas est RappelConso (Licence Ouverte v2.0).
//
// `verifie_le` est la date de la dernière relecture HUMAINE de la source, pas
// celle du dernier déploiement. Elle vieillit : un texte relu il y a plus d'un
// an doit être relu avant d'être invoqué (voir `sourcesAVerifier`).

export const SOURCES = {
  "service-public-F2878": {
    titre: "Contrôle technique d'une voiture",
    editeur: "Direction de l'information légale et administrative",
    url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F2878",
    // La fiche porte elle-même sa date de mise à jour : on la recopie pour
    // savoir si notre lecture porte encore sur le même texte.
    version: "mise à jour du 1er janvier 2026",
    verifie_le: "2026-09-20",
    portee: "Voitures particulières (catégorie M1) immatriculées en France",
    droits: "Texte officiel cité comme source. Nexora en tire des règles, sans republier la fiche.",
  },
  "arrete-2016-06-21-critair": {
    titre: "Arrêté du 21 juin 2016 établissant la nomenclature des véhicules classés en fonction de leur niveau d'émission de polluants atmosphériques",
    editeur: "Légifrance (République française)",
    url: "https://www.legifrance.gouv.fr/loda/id/JORFTEXT000032749723/",
    // L'annexe I a été refaite par l'arrêté du 5 juillet 2023 : c'est CETTE
    // version qui est transcrite dans critair.js.
    version: "annexe I en vigueur depuis le 22 juillet 2023",
    verifie_le: "2026-09-20",
    portee: "Tous véhicules routiers à moteur ; Nexora n'en retient que la colonne « Voitures » (M1)",
    droits: "Texte réglementaire. La nomenclature est transcrite telle quelle, avec sa référence.",
  },
  "rappelconso-v2": {
    titre: "RappelConso V2 — Rappels de produits",
    editeur: "DGCCRF (Direction générale de la concurrence, de la consommation et de la répression des fraudes)",
    url: "https://data.economie.gouv.fr/explore/dataset/rappelconso-v2-gtin-espaces/",
    version: "Licence Ouverte v2.0 (Etalab)",
    verifie_le: "2026-09-20",
    portee: "Fiches de rappel publiées sur rappel.conso.gouv.fr ; Nexora ne lit que la catégorie « automobiles et moyens de déplacement »",
    // La seule source dont les données transitent réellement par Nexora : la
    // licence l'autorise, à condition de citer l'éditeur à l'écran.
    droits: "Réutilisation autorisée avec mention de la source (Licence Ouverte v2.0). La mention s'affiche sous la liste des campagnes.",
    mention: "Source : RappelConso, DGCCRF — Licence Ouverte v2.0",
  },
};

export function source(cle) {
  return SOURCES[cle] ?? null;
}

// Une source relue il y a plus d'un an n'est plus une source relue.
export const JOURS_AVANT_RELECTURE = 365;

export function sourcesAVerifier(aujourdhui, sources = SOURCES) {
  if (typeof aujourdhui !== "string") return [];
  return Object.entries(sources)
    .filter(([, s]) => {
      const limite = new Date(`${s.verifie_le}T00:00:00Z`);
      if (Number.isNaN(limite.getTime())) return true;
      limite.setUTCDate(limite.getUTCDate() + JOURS_AVANT_RELECTURE);
      return aujourdhui > limite.toISOString().slice(0, 10);
    })
    .map(([cle]) => cle);
}

// Ce qu'un écran affiche quand on déplie « d'où vient cette information ».
export function citation(cle) {
  const s = source(cle);
  if (!s) return null;
  return { titre: s.titre, editeur: s.editeur, url: s.url, version: s.version, verifieLe: s.verifie_le, mention: s.mention ?? null };
}
