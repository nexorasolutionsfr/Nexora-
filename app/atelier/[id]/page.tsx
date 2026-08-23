"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ETAPES = [
  { key: "depose", label: "Véhicule déposé", color: "#3D6BE0" },
  { key: "diagnostic", label: "Diagnostic", color: "#7C3AED" },
  { key: "attente_client", label: "En attente client", color: "#D97706" },
  { key: "attente_piece", label: "Attente pièce", color: "#EA580C" },
  { key: "intervention", label: "En intervention", color: "#0F766E" },
  { key: "pret", label: "Prêt", color: "#16A34A" },
  { key: "restitue", label: "Restitué", color: "#475569" },
];

export default function AtelierScanPage({ params }) {
  const { id } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("lire_etape_atelier", { rdv_id: id });
      if (error || !data || !data.length) {
        setError("Rendez-vous introuvable.");
      } else {
        setInfo(data[0]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function choisir(etape) {
    setSaving(true);
    const { error } = await supabase.rpc("avancer_etape_atelier", { rdv_id: id, nouveau_statut: etape });
    setSaving(false);
    if (error) {
      setError("Impossible de mettre à jour.");
      return;
    }
    setInfo((prev) => (prev ? { ...prev, statut_atelier: etape } : prev));
  }

  if (loading) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Chargement...</div>;
  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#DC2626" }}>{error}</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.client}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.prestation}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#0F1B33" }}>Où en est ce véhicule ?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ETAPES.map((etape) => (
            <button
              key={etape.key}
              disabled={saving}
              onClick={() => choisir(etape.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderRadius: 12,
                border: info.statut_atelier === etape.key ? `2px solid ${etape.color}` : "1px solid #E2E8F0",
                background: info.statut_atelier === etape.key ? `${etape.color}1A` : "white",
                fontSize: 15,
                fontWeight: 500,
                textAlign: "left",
                color: "#0F1B33",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: etape.color }} />
              {etape.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
