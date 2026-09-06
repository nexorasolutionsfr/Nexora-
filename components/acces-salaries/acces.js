// Accès salariés V1 — accès aux RPC de rôles et de membres.
//
// Chaque fonction est un appel direct aux RPC créées par les migrations
// 20260905000200 et 20260905000600. Aucune décision de sécurité n'est prise
// ici : la base refuse d'elle-même un appelant qui n'a pas le rôle requis,
// et ces fonctions se contentent de remonter son message d'erreur.

import {
  ROLE_MECANICIEN,
  estRoleConnu,
} from "./accesConstants.js";

export async function chargerMonRole(supabase, garageId) {
  if (!garageId) return null;
  const { data, error } = await supabase.rpc("mon_role_garage", {
    p_garage_id: garageId,
  });
  if (error) throw error;
  return estRoleConnu(data) ? data : null;
}

export async function listerMembres(supabase, garageId) {
  const { data, error } = await supabase.rpc("lister_membres_garage", {
    p_garage_id: garageId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function inviterMembre(supabase, { garageId, userId, role, mecanicienId = null }) {
  if (!estRoleConnu(role)) {
    throw new Error("Rôle inconnu");
  }
  if (role === ROLE_MECANICIEN && !mecanicienId) {
    throw new Error("Une fiche mécanicien est obligatoire pour ce rôle");
  }
  const { data, error } = await supabase.rpc("inviter_membre_garage", {
    p_garage_id: garageId,
    p_user_id: userId,
    p_role: role,
    p_mecanicien_id: role === ROLE_MECANICIEN ? mecanicienId : null,
  });
  if (error) throw error;
  return data;
}

// Rattachement par adresse e-mail. `inviter_membre_garage` prend un UUID que
// personne ne connaît hors console Supabase ; la fonction appelée ici le
// résout côté base, pour le dirigeant du garage uniquement. Elle ne crée
// aucun compte et n'envoie aucun e-mail : le salarié crée le sien.
export async function inviterMembreParEmail(supabase, { garageId, email, role, mecanicienId = null }) {
  if (!estRoleConnu(role)) {
    throw new Error("Rôle inconnu");
  }
  if (role === ROLE_MECANICIEN && !mecanicienId) {
    throw new Error("Une fiche mécanicien est obligatoire pour ce rôle");
  }
  const adresse = (email ?? "").trim();
  if (!adresse) {
    throw new Error("Adresse e-mail manquante");
  }
  const { data, error } = await supabase.rpc("inviter_membre_par_email", {
    p_garage_id: garageId,
    p_email: adresse,
    p_role: role,
    p_mecanicien_id: role === ROLE_MECANICIEN ? mecanicienId : null,
  });
  if (error) throw error;
  return data;
}

export async function changerRoleMembre(supabase, { membreId, role, mecanicienId = null }) {
  if (!estRoleConnu(role)) {
    throw new Error("Rôle inconnu");
  }
  const { error } = await supabase.rpc("changer_role_membre", {
    p_membre_id: membreId,
    p_role: role,
    p_mecanicien_id: role === ROLE_MECANICIEN ? mecanicienId : null,
  });
  if (error) throw error;
  return true;
}

export async function revoquerMembre(supabase, membreId) {
  const { error } = await supabase.rpc("revoquer_membre_garage", {
    p_membre_id: membreId,
  });
  if (error) throw error;
  return true;
}

// --- Surface du mécanicien --------------------------------------------------

export async function chargerMesOrdres(supabase) {
  const { data, error } = await supabase.rpc("atelier_mes_ordres");
  if (error) throw error;
  return data ?? [];
}

export async function chargerMonOrdre(supabase, ordreId) {
  const { data, error } = await supabase.rpc("atelier_mon_ordre", {
    p_ordre_id: ordreId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function marquerLigne(supabase, { ligneId, statut }) {
  const { error } = await supabase.rpc("atelier_marquer_ligne", {
    p_ligne_id: ligneId,
    p_statut: statut,
  });
  if (error) throw error;
  return true;
}

export async function avancerEtape(supabase, { rdvId, statut }) {
  const { error } = await supabase.rpc("atelier_avancer_etape", {
    p_rdv_id: rdvId,
    p_statut: statut,
  });
  if (error) throw error;
  return true;
}

export async function chargerMesNotes(supabase, ordreId) {
  const { data, error } = await supabase.rpc("atelier_mes_notes", {
    p_ordre_id: ordreId,
  });
  if (error) throw error;
  return data ?? [];
}

// Changer l'étape d'atelier demande l'identifiant du RENDEZ-VOUS, que
// `atelier_mes_ordres()` ne projette pas : le mécanicien n'a aucun moyen de
// le connaître. La fonction appelée ici part de l'ordre, qu'il connaît.
// Tant que la migration qui la crée n'est pas appliquée, l'appel remonte
// PGRST202 et l'écran masque simplement l'action.
export async function avancerEtapeParOrdre(supabase, { ordreId, statut }) {
  const { error } = await supabase.rpc("atelier_avancer_etape_par_ordre", {
    p_ordre_id: ordreId,
    p_statut: statut,
  });
  if (error) throw error;
  return true;
}

export async function ajouterNote(supabase, { ordreId, note }) {
  const texte = (note ?? "").trim();
  if (!texte) throw new Error("Une note vide ne peut pas être enregistrée");
  const { data, error } = await supabase.rpc("atelier_ajouter_note", {
    p_ordre_id: ordreId,
    p_note: texte,
  });
  if (error) throw error;
  return data;
}
