// Trois journées fictives, pour juger l'écran Aujourd'hui sur pièces.
//
// Rien ici ne touche à la base : ce sont des objets en mémoire, de la même
// FORME que ceux que le tableau de bord charge (`rendez_vous` enrichi par le
// chargeur : `vehicule`, `immatriculation`, `client`, `prestation`). Le
// prototype peut donc appeler `filVehicule` et les règles de priorité telles
// quelles — c'est tout l'intérêt : ce qu'on regarde est produit par le vrai
// code métier, pas par une maquette qui raconterait ce qu'on veut entendre.
//
// Les noms sont inventés, les adresses en `.invalid`.

const JOUR = "2026-09-13";
const h = (heure, minutes = 0) => `${JOUR}T${String(heure).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+02:00`;
const ilYA = (jours, heure) => {
  const d = new Date(`${JOUR}T${String(heure).padStart(2, "0")}:00:00+02:00`);
  d.setDate(d.getDate() - jours);
  return d.toISOString();
};

/** L'instant de référence des trois scénarios : 10 h 30, un jour ouvré. */
export const MAINTENANT_PROTO = new Date(h(10, 30));

function v({ id, plaque, vehicule, client, prestation, etape, debut, duree = 120, mecanicien = null, devis = null, ordre = null, facture = null, etatEnvoiDevis = null, etatEnvoiFacture = null, clientPrevenu = null }) {
  const fin = new Date(new Date(debut).getTime() + duree * 60000).toISOString();
  return {
    id,
    rdv: { id, statut_atelier: etape, date_debut: debut, date_fin: fin, statut: "Confirmé" },
    vehicule,
    immatriculation: plaque,
    client,
    prestation,
    mecanicien,
    devis,
    ordre,
    facture,
    etatEnvoiDevis,
    etatEnvoiFacture,
    clientPrevenu,
  };
}

// --- 1. Garage vide --------------------------------------------------------
export const JOURNEE_VIDE = {
  cle: "vide",
  titre: "Garage vide",
  description: "Premier jour, ou dimanche soir.",
  garage: { nom: "Garage Renard", configurationComplete: false, horairesRenseignes: false },
  dossiers: [],
};

