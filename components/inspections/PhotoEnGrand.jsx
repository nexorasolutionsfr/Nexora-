"use client";

// Fenêtre « photo en grand » d'un constat de contrôle véhicule.
// Ce que le produit montrait jusqu'ici : une vignette de 64 px, sans interaction —
// le client voyait qu'il y avait une photo, pas ce qu'elle montre.
//
// Cette vue n'ouvre aucun accès nouveau : elle réaffiche l'URL signée déjà obtenue
// pour la vignette (bucket privé, jeton revalidé côté serveur par
// /api/inspections/photos). Elle n'écrit rien : regarder une photo n'est pas une
// décision, et les boutons Valider / Refuser restent en dehors de cette fenêtre.
//
// Styles en ligne : la page client /i/[token] n'utilise pas de classes utilitaires,
// et ce composant doit pouvoir être repris tel quel côté garage plus tard.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MESSAGE_ERREUR_PHOTO,
  actionTouche,
  compteurPhotos,
  indexPrecedent,
  indexSuivant,
  libelleDialogue,
} from "./photoEnGrand";

const NAVY = "#0F1B33";

const styleBouton = {
  border: "1px solid rgba(255,255,255,0.28)",
  background: "rgba(15,27,51,0.72)",
  color: "white",
  borderRadius: 999,
  minHeight: 44,
  minWidth: 44,
  padding: "0 16px",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "-apple-system, sans-serif",
  cursor: "pointer",
};

export default function PhotoEnGrand({ photos = [], indexInitial = 0, titre, commentaire, onFermer }) {
  const total = photos.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(indexInitial, 0), Math.max(total - 1, 0)));
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur
  const [essai, setEssai] = useState(0);
  const fenetreRef = useRef(null);
  const fermerRef = useRef(null);
  const ouvrantRef = useRef(null);

  // Le focus revient à la vignette qui a ouvert la fenêtre, quoi qu'il arrive.
  useEffect(() => {
    ouvrantRef.current = document.activeElement;
    fermerRef.current?.focus();
    const scrollAvant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scrollAvant;
      const cible = ouvrantRef.current;
      if (cible && typeof cible.focus === "function" && document.contains(cible)) cible.focus();
    };
  }, []);

  const aller = useCallback((suivant) => {
    setIndex((i) => (suivant ? indexSuivant(i, total) : indexPrecedent(i, total)));
    setEtat("chargement");
    setEssai(0);
  }, [total]);

  const surTouche = (e) => {
    // Le focus reste dans la fenêtre : Tab boucle entre ses seuls boutons.
    if (e.key === "Tab") {
      const focusables = fenetreRef.current?.querySelectorAll("button");
      if (!focusables || focusables.length === 0) return;
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      return;
    }
    const action = actionTouche(e.key, total);
    if (!action) return;
    e.preventDefault();
    if (action === "fermer") onFermer();
    else aller(action === "suivante");
  };

  if (total === 0) return null;
  const compteur = compteurPhotos(index, total);

  return (
    <div
      ref={fenetreRef}
      role="dialog"
      aria-modal="true"
      aria-label={libelleDialogue(titre)}
      onKeyDown={surTouche}
      onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(8,13,26,0.94)",
        display: "flex",
        flexDirection: "column",
        padding: "max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))",
        fontFamily: "-apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titre}
          {compteur && <span style={{ fontWeight: 400, marginLeft: 8 }}>{compteur}</span>}
        </div>
        <button ref={fermerRef} type="button" onClick={onFermer} style={styleBouton} aria-label="Fermer la photo">
          ✕ Fermer
        </button>
      </div>

      <div
        onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0" }}
      >
        {etat === "erreur" ? (
          <div style={{ maxWidth: 420, textAlign: "center", color: "white", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.86)" }}>{MESSAGE_ERREUR_PHOTO}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" onClick={() => { setEtat("chargement"); setEssai((n) => n + 1); }} style={{ ...styleBouton, background: "white", color: NAVY, border: "none" }}>
                Réessayer
              </button>
              <button type="button" onClick={() => window.location.reload()} style={styleBouton}>
                Recharger la page
              </button>
            </div>
          </div>
        ) : (
          <>
            {etat === "chargement" && (
              <div style={{ position: "absolute", color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Chargement de la photo…</div>
            )}
            <img
              key={`${index}-${essai}`}
              src={photos[index]}
              alt={commentaire ? `${titre} — ${commentaire}` : titre || "Photo du constat"}
              onLoad={() => setEtat("ok")}
              onError={() => setEtat("erreur")}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: 12,
                opacity: etat === "ok" ? 1 : 0,
                transition: "opacity 120ms linear",
              }}
            />
          </>
        )}
      </div>

      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {total > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button type="button" onClick={() => aller(false)} style={styleBouton} aria-label="Photo précédente">‹ Précédente</button>
            <button type="button" onClick={() => aller(true)} style={styleBouton} aria-label="Photo suivante">Suivante ›</button>
          </div>
        )}
        {(titre || commentaire) && (
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", color: "white", maxHeight: "28vh", overflowY: "auto" }}>
            {titre && <div style={{ fontSize: 13, fontWeight: 600 }}>{titre}</div>}
            {commentaire && <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.82)", marginTop: titre ? 4 : 0 }}>{commentaire}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
