"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Send, ShieldAlert, Clock, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { document as documentEnvoi, gestes, lireEtat, messageApresValidation, messageRefusValidation } from "./etatsEnvoi";

const ACCENT = "#3D6BE0";

// Envoyer un devis ou une facture au client : deux gestes, jamais confondus.
//
//   Le lien à transmettre soi-même vit ailleurs dans la carte et n'envoie rien.
//   Ici, on montre le destinataire et le message, puis on confirme.
//
// L'aperçu vient de `apercu_message_devis` / `apercu_message_facture`, qui
// composent le message exactement comme le traitement l'écrit : ce qui est
// relu est ce qui partira, au lien près, qui n'existe qu'au moment de l'envoi.
//
// `cle` change quand le document change (montant, statut) : l'état d'envoi est
// alors relu, pour qu'une carte restée ouverte ne mente pas.
//
// `document` vaut "devis" ou "facture". Les droits sont contrôlés en base par
// les fonctions appelées, jamais ici.
export default function EnvoiDocument({ document = "devis", documentId, cle = null, onToast }) {
  const doc = documentEnvoi(document);
  const GESTES = gestes(document);
  const [etat, setEtat] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const relireEtat = useCallback(async () => {
    const { data, error } = await supabase.rpc(doc.rpcEtat, { [doc.idParam]: documentId });
    if (error) return;
    setEtat(lireEtat(data, document));
  }, [doc.rpcEtat, doc.idParam, documentId, document]);

  // L'état est relu à l'ouverture de l'écran : revenir sur la carte montre ce
  // qui a été enregistré, pas ce que le navigateur avait gardé en mémoire.
  useEffect(() => { relireEtat(); }, [relireEtat, cle]);

  // « Cet écran affichera « Envoyé » quand le message sera parti » : encore
  // faut-il le relire. Rejeu du 2026-09-11 : le message était parti, la carte
  // restée ouverte disait toujours « en attente ». Tant qu'un envoi est en
  // file ou en cours, l'état est relu régulièrement et au retour sur l'onglet.
  const enSuspens = etat?.cle === "en_attente_envoi" || etat?.cle === "envoi_en_cours";
  useEffect(() => {
    if (!enSuspens) return undefined;
    const minuteur = setInterval(relireEtat, 20_000);
    const auRetour = () => { if (window.document.visibilityState === "visible") relireEtat(); };
    window.addEventListener("focus", auRetour);
    window.document.addEventListener("visibilitychange", auRetour);
    return () => {
      clearInterval(minuteur);
      window.removeEventListener("focus", auRetour);
      window.document.removeEventListener("visibilitychange", auRetour);
    };
  }, [enSuspens, relireEtat]);

  const ouvrirApercu = async () => {
    setOccupe(true);
    const { data, error } = await supabase.rpc(doc.rpcApercu, { [doc.idParam]: documentId });
    setOccupe(false);
    if (error || !data?.ok) {
      onToast?.("Impossible de préparer l'aperçu", "error");
      return;
    }
    setApercu(data);
    setOuvert(true);
  };

  const valider = async () => {
    if (occupe) return;           // le double clic ne crée pas deux envois
    setOccupe(true);
    const { data, error } = await supabase.rpc(doc.rpcAutoriser, {
      [doc.idParam]: documentId,
      p_destinataire: apercu?.destinataire || "",
    });
    setOccupe(false);
    if (error) {
      onToast?.("L'envoi n'a pas pu être programmé. Réessayez dans un instant.", "error");
      return;
    }
    if (!data?.ok) {
      onToast?.(messageRefusValidation(data?.raison, document), "error");
      await relireEtat();
      return;
    }
    setOuvert(false);
    onToast?.(messageApresValidation(data.deja_autorise));
    await relireEtat();
  };

  if (!etat) return null;

  const couleurs = {
    neutre: { fond: "#F8FAFC", texte: "#475569", icone: Mail },
    attente: { fond: "#EFF4FE", texte: "#1D4ED8", icone: Clock },
    attention: { fond: "#FEF3E2", texte: "#B45309", icone: ShieldAlert },
    succes: { fond: "#ECFDF5", texte: "#065F46", icone: Check },
    erreur: { fond: "#FDECEC", texte: "#B91C1C", icone: X },
  }[etat.ton] || { fond: "#F8FAFC", texte: "#475569", icone: Mail };
  const Icone = couleurs.icone;

  return (
    <div data-envoi={document}>
      <div className="rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ backgroundColor: couleurs.fond, color: couleurs.texte }}>
        <Icone size={15} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">E-mail au client : {etat.titre.toLowerCase()}</div>
          <div className="text-[12.5px] leading-snug">{etat.detail}</div>
          {etat.destinataire && (
            <div className="text-[12px] mt-0.5 opacity-80 break-all">Destinataire : {etat.destinataire}</div>
          )}
        </div>
      </div>

      {etat.peutValider && !ouvert && (
        <button
          type="button"
          onClick={ouvrirApercu}
          disabled={occupe}
          className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          <Send size={15} aria-hidden /> {GESTES.ouvrirEnvoi}
        </button>
      )}

      {ouvert && apercu && (
        <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[13px] font-semibold text-slate-900">Voici le message qui partira</div>
          <div className="mt-2 text-[12px] text-slate-500">À</div>
          <div className="text-[13.5px] font-semibold text-slate-900 break-all">
            {apercu.destinataire || "— aucune adresse enregistrée —"}
          </div>
          <div className="mt-2 text-[12px] text-slate-500">Objet</div>
          <div className="text-[13.5px] text-slate-900">{apercu.sujet}</div>
          <div className="mt-2 text-[12px] text-slate-500">Message</div>
          <pre className="mt-1 text-[12.5px] text-slate-700 whitespace-pre-wrap font-sans leading-snug max-h-56 overflow-y-auto">
{apercu.texte}
          </pre>
          <div className="text-[11.5px] text-slate-400 mt-1">{doc.lienAjoute}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={valider}
              disabled={occupe || !apercu.destinataire}
              className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-2 rounded-xl disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              <Send size={15} aria-hidden /> {occupe ? "Programmation…" : GESTES.confirmerEnvoi}
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
            >
              Annuler
            </button>
          </div>
          {!apercu.destinataire && (
            <div className="mt-2 text-[12.5px] text-amber-700">
              Ce client n&apos;a pas d&apos;adresse e-mail. Complétez sa fiche pour pouvoir lui écrire.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