// --- 2. Journée habituelle, douze véhicules --------------------------------
export const JOURNEE_HABITUELLE = {
  cle: "habituelle",
  titre: "Journée habituelle",
  description: "Douze voitures, trois décisions.",
  garage: { nom: "Garage Renard", configurationComplete: true, horairesRenseignes: true },
  dossiers: [
    v({ id: "h1", plaque: "AB-114-CD", vehicule: "Peugeot 208", client: "Camille Perrin", prestation: "Révision complète", etape: "a_venir", debut: h(8), mecanicien: "Karim B." }),
    v({ id: "h2", plaque: "CE-220-FG", vehicule: "Renault Clio IV", client: "Étienne Vasseur", prestation: "Plaquettes de frein avant", etape: "depose", debut: h(9), mecanicien: "Karim B." }),
    v({ id: "h3", plaque: "DH-331-JK", vehicule: "Citroën C3", client: "Sonia Bahri", prestation: "Diagnostic électronique", etape: "diagnostic", debut: h(8, 30), duree: 60, mecanicien: "Sofia M." }),
    v({ id: "h4", plaque: "FL-442-MN", vehicule: "Toyota Yaris", client: "Paul Ferrand", prestation: "Vidange", etape: "pret", debut: h(8), duree: 45, mecanicien: "Karim B.", clientPrevenu: false }),
    v({ id: "h5", plaque: "GP-553-QR", vehicule: "Ford Focus", client: "Nadia Lemoine", prestation: "Amortisseurs", etape: "pret", debut: ilYA(1, 15), mecanicien: "Sofia M.", clientPrevenu: true }),
    v({ id: "h6", plaque: "HS-664-TV", vehicule: "Volkswagen Golf", client: "Hélène Ngô", prestation: "Courroie de distribution", etape: "intervention", debut: h(8), duree: 240, mecanicien: "Karim B." }),
    v({ id: "h7", plaque: "JW-775-XY", vehicule: "Dacia Sandero", client: "Yanis Cherif", prestation: "Vidange", etape: "a_venir", debut: h(14), duree: 45 }),
    v({ id: "h8", plaque: "KZ-886-AB", vehicule: "Opel Corsa", client: "Olivier Sanchez", prestation: "Freins arrière", etape: "attente_piece", debut: ilYA(1, 9), mecanicien: "Sofia M." }),
    v({ id: "h9", plaque: "LC-997-DE", vehicule: "Fiat 500", client: "Marie Aubert", prestation: "Diagnostic électronique", etape: "attente_client", debut: ilYA(1, 11), duree: 60, mecanicien: "Sofia M.", devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" }),
    // Devis établi, jamais envoyé : de l'argent qui attend un geste.
    v({ id: "h10", plaque: "MF-108-GH", vehicule: "BMW Série 1", client: "Thomas Girard", prestation: "Embrayage", etape: "a_venir", debut: h(16), devis: { statut: "en_attente" }, etatEnvoiDevis: "aucune" }),
    v({ id: "h11", plaque: "NJ-219-KL", vehicule: "Renault Master", client: "Transports Delaunay", prestation: "Révision complète", etape: "restitue", debut: h(8), facture: { statut: "payee" } }),
    v({ id: "h12", plaque: "PM-320-NP", vehicule: "Seat Ibiza", client: "Julie Caron", prestation: "Batterie", etape: "a_venir", debut: h(17), duree: 30 }),
  ],
};

// --- 3. Journée chargée : blocages et noms longs ---------------------------
export const JOURNEE_CHARGEE = {
  cle: "chargee",
  titre: "Journée chargée",
  description: "Blocages, retards, noms longs.",
  garage: { nom: "Garage Renard", configurationComplete: false, horairesRenseignes: true },
  dossiers: [
    // Une contradiction : l'ordre est terminé, la voiture notée « à venir ».
    v({ id: "c1", plaque: "QR-431-ST", vehicule: "Mercedes Classe A", client: "Marie-Alexandrine de Kervasdoué-Lestrange", prestation: "Remplacement de l'embrayage sur boîte automatique à double embrayage", etape: "a_venir", debut: h(8), mecanicien: "Jean-Baptiste de La Rochefoucauld-Montmorency", ordre: { statut: "termine" } }),
    v({ id: "c2", plaque: "TU-542-VW", vehicule: "Peugeot 3008", client: "Grégoire Vandenbossche-Delaunay", prestation: "Distribution + pompe à eau", etape: "pret", debut: h(7, 30), mecanicien: "Karim B.", clientPrevenu: false }),
    v({ id: "c3", plaque: "XY-653-ZA", vehicule: "Renault Kangoo", client: "Établissements Lefebvre & Fils", prestation: "Révision complète", etape: "pret", debut: ilYA(2, 9), mecanicien: "Sofia M.", clientPrevenu: false }),
    v({ id: "c4", plaque: "BC-764-DE", vehicule: "Audi A3 Sportback", client: "Anne-Sophie Bonnefoy", prestation: "Plaquettes et disques avant", etape: "pret", debut: ilYA(1, 14), mecanicien: "Karim B.", clientPrevenu: false }),
    v({ id: "c5", plaque: "FG-875-HI", vehicule: "Volkswagen Tiguan Allspace R-Line", client: "Christophe Mérieux-Charpentier", prestation: "Diagnostic électronique approfondi", etape: "intervention", debut: h(7), duree: 120, mecanicien: "Jean-Baptiste de La Rochefoucauld-Montmorency" }),
    v({ id: "c6", plaque: "JK-986-LM", vehicule: "Citroën Berlingo", client: "Maçonnerie Duval SARL", prestation: "Embrayage", etape: "intervention", debut: h(8), duree: 90, mecanicien: "Karim B." }),
    v({ id: "c7", plaque: "NO-197-PQ", vehicule: "Ford Transit", client: "Boulangerie Saint-Michel", prestation: "Freins avant et arrière", etape: "attente_piece", debut: ilYA(3, 8), mecanicien: "Sofia M." }),
    v({ id: "c8", plaque: "RS-208-TU", vehicule: "Nissan Qashqai", client: "Farida Benali-Tournier", prestation: "Amortisseurs arrière", etape: "attente_piece", debut: ilYA(2, 10), mecanicien: "Sofia M." }),
    v({ id: "c9", plaque: "VW-319-XY", vehicule: "Skoda Octavia", client: "Pierre-Emmanuel Dussautoir", prestation: "Courroie de distribution", etape: "attente_client", debut: ilYA(1, 9), mecanicien: "Karim B.", devis: { statut: "en_attente" }, etatEnvoiDevis: "envoye" }),
    v({ id: "c10", plaque: "ZA-420-BC", vehicule: "Mini Cooper", client: "Léa Fontaine", prestation: "Vidange", etape: "a_venir", debut: h(8, 30), duree: 45 }),
    v({ id: "c11", plaque: "DE-531-FG", vehicule: "Hyundai Tucson", client: "Ambulances du Val", prestation: "Révision", etape: "a_venir", debut: h(9), mecanicien: "Sofia M." }),
    // Sans plaque, sans marque : les deux cas limites, ensemble.
    v({ id: "c12", plaque: null, vehicule: "", client: "Yanis Cherif", prestation: "Vidange", etape: "a_venir", debut: h(15), duree: 45 }),
    v({ id: "c13", plaque: "HI-642-JK", vehicule: "Toyota Corolla", client: "Sylvie Marchand", prestation: "Climatisation", etape: "restitue", debut: h(8), facture: { statut: "en_attente" }, etatEnvoiFacture: "aucune" }),
    v({ id: "c14", plaque: "LM-753-NO", vehicule: "Renault Zoé", client: "Commune de Saint-Aubin-sur-Mer", prestation: "Contrôle batterie de traction", etape: "diagnostic", debut: h(9, 30), duree: 60, mecanicien: "Sofia M." }),
  ],
};

export const SCENARIOS = [JOURNEE_VIDE, JOURNEE_HABITUELLE, JOURNEE_CHARGEE];
