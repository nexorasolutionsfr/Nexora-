// Catalogue de prestations installé à la mise en service, selon les activités
// déclarées par le garage.
//
// POURQUOI CE FICHIER EXISTE
//
// Un garage qui vient de créer son compte arrive sur une liste de prestations
// VIDE. Il ne peut donc ni planifier un rendez-vous, ni chiffrer un devis, sans
// d'abord saisir son catalogue à la main — c'est-à-dire exactement le travail de
// configuration que ce chantier veut supprimer.
//
// (Le tableau de bord affichait bien sept prestations génériques en repli, mais
// elles n'existaient dans aucune base : le garage voyait un catalogue qu'il ne
// possédait pas.)
//
// Ce qui est installé n'est pas un exemple : ce sont des interventions réelles,
// avec des durées d'atelier plausibles, que le garage retrouve dès son premier
// rendez-vous. Il les modifie et les supprime ensuite comme les siennes — rien
// ici n'est verrouillé, et rien n'est réinstallé par la suite.
//
// Les durées sont des points de départ raisonnables, pas des vérités : elles
// servent à ce que l'agenda ne propose pas des créneaux absurdes le premier
// jour. Chaque garage ajuste selon son atelier.

// Interventions communes à tout atelier, quelles que soient ses spécialités.
// Installées une seule fois, même si le garage coche neuf activités.
const SOCLE_COMMUN = [
  { nom: "Diagnostic / prise en charge", categorie: "diagnostic", duree_minutes: 30 },
  { nom: "Présentation au contrôle technique", categorie: "entretien", duree_minutes: 60 },
];

const PAR_ACTIVITE = {
  mecanique: [
    { nom: "Vidange", categorie: "entretien", duree_minutes: 45 },
    { nom: "Révision complète", categorie: "entretien", duree_minutes: 90 },
    { nom: "Courroie de distribution", categorie: "reparation", duree_minutes: 240 },
    { nom: "Freins avant", categorie: "reparation", duree_minutes: 75 },
    { nom: "Freins arrière", categorie: "reparation", duree_minutes: 75 },
    { nom: "Embrayage", categorie: "reparation", duree_minutes: 300 },
    { nom: "Amortisseurs", categorie: "reparation", duree_minutes: 120 },
    { nom: "Batterie", categorie: "entretien", duree_minutes: 30 },
    { nom: "Recharge climatisation", categorie: "entretien", duree_minutes: 60 },
  ],
  carrosserie: [
    { nom: "Devis sinistre", categorie: "carrosserie", duree_minutes: 30 },
    { nom: "Remplacement pare-chocs", categorie: "carrosserie", duree_minutes: 180 },
    { nom: "Débosselage", categorie: "carrosserie", duree_minutes: 120 },
    { nom: "Peinture d'un élément", categorie: "carrosserie", duree_minutes: 240 },
    { nom: "Remplacement pare-brise", categorie: "carrosserie", duree_minutes: 90 },
    { nom: "Rénovation optiques et polissage", categorie: "carrosserie", duree_minutes: 120 },
  ],
  diagnostic_electronique: [
    { nom: "Lecture et effacement des défauts", categorie: "diagnostic", duree_minutes: 45 },
    { nom: "Recherche de panne électrique", categorie: "diagnostic", duree_minutes: 90 },
    { nom: "Reprogrammation calculateur", categorie: "diagnostic", duree_minutes: 120 },
  ],
  pneus: [
    { nom: "Montage de pneus", categorie: "pneumatiques", duree_minutes: 45 },
    { nom: "Équilibrage", categorie: "pneumatiques", duree_minutes: 30 },
    { nom: "Géométrie / parallélisme", categorie: "pneumatiques", duree_minutes: 60 },
    { nom: "Réparation de crevaison", categorie: "pneumatiques", duree_minutes: 30 },
    { nom: "Permutation des roues", categorie: "pneumatiques", duree_minutes: 30 },
  ],
  vente_vo: [
    { nom: "Préparation esthétique", categorie: "entretien", duree_minutes: 180 },
    { nom: "Contrôle avant vente", categorie: "diagnostic", duree_minutes: 60 },
    { nom: "Expertise de reprise", categorie: "diagnostic", duree_minutes: 45 },
  ],
  depannage: [
    { nom: "Dépannage sur place", categorie: "urgence", duree_minutes: 60 },
    { nom: "Remorquage", categorie: "urgence", duree_minutes: 90 },
    { nom: "Démarrage / dépannage batterie", categorie: "urgence", duree_minutes: 30 },
  ],
  vehicules_anciens: [
    { nom: "Devis de restauration", categorie: "diagnostic", duree_minutes: 60 },
    { nom: "Entretien véhicule de collection", categorie: "entretien", duree_minutes: 120 },
    { nom: "Préparation hivernage", categorie: "entretien", duree_minutes: 90 },
    { nom: "Remise en route après hivernage", categorie: "entretien", duree_minutes: 120 },
  ],
  poids_lourds_agricole: [
    { nom: "Entretien poids lourd", categorie: "entretien", duree_minutes: 180 },
    { nom: "Entretien matériel agricole", categorie: "entretien", duree_minutes: 180 },
    { nom: "Circuit hydraulique", categorie: "reparation", duree_minutes: 120 },
    { nom: "Contrôle avant passage aux mines", categorie: "diagnostic", duree_minutes: 90 },
  ],
  voitures_sans_permis: [
    { nom: "Révision voiture sans permis", categorie: "entretien", duree_minutes: 60 },
    { nom: "Courroie de variateur", categorie: "reparation", duree_minutes: 90 },
    { nom: "Embrayage voiture sans permis", categorie: "reparation", duree_minutes: 120 },
    { nom: "Pneus voiture sans permis", categorie: "pneumatiques", duree_minutes: 30 },
  ],
};

// Un garage qui coche mécanique ET véhicules anciens ne doit pas se retrouver
// avec deux prestations portant le même nom : il ne saurait pas laquelle
// choisir, et l'agenda proposerait deux entrées identiques. Le premier gagne,
// dans l'ordre du vocabulaire, jamais dans l'ordre de clic de l'utilisateur —
// sinon deux garages au même profil obtiendraient des catalogues différents.
const ORDRE_VOCABULAIRE = Object.keys(PAR_ACTIVITE);

export function catalogueInitial(profils = []) {
  const retenus = ORDRE_VOCABULAIRE.filter((a) => profils.includes(a));
  const vus = new Set();
  const catalogue = [];

  for (const prestation of [...SOCLE_COMMUN, ...retenus.flatMap((a) => PAR_ACTIVITE[a])]) {
    const cle = prestation.nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    catalogue.push({ ...prestation });
  }
  return catalogue;
}

export { PAR_ACTIVITE, SOCLE_COMMUN };
