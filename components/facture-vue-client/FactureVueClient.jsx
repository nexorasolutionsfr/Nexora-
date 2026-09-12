"use client";

import { euros } from "./vueFacture";

// La facture telle que le client l'ouvre. Rendue à l'identique sur la page
// publique et dans l'aperçu du garage : voir vueFacture.js.
export default function FactureVueClient({ vue = null }) {
  if (!vue) return null;
  return (
    <>
      <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{vue.garage}</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>Facture {vue.numero}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{vue.vehicule}{vue.motif ? ` · ${vue.motif}` : ""}</div>
        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{euros(vue.montantTtc)} TTC</div>
        <div style={{ fontSize: 13, marginTop: 8, color: vue.payee ? "#4ADE80" : "#FBBF24" }}>
          {vue.payee ? "✓ Payée" : "En attente de paiement"}
        </div>
      </div>

      {vue.lignes.length > 0 && (
        <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 10 }}>Détail</div>
          {vue.lignes.map((l, i) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", padding: "6px 0", borderTop: i > 0 ? "1px solid #F1F5F9" : "none" }}>
              <span>{l.description}</span>
              <span>{euros(l.montant)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
