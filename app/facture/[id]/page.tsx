"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function FacturePublicPage({ params }) {
  const { id } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("lire_facture_publique", { p_facture_id: id });
      if (error || !data || !data.length) {
        setError("Facture introuvable.");
      } else {
        setInfo(data[0]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Chargement...</div>;
  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#DC2626" }}>{error}</div>;

  const lignes = Array.isArray(info.lignes) && info.lignes.length ? info.lignes : [];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.garage_nom || "Votre garage"}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>Facture {info.numero}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.vehicule}{info.motif ? ` · ${info.motif}` : ""}</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{Number(info.montant_ttc || 0).toFixed(2)} € TTC</div>
          <div style={{ fontSize: 13, marginTop: 8, color: info.statut === "payee" ? "#4ADE80" : "#FBBF24" }}>
            {info.statut === "payee" ? "✓ Payée" : "En attente de paiement"}
          </div>
        </div>

        {lignes.length > 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 10 }}>Détail</div>
            {lignes.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", padding: "6px 0", borderTop: i > 0 ? "1px solid #F1F5F9" : "none" }}>
                <span>{l.description}</span>
                <span>{((Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0)).toFixed(2)} €</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
