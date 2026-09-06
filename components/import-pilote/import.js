// Import pilote — lecture du fichier et association des colonnes.
//
// Tout ce module est pur : aucune écriture, aucun accès réseau. Le fichier
// est lu dans le navigateur, ses colonnes associées, puis seules les lignes
// normalisées partent vers `importer_clients_vehicules`. Le fichier brut ne
// quitte jamais le poste et n'est conservé nulle part.
//
// La validation métier n'est pas ici : elle est faite par la base, une seule
// fois, pour que l'aperçu et l'import ne puissent pas diverger.

import { CLES_CHAMPS, MAX_LIGNES, SYNONYMES } from "./importConstants.js";

export function reduireEntete(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Devine le séparateur sur la première ligne non vide : point-virgule,
// virgule ou tabulation, celui qui apparaît le plus souvent hors guillemets.
export function detecterSeparateur(texte) {
  const premiere = String(texte ?? "").split(/\r?\n/).find((l) => l.trim() !== "") || "";
  const candidats = [";", ",", "\t"];
  let meilleur = ";";
  let record = -1;
  for (const sep of candidats) {
    let compte = 0;
    let dansGuillemets = false;
    for (const c of premiere) {
      if (c === '"') dansGuillemets = !dansGuillemets;
      else if (c === sep && !dansGuillemets) compte += 1;
    }
    if (compte > record) {
      record = compte;
      meilleur = sep;
    }
  }
  return meilleur;
}

// Analyseur CSV complet : guillemets, guillemets doublés, sauts de ligne
// dans un champ, CRLF, BOM.
export function analyserCsv(texte, separateur) {
  const contenu = String(texte ?? "").replace(/^﻿/, "");
  const sep = separateur || detecterSeparateur(contenu);
  const lignes = [];
  let champ = "";
  let ligne = [];
  let dansGuillemets = false;

  for (let i = 0; i < contenu.length; i += 1) {
    const c = contenu[i];

    if (dansGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          champ += '"';
          i += 1;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += c;
      }
      continue;
    }

    if (c === '"') {
      dansGuillemets = true;
    } else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else if (c === "\r") {
      // Ignoré : le \n qui suit termine la ligne.
    } else {
      champ += c;
    }
  }

  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  return lignes.filter((l) => l.some((v) => String(v).trim() !== ""));
}

// Associe chaque en-tête du fichier à un champ connu. Retourne un objet
// { <champ>: <index de colonne> } ; un champ non reconnu est absent.
export function detecterColonnes(entetes) {
  const correspondance = {};
  const utilisees = new Set();

  (entetes || []).forEach((entete, index) => {
    const reduit = reduireEntete(entete);
    if (!reduit) return;
    for (const cle of CLES_CHAMPS) {
      if (correspondance[cle] !== undefined) continue;
      if (utilisees.has(index)) continue;
      if ((SYNONYMES[cle] || []).includes(reduit)) {
        correspondance[cle] = index;
        utilisees.add(index);
        break;
      }
    }
  });

  return correspondance;
}

export function champsReconnus(correspondance) {
  return CLES_CHAMPS.filter((cle) => correspondance?.[cle] !== undefined);
}

export function champsManquants(correspondance) {
  return CLES_CHAMPS.filter((cle) => correspondance?.[cle] === undefined);
}

// Le nom du client est le seul champ sans lequel un import n'a aucun sens.
export function correspondanceUtilisable(correspondance) {
  return correspondance?.nom !== undefined;
}

// Construit les lignes normalisées envoyées à la base. Les valeurs sont
// simplement découpées et détourées : aucune règle métier ici.
export function construireLignes(lignesBrutes, correspondance, { avecEntete = true } = {}) {
  const corps = avecEntete ? (lignesBrutes || []).slice(1) : lignesBrutes || [];
  return corps.map((ligne) => {
    const objet = {};
    for (const cle of CLES_CHAMPS) {
      const index = correspondance?.[cle];
      if (index === undefined) continue;
      const valeur = String(ligne[index] ?? "").trim();
      if (valeur !== "") objet[cle] = valeur;
    }
    return objet;
  });
}

export function analyserFichier(texte) {
  const separateur = detecterSeparateur(texte);
  const lignes = analyserCsv(texte, separateur);

  if (lignes.length === 0) {
    return { erreur: "Le fichier est vide.", separateur, lignes: [], correspondance: {} };
  }
  if (lignes.length === 1) {
    return {
      erreur: "Le fichier ne contient qu'une ligne d'en-têtes, sans donnée.",
      separateur,
      lignes,
      correspondance: detecterColonnes(lignes[0]),
    };
  }
  if (lignes.length - 1 > MAX_LIGNES) {
    return {
      erreur: `Le fichier contient ${lignes.length - 1} lignes, au-delà des ${MAX_LIGNES} acceptées en une fois.`,
      separateur,
      lignes,
      correspondance: detecterColonnes(lignes[0]),
    };
  }

  return {
    erreur: null,
    separateur,
    lignes,
    entetes: lignes[0],
    correspondance: detecterColonnes(lignes[0]),
  };
}

// --- Appels à la base -------------------------------------------------------

export async function apercuImport(supabase, { garageId, lignes }) {
  return appelerImport(supabase, { garageId, lignes, confirmer: false });
}

export async function confirmerImport(supabase, { garageId, lignes }) {
  return appelerImport(supabase, { garageId, lignes, confirmer: true });
}

async function appelerImport(supabase, { garageId, lignes, confirmer }) {
  const { data, error } = await supabase.rpc("importer_clients_vehicules", {
    p_garage_id: garageId,
    p_lignes: lignes,
    p_confirmer: confirmer,
  });
  if (error) throw error;
  return data;
}
