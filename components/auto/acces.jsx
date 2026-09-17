"use client";

// Accès à Nexora Auto côté écran. Le mode (bêta, ouvert) est décidé par le
// serveur (app/auto/layout.tsx) ; le droit de la personne connectée est lu en
// base (auto_etat_acces), une fois par compte et par onglet. Les données, elles,
// sont protégées par la base quoi qu'affiche l'écran.

import { createContext, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const ContexteAcces = createContext("ouvert");

export function AccesAutoProvider({ mode, children }) {
  return <ContexteAcces.Provider value={mode}>{children}</ContexteAcces.Provider>;
}

export const useModeAcces = () => useContext(ContexteAcces);

const verifications = new Map();

function verifier(utilisateurId) {
  if (!verifications.has(utilisateurId)) {
    const promesse = supabase
      .rpc("auto_etat_acces")
      .then(({ data, error }) => (error ? { autorise: false, erreur: true } : { mode: data?.mode ?? "ferme", autorise: data?.autorise === true }))
      .catch(() => ({ autorise: false, erreur: true }));
    // Une erreur réseau n'est pas mémorisée : la prochaine page réessaie.
    promesse.then((r) => {
      if (r.erreur) verifications.delete(utilisateurId);
    });
    verifications.set(utilisateurId, promesse);
  }
  return verifications.get(utilisateurId);
}

// undefined tant qu'on ne sait pas ; { mode, autorise, erreur? } ensuite ;
// null sans session.
export function useAccesPersonne(session) {
  const utilisateurId = session?.user?.id ?? null;
  const [etat, setEtat] = useState({ pour: null, acces: undefined });
  useEffect(() => {
    if (!utilisateurId) return undefined;
    let actif = true;
    verifier(utilisateurId).then((acces) => {
      if (actif) setEtat({ pour: utilisateurId, acces });
    });
    return () => {
      actif = false;
    };
  }, [utilisateurId]);
  if (!utilisateurId) return null;
  return etat.pour === utilisateurId ? etat.acces : undefined;
}
