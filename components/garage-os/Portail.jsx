"use client";

// Une fenêtre modale rendue hors de l'arbre de l'écran qui l'ouvre.
//
// Pourquoi : l'en-tête de page est `sticky z-30` et le contenu des écrans vit
// dans un conteneur qui forme son propre contexte d'empilement. Une fenêtre
// `fixed inset-0 z-50` rendue DANS ce contenu passe donc sous l'en-tête —
// sur téléphone, où la fenêtre occupe tout l'écran, ses 250 premiers pixels
// (titre, barre de progression, bouton fermer) étaient recouverts. Mesuré à
// 375 px le 14 septembre 2026 sur « Saisie du contrôle ». Rendre la fenêtre
// dans `document.body` la sort de ce contexte ; rien d'autre ne change.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Portail({ children }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);
  if (!monte || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

const FOCALISABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Le focus reste dans la fenêtre : Tab et Maj+Tab bouclent entre ses éléments.
 *
 * Même règle que PhotoEnGrand, pour les fenêtres qui ont des champs. À poser
 * en `onKeyDown` sur l'élément `role="dialog"`. Elle ne fait rien :
 *   - pour une autre touche que Tab ;
 *   - si une fenêtre imbriquée (la photo en grand) a déjà traité la touche ou
 *     détient le focus — c'est à elle de le garder.
 * Elle ne remplace aucun comportement natif : Entrée et Espace restent ceux
 * du navigateur.
 */
export function garderLeFocus(e, conteneur) {
  if (e.key !== "Tab" || e.defaultPrevented || !conteneur) return;
  const actif = document.activeElement;
  const fenetreDuFocus = actif?.closest?.('[role="dialog"]');
  if (fenetreDuFocus && fenetreDuFocus !== conteneur) return;
  const focalisables = [...conteneur.querySelectorAll(FOCALISABLES)].filter(
    (el) => !el.closest('[role="dialog"]') || el.closest('[role="dialog"]') === conteneur,
  );
  if (focalisables.length === 0) return;
  const premier = focalisables[0];
  const dernier = focalisables[focalisables.length - 1];
  if (!conteneur.contains(actif)) { e.preventDefault(); premier.focus(); return; }
  if (e.shiftKey && actif === premier) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && actif === dernier) { e.preventDefault(); premier.focus(); }
}
