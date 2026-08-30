"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const REPONSES = {
  confirme_par_client: { label: "Vous avez confirmé ce rendez-vous.", color: "#16A34A" },
  report_demande: { label: "Votre demande de report a été transmise au garage. Il revient vers vous pour proposer un nouveau créneau.", color: "#D97706" },
  annule_par_client: { label: "Vous avez annulé ce rendez-vous.", color: "#DC2626" },
};

export default function ConfirmationRdvPublicPage({ params }) {
  const { id } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reponse, setReponse] = useState(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("lire_confirmation_rdv_public", { p_rdv_id: id });
      if (error || !data || !data.length) {
        setError("Rendez-vous introuvable ou rappel non envoyé pour ce rendez-vous.");
      } else {
        setInfo(data[0]);
        if (data[0].statut_confirmation && data[0].statut_confirmation !== "en_attente_confirmation") {
          setReponse(data[0].statut_confirmation);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function repondre(choix) {
    setSaving(true);
    const { error } = await supabase.rpc("repondre_confirmation_rdv_public", { p_rdv_id: id, p_reponse: choix });
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
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule || "Votre véhicule"}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.prestation || "Rendez-vous"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
            {new Date(info.date_debut).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div style={{ fontSize: 15, opacity: 0.85, marginTop: 2 }}>{info.debut} – {info.fin}</div>
        </div>
        {reponse ? (
          <div style={{ fontSize: 15, fontWeight: 600, color: REPONSES[reponse]?.color || "#0F1B33", lineHeight: 1.5 }}>
            {REPONSES[reponse]?.label || "Votre réponse a été enregistrée."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button disabled={saving} onClick={() => repondre("confirme_par_client")} style={{ padding: "14px 16px", borderRadius: 12, border: "none", background: "#16A34A", color: "white", fontSize: 15, fontWeight: 600 }}>
              Confirmer le rendez-vous
            </button>
            <button disabled={saving} onClick={() => repondre("report_demande")} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #D97706", background: "white", color: "#D97706", fontSize: 15, fontWeight: 600 }}>
              Demander un report
            </button>
            <button disabled={saving} onClick={() => repondre("annule_par_client")} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #DC2626", background: "white", color: "#DC2626", fontSize: 15, fontWeight: 600 }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
