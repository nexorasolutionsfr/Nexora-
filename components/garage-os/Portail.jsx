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
