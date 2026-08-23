"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DevisPublicPage({ params }) {
  const { id } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reponse, setReponse] = useState(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("lire_devis_public", { p_devis_id: id });
      if (error || !data || !data.length) {
        setError("Devis introuvable.");
      } else {
        setInfo(data[0]);
        if (data[0].statut !== "en_attente") setReponse(data[0].statut);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function repondre(choix) {
    setSaving(true);
    const { error } = await supabase.rpc("repondre_devis_public", { p_devis_id: id, p_reponse: choix });
    setSaving(false);
    if (error) {
      setError("Impossible d'enregistrer votre réponse.");
      return;
    }
    setReponse(choix);
  }

  if (loading) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Chargement...</div>;
  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#DC2626" }}>{error}</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.garage_nom || "Votre garage"}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.prestation}</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{info.montant_ttc} €</div>
        </div>
        {reponse ? (
          <div style={{ fontSize: 16, fontWeight: 600, color: reponse === "accepte" ? "#16A34A" : "#DC2626" }}>
            {reponse === "accepte" ? "Vous avez accepté ce devis." : "Vous avez refusé ce devis."}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button disabled={saving} onClick={() => repondre("accepte")} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", background: "#16A34A", color: "white", fontSize: 15, fontWeight: 600 }}>
              Accepter
            </button>
            <button disabled={saving} onClick={() => repondre("refuse")} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "1px solid #DC2626", background: "white", color: "#DC2626", fontSize: 15, fontWeight: 600 }}>
              Refuser
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
