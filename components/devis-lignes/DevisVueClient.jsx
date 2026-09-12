"use client";

import { euros } from "./vueClient";

// Le devis tel que le client l'ouvre. Rendu à l'identique sur la page publique
// et dans l'aperçu du garage : voir vueClient.js. `children` reçoit ce qui
// diffère — les boutons actifs chez le client, inertes dans l'aperçu.
export default function DevisVueClient({ vue = null, children = null }) {
  if (!vue) return null;
  return (
    <>
      <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{vue.garage}</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{vue.vehicule}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{vue.prestation}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{euros(vue.montantTtc)}</div>
      </div>

      {vue.lignes.length > 0 && (
        <div style={{ background: "white", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid #E7EAF0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1B33", marginBottom: 10 }}>Détail du devis</div>
          {vue.lignes.map((l) => (
            <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #F1F3F7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "#0F1B33" }}>{l.libelle}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F1B33", whiteSpace: "nowrap" }}>{euros(l.montantTtc)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                {l.type} · {l.quantite} × {euros(l.prixUnitaireHt)} HT · TVA {l.tauxTva} %
              </div>
            </div>
          ))}
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
    </>
  );
}
