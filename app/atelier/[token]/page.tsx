"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ETAPES = [
  { key: "a_venir", label: "À venir", color: "#64748B" },
  { key: "depose", label: "Véhicule déposé", color: "#3D6BE0" },
  { key: "diagnostic", label: "Diagnostic", color: "#7C3AED" },
  { key: "attente_client", label: "En attente client", color: "#D97706" },
  { key: "attente_piece", label: "Attente pièce", color: "#EA580C" },
  { key: "intervention", label: "En intervention", color: "#0F766E" },
  { key: "pret", label: "Prêt", color: "#16A34A" },
  { key: "restitue", label: "Restitué", color: "#475569" },
];

const RAISON_MESSAGE = {
  inconnu: "Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier.",
  expire: "Ce lien a expiré. Contactez votre garage pour obtenir un nouveau lien.",
  revoque: "Ce lien a été révoqué par le garage. Contactez-le pour obtenir un nouveau lien.",
};

export default function AtelierTokenPage({ params }) {
  const { token } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [raison, setRaison] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = async () => {
    const { data, error } = await supabase.rpc("lire_atelier_par_jeton", { p_token: token });
    if (error || !data || data.ok !== true) {
      setRaison(data?.raison || "inconnu");
      setLoading(false);
      return;
    }
    setInfo(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const choisir = async (etape) => {
    if (saving || etape === info?.statut_atelier) return;
    setSaving(true);
    setSaveError("");
    const { data, error } = await supabase.rpc("avancer_etape_atelier_par_jeton", { p_token: token, p_nouveau_statut: etape });
    setSaving(false);
    if (error || !data || data.ok !== true) {
      setSaveError("Cette étape ne peut pas être choisie directement depuis l'étape actuelle. Avancez pas à pas.");
      return;
    }
    setInfo((prev) => (prev ? { ...prev, statut_atelier: data.statut_atelier } : prev));
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif", color: "#64748B" }}>
        Chargement...
      </div>
    );
  }

  if (raison) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, textAlign: "center", color: "#475569" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F1B33" }}>Ce lien est indisponible</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>{RAISON_MESSAGE[raison] || RAISON_MESSAGE.inconnu}</div>
        </div>
      </div>
    );
  }

  const etapeIdx = ETAPES.findIndex((e) => e.key === info.statut_atelier);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.garage_nom || "Votre garage"}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule || "Véhicule"}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.prestation || "—"}</div>
          {info.debut && (
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.debut} – {info.fin}</div>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#0F1B33" }}>Où en est ce véhicule ?</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>
          Changez d'étape uniquement dans l'ordre — une seule étape à la fois.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ETAPES.map((etape, idx) => {
            const estActuelle = idx === etapeIdx;
            const estAtteignable = Math.abs(idx - etapeIdx) === 1;
            return (
              <button
                key={etape.key}
                disabled={saving || (!estActuelle && !estAtteignable)}
                onClick={() => choisir(etape.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: estActuelle ? `2px solid ${etape.color}` : "1px solid #E2E8F0",
                  background: estActuelle ? `${etape.color}1A` : "white",
                  fontSize: 15,
                  fontWeight: 500,
                  textAlign: "left",
                  color: estAtteignable || estActuelle ? "#0F1B33" : "#CBD5E1",
                  opacity: saving ? 0.6 : 1,
                  cursor: saving || (!estActuelle && !estAtteignable) ? "default" : "pointer",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: etape.color, opacity: estAtteignable || estActuelle ? 1 : 0.35 }} />
                {etape.label}
                {estActuelle && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: etape.color }}>Actuel</span>}
              </button>
            );
          })}
        </div>
        {saving && <div style={{ marginTop: 12, fontSize: 13, color: "#64748B", textAlign: "center" }}>Enregistrement…</div>}
        {saveError && <div style={{ marginTop: 12, fontSize: 13, color: "#DC2626", textAlign: "center" }}>{saveError}</div>}
      </div>
    </div>
  );
}
