"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ACCENT } from "../garage-os/tokens";
import {
  aideMotif,
  formaterAnciennete,
  traduireErreurNotification,
  traduireMotif,
  trierNotifications,
} from "./calculs";

// Notifications de devis résilientes V1.
//
// Ce composant n'accède JAMAIS à la table notifications_devis en direct :
// elle est fermée par RLS sans policy, et l'accès applicatif passe
// exclusivement par trois RPC (migration 20260903000100). Aucune de ces
// RPC ne prend d'identifiant de garage : le périmètre est déterminé côté
// serveur par public.current_garage_id(). Le navigateur ne peut donc pas
// choisir le garage qu'il consulte.

function Badge({ children, tone = "amber" }) {
  const tones = {
    amber: { bg: "#FEF3E2", text: "#B45309" },
    slate: { bg: "#F1F5F9", text: "#475569" },
    red: { bg: "#FDECEC", text: "#B91C1C" },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span
      className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-block"
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      {children}
    </span>
  );
}

export default function NotificationsAVerifierSection({ onToast, onCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [busyId, setBusyId] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    const { data, error } = await supabase.rpc("notifications_a_verifier");
    if (error) {
      setErreur(traduireErreurNotification(error));
      setNotifications([]);
      if (typeof onCountChange === "function") onCountChange(0);
    } else {
      const liste = trierNotifications(data || []);
      setNotifications(liste);
      if (typeof onCountChange === "function") onCountChange(liste.length);
    }
    setChargement(false);
  }, [onCountChange]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function agir(id, rpc, messageSucces) {
    setBusyId(id);
    const { error } = await supabase.rpc(rpc, { p_id: id });
    setBusyId(null);
    if (error) {
      const message = traduireErreurNotification(error);
      if (typeof onToast === "function") onToast(message);
      else setErreur(message);
      // La liste peut être périmée (traitement concurrent côté n8n) :
      // on la recharge systématiquement après un refus.
      charger();
      return;
    }
    if (typeof onToast === "function") onToast(messageSucces);
    charger();
  }

  if (chargement) {
    return (
      <div className="px-1 py-6 text-[13.5px] text-slate-500">
        Chargement des notifications à vérifier…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="px-1 py-6">
        <div className="rounded-xl border p-4" style={{ borderColor: "#FDE0E0", backgroundColor: "#FDECEC" }}>
          <div className="flex items-center gap-2 text-[13.5px] font-medium" style={{ color: "#B91C1C" }}>
            <AlertTriangle size={16} />
            {erreur}
          </div>
          <button
            onClick={charger}
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border"
            style={{ borderColor: "#E2E8F0", backgroundColor: "#fff", color: "#334155" }}
          >
            <RefreshCw size={13} />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="px-1 py-6">
        <div className="text-[15px] font-semibold" style={{ color: "#0F1B33" }}>
          Notifications à vérifier
        </div>
        <div className="mt-1.5 text-[13.5px] text-slate-500">
          Aucune notification bloquée. Tout part normalement.
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "#0F1B33" }}>
            Notifications à vérifier
          </div>
          <div className="mt-0.5 text-[12.5px] text-slate-500">
            Ces notifications n&apos;ont pas pu être envoyées : une information manque.
          </div>
        </div>
        <button
          onClick={charger}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "#E2E8F0", backgroundColor: "#fff", color: "#334155" }}
        >
          <RefreshCw size={13} />
          Actualiser
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {notifications.map((n) => {
          const enCours = busyId === n.id;
          const aide = aideMotif(n.motif);
          return (
            <div
              key={n.id}
              className="rounded-xl border p-3.5"
              style={{ borderColor: "#E7ECF3", backgroundColor: "#fff" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">{traduireMotif(n.motif)}</Badge>
                <span className="text-[12.5px] text-slate-500">Devis concerné</span>
                <span className="text-[12.5px] text-slate-400">
                  {formaterAnciennete(n.cree_le)}
                </span>
              </div>

              {aide && (
                <div className="mt-2 text-[13px] text-slate-600">{aide}</div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  disabled={enCours}
                  onClick={() =>
                    agir(n.id, "notification_reessayer", "Notification remise en file.")
                  }
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Check size={13} />
                  {enCours ? "…" : "Réessayer"}
                </button>
                <button
                  disabled={enCours}
                  onClick={() =>
                    agir(n.id, "notification_abandonner", "Notification abandonnée.")
                  }
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50"
                  style={{ borderColor: "#E2E8F0", backgroundColor: "#fff", color: "#334155" }}
                >
                  <X size={13} />
                  {enCours ? "…" : "Abandonner"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
