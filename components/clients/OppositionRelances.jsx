"use client";

// Le premier prérequis des relances de travaux différés : pouvoir enregistrer,
// depuis la fiche du client, qu'il refuse d'être relancé par e-mail.
//
// L'écriture passe par `revenue_recovery_enregistrer_permission` (machine à
// états, titulaire du compte garage seulement) ; la lecture par la vue
// `revenue_recovery_permissions_courant`. Aucune réautorisation depuis cet
// écran : lever une opposition exige une preuve nouvelle, et la base juridique
// d'une relance commerciale reste à valider.

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import { ORIGINE_DECLARATIF_GARAGE, libelleOpposition, messageErreurOpposition } from "./opposition";

// LE JOURNAL N'EST LISIBLE QUE PAR LE TITULAIRE DU GARAGE
//
// Politique `revenue_recovery_permissions_isolation` : `owner_user_id =
// auth.uid()`. Pour un compte accueil (ou un dirigeant qui n'est pas titulaire),
// la lecture revient vide — et l'écran affichait « aucune opposition
// enregistrée » pour un client qui s'était opposé (recette du 15 septembre
// 2026). Rien plutôt qu'une information fausse : le bloc ne s'affiche qu'au
// titulaire. L'ouvrir à l'équipe demande une migration de politique.
export default function OppositionRelances({ garageId, clientId, proprietaireId = null, onToast, supabase = supabaseClient }) {
  const [courant, setCourant] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [titulaire, setTitulaire] = useState(null);

  useEffect(() => {
    let annule = false;
    if (!proprietaireId) { setTitulaire(false); return; }
    supabase.auth.getSession().then(({ data }) => { if (!annule) setTitulaire(data?.session?.user?.id === proprietaireId); });
    return () => { annule = true; };
  }, [supabase, proprietaireId]);

  useEffect(() => {
    if (!titulaire) return;
    if (!garageId || !clientId) { setCourant(null); return; }
    let annule = false;
    setCourant(undefined);
    supabase
      .from("revenue_recovery_permissions_courant")
      .select("statut, created_at, origine")
      .eq("garage_id", garageId)
      .eq("client_id", clientId)
      .eq("canal", "email")
      .maybeSingle()
      .then(({ data, error }) => { if (!annule) setCourant(error ? null : data || null); });
    return () => { annule = true; };
  }, [supabase, garageId, clientId, titulaire]);

  if (!titulaire || courant === undefined) return null;
  const peutEnregistrer = titulaire;
  const libelle = libelleOpposition(courant);

  const enregistrer = async () => {
    if (busy || libelle.oppose) return;
    if (typeof window !== "undefined" && !window.confirm("Enregistrer que ce client refuse les relances de travaux par e-mail ?\n\nAucune relance ne lui sera préparée ni envoyée. Les devis et factures ne sont pas concernés.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("revenue_recovery_enregistrer_permission", {
      p_garage_id: garageId,
      p_client_id: clientId,
      p_canal: "email",
      p_statut: "oppose",
      p_origine: ORIGINE_DECLARATIF_GARAGE,
      p_motif: "le client ne souhaite plus être relancé par e-mail",
    });
    setBusy(false);
    if (error) { onToast?.(messageErreurOpposition(error), "error"); return; }
    setCourant(data || { statut: "oppose", created_at: new Date().toISOString() });
    onToast?.("Opposition enregistrée : aucune relance de travaux ne sera préparée pour ce client.");
  };

  return (
    <div className={`mt-4 rounded-xl border px-3.5 py-3 flex items-start justify-between gap-3 flex-wrap ${libelle.oppose ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0 flex items-start gap-2.5">
        <BellOff size={15} className={libelle.oppose ? "text-amber-700 mt-0.5 shrink-0" : "text-slate-400 mt-0.5 shrink-0"} />
        <div className="min-w-0">
          <div className={`text-[13px] font-medium ${libelle.oppose ? "text-amber-800" : "text-slate-700"}`}>{libelle.titre}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{libelle.detail}</div>
        </div>
      </div>
      {!libelle.oppose && peutEnregistrer && (
        <button type="button" onClick={enregistrer} disabled={busy} className="shrink-0 min-h-[40px] px-3 rounded-lg text-[12.5px] font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {busy ? "Enregistrement…" : "Le client refuse les relances"}
        </button>
      )}
    </div>
  );
}
