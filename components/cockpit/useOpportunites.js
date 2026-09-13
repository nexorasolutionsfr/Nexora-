"use client";

// Le moteur du Cockpit, sans son écran.
//
// POURQUOI CE FICHIER
//
// `deriveOpportunites` et le journal `opportunites_actions` sont la bonne
// mécanique : des règles lisibles, un traité/reporté qui ne modifie aucune
// donnée métier, une réapparition automatique bornée à trois sources. Ce qui
// était faux, c'est qu'ils vivaient dans un ÉCRAN SÉPARÉ, à côté d'un autre
// écran qui priorisait les mêmes données autrement.
//
// Le moteur est donc sorti de l'écran. La liste unique d'Aujourd'hui le
// consomme ; rien de sa logique n'a changé.
//
// CE QUE « TRAITÉ » VEUT DIRE, ET NE VEUT PAS DIRE
//
// Une marque de suivi, écrite dans `opportunites_actions`. Elle ne répare pas,
// ne facture pas, n'accepte aucun devis et n'envoie aucun message. Ouvrir un
// dossier ne l'écrit pas : seul un clic explicite le fait.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deriveOpportunites } from "./deriveOpportunites";

export function useOpportunites({ garageId, proprietaireUserId = null, donnees = {}, handlers = {}, onToast }) {
  // Le journal n'est lisible et écrivable que par le PROPRIÉTAIRE du garage
  // (policy `opportunites_actions_isolation`). On résout donc le compte
  // courant ici plutôt que de proposer des commandes qui échoueraient en
  // silence. Pour les autres comptes, rien n'est masqué : aucune tâche perdue.
  const [estProprietaire, setEstProprietaire] = useState(false);
  useEffect(() => {
    let annule = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!annule) setEstProprietaire(Boolean(proprietaireUserId && data?.user?.id === proprietaireUserId));
    })();
    return () => { annule = true; };
  }, [proprietaireUserId]);

  const [inspections, setInspections] = useState([]);
  const [actions, setActions] = useState([]);
  const [chargement, setChargement] = useState(true);
  // Une source qui n'a pas pu être lue n'est pas une source vide : l'écran
  // doit pouvoir le dire plutôt qu'annoncer « tout est traité ».
  const [erreur, setErreur] = useState(null);

  const chargerInspections = useCallback(async () => {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, statut, verrouille_le, updated_at, client_nom_libre, vehicule_libelle_libre, clients (nom), vehicules (marque, modele)")
      .eq("garage_id", garageId)
      .in("statut", ["en_attente_client", "consulte", "partiellement_valide"]);
    if (error) { setErreur("inspections"); return; }
    setInspections(data || []);
  }, [garageId]);

  // Journal complet, sans limite de date : une action ancienne ne doit jamais
  // devenir invisible en silence, et `deriveOpportunites` a besoin de la
  // dernière action même si elle est vieille.
  const chargerActions = useCallback(async () => {
    if (!estProprietaire) { setActions([]); return; }
    const { data, error } = await supabase
      .from("opportunites_actions")
      .select("*")
      .eq("garage_id", garageId)
      .order("created_at", { ascending: false });
    if (error) { setErreur("journal"); return; }
    setActions(data || []);
  }, [garageId, estProprietaire]);

  useEffect(() => {
    if (!garageId) { setChargement(false); return; }
    setChargement(true);
    setErreur(null);
    Promise.all([chargerInspections(), chargerActions()]).finally(() => setChargement(false));
  }, [garageId, chargerInspections, chargerActions]);

  const opportunites = useMemo(
    () => deriveOpportunites({ ...donnees, inspections, actions, handlers }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [donnees.demandes, donnees.propositions, donnees.devisList, donnees.rappelsManques,
     donnees.rendezVous, donnees.travauxDifferes, donnees.clients, inspections, actions],
  );

  const enregistrer = useCallback(async (payload) => {
    const { error } = await supabase.from("opportunites_actions").insert({ garage_id: garageId, ...payload });
    if (error) { onToast?.("Impossible d'enregistrer cette action", "error"); return false; }
    await chargerActions();
    return true;
  }, [garageId, chargerActions, onToast]);

  const traiter = useCallback(async (l) => {
    const ok = await enregistrer({ source_type: l.sourceType, source_id: l.sourceId, action: "traite" });
    if (ok) onToast?.("Marqué traité — rien n'a été envoyé ni facturé");
  }, [enregistrer, onToast]);

  const reporter = useCallback(async (l, motif, masquerJusquAu) => {
    const ok = await enregistrer({ source_type: l.sourceType, source_id: l.sourceId, action: "reporte", motif, masquer_jusqu_au: masquerJusquAu });
    if (ok) onToast?.("Reporté");
    return ok;
  }, [enregistrer, onToast]);

  const reactiver = useCallback(async (l) => {
    const ok = await enregistrer({ source_type: l.sourceType, source_id: l.sourceId, action: "reactiver" });
    if (ok) onToast?.("Remise dans la liste");
  }, [enregistrer, onToast]);

  return { opportunites, actions, chargement, erreur, traiter, reporter, reactiver, journalDisponible: estProprietaire };
}
