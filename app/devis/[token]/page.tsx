"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DevisVueClient from "@/components/devis-lignes/DevisVueClient";
import { vueDepuisPagePublique } from "@/components/devis-lignes/vueClient";

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
  const [photoUrls, setPhotoUrls] = useState({});
  // Une lecture qui échoue (réseau, service) n'est pas un lien invalide : dire
  // « ce lien n'est pas valable » à un client dont la connexion a hoqueté
  // l'enverrait appeler le garage pour rien.
  const [erreurTechnique, setErreurTechnique] = useState(false);

  const load = async () => {
    setErreurTechnique(false);
    const { data, error } = await supabase.rpc("lire_devis_par_jeton", { p_token: token });
    if (error || !data) {
      setErreurTechnique(true);
      setLoading(false);
      return;
    }
    if (data.ok !== true) {
      setRaison(data.raison || "inconnu");
      setLoading(false);
      return;
    }
    setRaison("");
    setInfo(data);
    setLoading(false);
    // Les photos des constats : signées côté serveur après revalidation du
    // jeton. Une photo qui ne se signe pas n'empêche pas de lire le devis.
    const aDesPhotos = (data.lignes || []).some((l) => (l?.preuve?.photos || []).length > 0);
    if (!aDesPhotos) { setPhotoUrls({}); return; }
    try {
      const res = await fetch("/api/devis/preuves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const corps = await res.json();
      setPhotoUrls(res.ok ? corps.urls || {} : {});
    } catch {
      setPhotoUrls({});
    }
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

  if (erreurTechnique) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 420, textAlign: "center", color: "#475569" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0F1B33" }}>Le devis n&apos;a pas pu être chargé</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>La connexion a peut-être été interrompue. Votre lien reste valable.</div>
          <button
            type="button"
            onClick={() => { setLoading(true); load(); }}
            style={{ marginTop: 16, padding: "12px 18px", borderRadius: 12, border: "none", background: "#0F1B33", color: "white", fontSize: 15, fontWeight: 600 }}
          >
            Réessayer
          </button>
        </div>
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

  // Le dessin du devis est partagé avec l'aperçu du garage (DevisVueClient) :
  // ce que le garage relit avant d'envoyer est ce que le client voit ici.
  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <DevisVueClient vue={vueDepuisPagePublique(info)} photoUrls={photoUrls} />
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
