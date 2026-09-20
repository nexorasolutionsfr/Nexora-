"use client";

// Prévenir le client qu'une voiture est prête — le geste, partagé.
//
// POURQUOI UN MODULE
//
// Le geste part de deux écrans : l'Atelier, file « Prêtes », et Aujourd'hui,
// où la ligne « Message de disponibilité non envoyé » ouvre la même fenêtre.
// Deux implémentations donneraient deux comportements — et c'est sur un envoi
// au client que l'écart se paierait. Une seule ici, deux appelants.
//
// CE QU'IL NE DÉCIDE PAS
//
// Rien. `apercu_message_atelier` compose le message, `autoriser_envoi_atelier`
// décide si l'envoi est permis et l'enregistre. Ce module ne fait que porter
// l'état de la fenêtre ; les phrases et les conclusions sont dans
// `prevenirClient.js`, qui se teste sans React ni réseau.
//
// LA CIBLE EST DONNÉE, ELLE N'EST PAS RELUE
//
// `confirmerPrevenir` reçoit le rendez-vous ET le destinataire que la fenêtre
// affichait. Elle ne va les chercher nulle part. La version précédente les
// récupérait par effet de bord d'une fonction de mise à jour d'état React :
// celle-ci ne court qu'au rendu suivant, donc la valeur était encore `null` au
// moment du test qui suivait, et la fonction sortait sans appeler la base.
// Mesuré le 20 septembre 2026 dans le navigateur, en développement ET en build
// de production. Voir l'en-tête de `prevenirClient.js`.

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MOTIFS_REFUS, cibleDEnvoi, suiteDeConfirmation } from "./prevenirClient";

export { MOTIFS_REFUS };

export function usePrevenirClient({ onToast } = {}) {
  // { appt, apercu, chargement, erreur, enCours }
  const [prevenir, setPrevenir] = useState(null);
  const [etats, setEtats] = useState({});

  // LE VERROU DU DOUBLE CLIC EST UNE RÉFÉRENCE, PAS UN ÉTAT
  //
  // Un état React est appliqué au rendu suivant : deux clics dans le même tour
  // le liraient tous les deux à `false` et enverraient deux autorisations. La
  // référence, elle, est posée dans le même tour que le premier clic. La base
  // protège aussi de son côté (`autoriser_envoi_atelier` ne réarme jamais une
  // ligne déjà `en_attente` ou `envoi_en_cours`) — les deux se cumulent, on
  // n'en retire aucune.
  const enVol = useRef(false);

  const lireEtat = useCallback(async (rdvId) => {
    const { data, error } = await supabase.rpc("etat_envoi_atelier", { p_rendez_vous_id: rdvId });
    if (error || !data?.ok) return null;
    setEtats((p) => ({ ...p, [rdvId]: data }));
    return data;
  }, []);

  const ouvrirPrevenir = useCallback(async (appt) => {
    if (!appt?.id) return;
    setPrevenir({ appt, apercu: null, chargement: true, erreur: null, enCours: false });
    // L'état est relu AU MOMENT du geste, pas à l'affichage de la liste : entre
    // les deux, l'envoi a pu être autorisé ailleurs, ou mis de côté. C'est
    // aussi ce qui permet de dire depuis quand une notification est bloquée
    // avant de proposer de la relancer.
    await lireEtat(appt.id);
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
  }, [lireEtat]);

  /**
   * Confirmer l'envoi.
   *
   * @param cible { rendezVousId, destinataire } — ce que la fenêtre AFFICHAIT.
   *
   * Aucune sortie n'est muette : chaque chemin ferme la fenêtre ou y écrit une
   * phrase, et remet toujours `enCours` à faux pour que l'écran redevienne
   * utilisable.
   */
  const confirmerPrevenir = useCallback(async (cible) => {
    const visee = cibleDEnvoi(cible);
    if (!visee.ok) {
      setPrevenir((p) => (p ? { ...p, enCours: false, erreur: visee.erreur } : p));
      return;
    }
    // Deuxième clic pendant que le premier est en vol : on ne renvoie rien.
    // Le premier fait foi, et c'est lui qui rendra la main.
    if (enVol.current) return;
    enVol.current = true;
    setPrevenir((p) => (p ? { ...p, enCours: true, erreur: null } : p));

    let reponse;
    try {
      reponse = await supabase.rpc("autoriser_envoi_atelier", {
        p_rendez_vous_id: visee.rendezVousId,
        p_destinataire: visee.destinataire,
      });
    } catch (e) {
      // `supabase-js` rend d'ordinaire l'échec dans `error`, mais une coupure
      // peut rejeter la promesse. Une exception ne doit pas laisser la fenêtre
      // figée sur « Envoi autorisé… ».
      reponse = { data: null, error: { message: String(e?.message || e) } };
    } finally {
      enVol.current = false;
    }

    const suite = suiteDeConfirmation(reponse);
    if (suite.fermer) setPrevenir(null);
    else setPrevenir((p) => (p ? { ...p, enCours: false, erreur: suite.erreur } : p));
    // L'état affiché repart de la base, jamais d'une supposition — sauf quand
    // la requête n'est jamais partie : il n'a alors pas pu changer.
    if (suite.relireEtat) await lireEtat(visee.rendezVousId);
    if (suite.toast) onToast?.(suite.toast);
  }, [lireEtat, onToast]);

  const fermerPrevenir = useCallback(() => {
    // Fermer n'annule pas une autorisation en vol : le verrou reste posé
    // jusqu'au retour de la base, qui le lève dans son `finally`.
    setPrevenir(null);
  }, []);

  return { prevenir, etats, setEtats, lireEtat, ouvrirPrevenir, confirmerPrevenir, fermerPrevenir };
}
