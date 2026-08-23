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
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }
