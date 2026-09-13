"use client";

// Prévenir le client qu'une voiture est prête — le geste, partagé.
//
// POURQUOI UN MODULE
//
// Le geste part de deux écrans : l'Atelier, file « Prêtes », et Aujourd'hui,
// colonne « Voitures prêtes ». Deux implémentations donneraient deux
// comportements — et c'est sur un envoi au client que l'écart se paierait.
// Une seule ici, deux appelants.
//
// CE QU'IL NE DÉCIDE PAS
//
// Rien. `apercu_message_atelier` compose le message, `autoriser_envoi_atelier`
// décide si l'envoi est permis et l'enregistre. Ce module ne fait que porter
// l'état de la fenêtre et relayer les refus de la base en phrases lisibles.

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Les refus que la base peut renvoyer, traduits une fois pour toutes. */
export const MOTIFS_REFUS = {
  destinataire_absent: "Ce client n'a pas d'adresse e-mail enregistrée.",
  destinataire_different: "L'adresse du client a changé depuis l'aperçu. Rouvrez le message pour la relire.",
  vehicule_pas_pret: "Cette voiture n'est plus notée prête. Aucun message n'a été envoyé.",
  deja_envoye: "Le client a déjà été prévenu pour cette voiture.",
};

export function usePrevenirClient({ onToast } = {}) {
  // { appt, apercu, chargement, erreur, enCours }
  const [prevenir, setPrevenir] = useState(null);
  const [etats, setEtats] = useState({});

  const lireEtat = useCallback(async (rdvId) => {
    const { data, error } = await supabase.rpc("etat_envoi_atelier", { p_rendez_vous_id: rdvId });
    if (error || !data?.ok) return null;
    setEtats((p) => ({ ...p, [rdvId]: data }));
    return data;
  }, []);

  const ouvrirPrevenir = useCallback(async (appt) => {
    if (!appt?.id) return;
    setPrevenir({ appt, apercu: null, chargement: true, erreur: null, enCours: false });
    const { data, error } = await supabase.rpc("apercu_message_atelier", { p_rendez_vous_id: appt.id });
    if (error || !data?.ok) {
      setPrevenir({ appt, apercu: null, chargement: false, enCours: false,
        erreur: "Impossible de préparer le message. Réessayez dans un instant." });
      return;
    }
    if (!data.destinataire) {
      // Pas d'adresse : on ne propose pas un envoi qui ne peut pas partir.
      setPrevenir({ appt, apercu: data, chargement: false, enCours: false,
        erreur: "Ce client n'a pas d'adresse e-mail enregistrée. Ajoutez-la dans sa fiche, ou prévenez-le autrement." });
      return;
    }
    setPrevenir({ appt, apercu: data, chargement: false, erreur: null, enCours: false });
  }, []);

  const confirmerPrevenir = useCallback(async (destinataire) => {
    let appt = null;
    setPrevenir((p) => { appt = p?.appt || null; return p ? { ...p, enCours: true } : p; });
    if (!appt) return;
    const { data, error } = await supabase.rpc("autoriser_envoi_atelier", {
      p_rendez_vous_id: appt.id,
      p_destinataire: destinataire,
    });
    if (error) {
      setPrevenir((p) => (p ? { ...p, enCours: false, erreur: "Envoi refusé. Vérifiez vos droits, puis réessayez." } : p));
      return;
    }
    if (data?.ok === false) {
      setPrevenir((p) => (p ? { ...p, enCours: false, erreur: MOTIFS_REFUS[data.raison] || "Envoi refusé." } : p));
      await lireEtat(appt.id);
      return;
    }
    setPrevenir(null);
    await lireEtat(appt.id);
    onToast?.(data?.deja_autorise ? "Message déjà autorisé" : "Message autorisé");
  }, [lireEtat, onToast]);

  const fermerPrevenir = useCallback(() => setPrevenir(null), []);

  return { prevenir, etats, setEtats, lireEtat, ouvrirPrevenir, confirmerPrevenir, fermerPrevenir };
}
