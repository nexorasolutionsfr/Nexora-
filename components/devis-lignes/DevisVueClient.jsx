"use client";

import { useState } from "react";
import PhotoEnGrand from "../inspections/PhotoEnGrand";
import { euros } from "./vueClient";

// Le devis tel que le client l'ouvre. Rendu à l'identique sur la page publique
// et dans l'aperçu du garage : voir vueClient.js. `children` reçoit ce qui
// diffère — les boutons actifs chez le client, inertes dans l'aperçu.
//
// `photoUrls` : chemin → URL signée, fourni par la page publique après
// revalidation du jeton (/api/devis/preuves). Absent dans l'aperçu du garage :
// seule la phrase du constat y figure.
export default function DevisVueClient({ vue = null, photoUrls = null, children = null }) {
  const [photoOuverte, setPhotoOuverte] = useState(null);
  if (!vue) return null;
  return (
    <>
      <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{vue.garage}</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{vue.vehicule}</div>
        {vue.prestation && <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{vue.prestation}</div>}
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{euros(vue.montantTtc)}</div>
      </div>

      {vue.lignes.length > 0 && (
        <div style={{ background: "white", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid #E7EAF0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1B33", marginBottom: 10 }}>Détail du devis</div>
          {vue.lignes.map((l) => {
            const photos = photoUrls && l.preuve ? l.preuve.photos.map((c) => photoUrls[c]).filter(Boolean) : [];
            const photosIndisponibles = Boolean(photoUrls && l.preuve && l.preuve.photos.length > 0 && photos.length === 0);
            return (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #F1F3F7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: "#0F1B33" }}>{l.libelle}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F1B33", whiteSpace: "nowrap" }}>{euros(l.montantTtc)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  {l.type} · {l.quantite} × {euros(l.prixUnitaireHt)} HT · TVA {l.tauxTva} %
                </div>
                {l.preuve && (l.preuve.constat || photos.length > 0 || photosIndisponibles) && (
                  <div style={{ marginTop: 8, padding: "8px 10px", background: "#F8FAFC", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.3 }}>Constat du garage</div>
                    {l.preuve.constat && <div style={{ fontSize: 12.5, color: "#334155", marginTop: 2 }}>{l.preuve.constat}</div>}
                    {photos.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {photos.map((url, i) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setPhotoOuverte({ urls: photos, index: i, titre: l.libelle, commentaire: l.preuve.constat })}
                            aria-label={`Voir la photo du constat en grand — ${l.libelle}${photos.length > 1 ? ` (${i + 1} sur ${photos.length})` : ""}`}
                            style={{ padding: 0, border: "1px solid #E2E8F0", borderRadius: 9, background: "white", cursor: "pointer", lineHeight: 0 }}
                          >
                            <img src={url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", display: "block" }} />
                          </button>
                        ))}
                        <span style={{ fontSize: 11.5, color: "#94A3B8" }}>Touchez la photo pour l&apos;agrandir</span>
                      </div>
                    )}
                    {photosIndisponibles && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>La photo n&apos;a pas pu être affichée pour l&apos;instant.</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 12, fontSize: 13, color: "#475569" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total HT</span><span>{euros(vue.montantHt)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span>TVA</span><span>{euros(vue.montantTva)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #E7EAF0", fontSize: 15, fontWeight: 700, color: "#0F1B33" }}>
              <span>Total TTC</span><span>{euros(vue.montantTtc)}</span>
            </div>
          </div>
        </div>
      )}

      {children}

      {photoOuverte && (
        <PhotoEnGrand photos={photoOuverte.urls} indexInitial={photoOuverte.index} titre={photoOuverte.titre} commentaire={photoOuverte.commentaire} onFermer={() => setPhotoOuverte(null)} />
      )}
    </>
  );
}
