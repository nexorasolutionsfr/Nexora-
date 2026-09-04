"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TYPE_LABEL = { main_oeuvre: "Main d'œuvre", piece: "Pièce" };

const euros = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} €`;

const RAISON_MESSAGE = {
  inconnu: "Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier.",
  expire: "Ce lien a expiré. Contactez votre garage pour obtenir un nouveau lien.",
  revoque: "Ce lien a été révoqué par le garage. Contactez-le pour obtenir un nouveau lien.",
};

export default function DevisTokenPage({ params }) {
  const { token } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [raison, setRaison] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("lire_devis_par_jeton", { p_token: token });
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

  const repondre = async (choix) => {
    setSaving(true);
    setSaveError("");
    const { data, error } = await supabase.rpc("repondre_devis_par_jeton", { p_token: token, p_reponse: choix });
    setSaving(false);
    if (error || !data || data.ok !== true) {
      if (data?.raison === "deja_repondu") {
        setSaveError("Vous avez déjà répondu à ce devis — votre réponse précédente reste valable.");
        await load();
        return;
      }
      setSaveError("Impossible d'enregistrer votre réponse. Réessayez ou contactez votre garage.");
      return;
    }
    setConfirmation(data.statut);
    setInfo((prev) => (prev ? { ...prev, statut: data.statut } : prev));
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

  const reponse = confirmation || (info.statut !== "en_attente" ? info.statut : null);
  const lignes = Array.isArray(info.lignes) ? info.lignes : [];
  const totalTva = Number(info.montant_ttc || 0) - Number(info.montant_ht || 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ background: "#0F1B33", color: "white", borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{info.garage_nom || "Votre garage"}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{info.vehicule || "Véhicule"}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{info.prestation || "—"}</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>{euros(info.montant_ttc)}</div>
        </div>

        {lignes.length > 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid #E7EAF0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1B33", marginBottom: 10 }}>Détail du devis</div>
            {lignes.map((l) => (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #F1F3F7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: "#0F1B33" }}>{l.libelle}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F1B33", whiteSpace: "nowrap" }}>{euros(l.montant_ttc)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  {TYPE_LABEL[l.type] || l.type} · {Number(l.quantite)} × {euros(l.prix_unitaire_ht)} HT · TVA {Number(l.taux_tva)} %
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 13, color: "#475569" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total HT</span><span>{euros(info.montant_ht)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span>TVA</span><span>{euros(totalTva)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #E7EAF0", fontSize: 15, fontWeight: 700, color: "#0F1B33" }}>
                <span>Total TTC</span><span>{euros(info.montant_ttc)}</span>
              </div>
            </div>
          </div>
        )}
        {reponse ? (
          <div style={{ fontSize: 16, fontWeight: 600, color: reponse === "accepte" ? "#16A34A" : "#DC2626", textAlign: "center" }}>
            {reponse === "accepte" ? "Vous avez accepté ce devis." : "Vous avez refusé ce devis."}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                disabled={saving}
                onClick={() => repondre("accepte")}
                style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", background: "#16A34A", color: "white", fontSize: 15, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
              >
                Accepter
              </button>
              <button
                disabled={saving}
                onClick={() => repondre("refuse")}
                style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "1px solid #DC2626", background: "white", color: "#DC2626", fontSize: 15, fontWeight: 600, opacity: saving ? 0.6 : 1 }}
              >
                Refuser
              </button>
            </div>
            {saving && <div style={{ marginTop: 12, fontSize: 13, color: "#64748B", textAlign: "center" }}>Enregistrement…</div>}
          </>
        )}
        {saveError && <div style={{ marginTop: 12, fontSize: 13, color: "#DC2626", textAlign: "center" }}>{saveError}</div>}
      </div>
    </div>
  );
}
