"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import FactureVueClient from "@/components/facture-vue-client/FactureVueClient";
import { vueDepuisLecturePublique } from "@/components/facture-vue-client/vueFacture";

const RAISON_MESSAGE = {
  inconnu: "Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier.",
  expire: "Ce lien a expiré. Contactez votre garage pour obtenir un nouveau lien.",
  revoque: "Ce lien a été révoqué par le garage. Contactez-le pour obtenir un nouveau lien.",
};

// La facture telle que le client l'ouvre. Le dessin est partagé avec l'aperçu
// que le garage relit avant d'envoyer (FactureVueClient) : ce qu'il valide est
// ce que le client voit.
export default function FactureTokenPage({ params }) {
  const { token } = use(params);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [raison, setRaison] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("lire_facture_par_jeton", { p_token: token });
      if (error || !data || data.ok !== true) {
        setRaison(data?.raison || "inconnu");
        setLoading(false);
        return;
      }
      setInfo(data);
      setLoading(false);
    }
    load();
  }, [token]);

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

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <FactureVueClient vue={vueDepuisLecturePublique(info)} />
      </div>
    </div>
  );
}
