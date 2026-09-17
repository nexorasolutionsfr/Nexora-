// Lecture des dossiers de la personne connectée : voitures (avec relevés et
// historique), tâches, reports de rappel et préférences. Une seule lecture
// sert « Mon garage » et « À prévoir ». En cas d'échec, `{ erreur: true }` :
// jamais un garage ou une liste vides par défaut.

import { supabase } from "@/lib/supabase";
import { HORIZON_PAR_DEFAUT } from "@/components/auto/aPrevoir";

const COLONNES_VEHICULE =
  "id, immatriculation, marque, modele, annee, energie, motorisation, date_mise_en_circulation, intervalle_entretien_km, intervalle_entretien_mois, principal, archive_le, created_at";
// `source` sert à dire d'où vient une date : saisie par la personne, ou lue
// sur un document qu'elle a déposé. L'écran ne doit pas les confondre.
const COLONNES_HISTORIQUE = "id, vehicule_id, type, realise_le, kilometrage, resultat_controle, nature_controle, controle_valable_jusqu_au, source";

export async function chargerDossiers() {
  const [vehicules, releves, historique, taches, reports, preferences] = await Promise.all([
    supabase.from("auto_vehicules").select(COLONNES_VEHICULE).order("created_at", { ascending: true }),
    supabase.from("auto_releves_km").select("vehicule_id, kilometrage, releve_le, source"),
    supabase.from("auto_historique").select(COLONNES_HISTORIQUE),
    supabase.from("auto_taches").select("id, vehicule_id, service_code, titre, note, echeance, statut, terminee_le, created_at"),
    supabase.from("auto_rappels_reports").select("cle, reporte_jusqu_au"),
    supabase.from("auto_preferences").select("horizon_jours").maybeSingle(),
  ]);
  if ([vehicules, releves, historique, taches, reports, preferences].some((r) => r.error)) return { erreur: true };

  const parVehicule = (lignes, id) => lignes.filter((l) => l.vehicule_id === id);
  return {
    erreur: false,
    vehicules: vehicules.data.map((v) => ({ ...v, releves: parVehicule(releves.data, v.id), historique: parVehicule(historique.data, v.id) })),
    taches: taches.data,
    reports: reports.data,
    horizonJours: preferences.data?.horizon_jours ?? HORIZON_PAR_DEFAUT,
  };
}
