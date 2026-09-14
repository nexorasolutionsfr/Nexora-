"use client";

// La relance d'un travail différé, telle que le garage la relit.
//
// La base a préparé le brouillon (`preparer_relances_travaux`) ; ici on le
// montre avec la voiture et le client, on laisse corriger le texte, et on
// offre deux gestes : « Autoriser l'envoi » (la ligne passe en attente, n8n
// l'expédie au prochain passage) ou « Ne pas relancer » (annulée, motif).
// Rien ne part sans le premier geste. Le message affiché est celui qui sera
// envoyé : un seul texte, en base.

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Portail, { garderLeFocus } from "../garage-os/Portail";

const ACCENT = "#3D6BE0";
const NAVY = "#0F1B33";

export const STATUT_RELANCE_LABEL = {
  a_relire: "À relire",
  en_attente: "Autorisée, départ en attente",
  envoi_en_cours: "Envoi à vérifier",
  envoye: "Envoyée",
  bloque: "Mise de côté — à revalider",
  annulee: "Annulée",
  obsolete: "Obsolète (travail reporté)",
};

/** Les relances qui demandent ou méritent un regard : pas les obsolètes ni les annulées. */
export const STATUTS_VISIBLES = ["a_relire", "bloque", "en_attente", "envoi_en_cours", "envoye"];

/**
 * Charge les relances du garage, indexées par travail différé. La table est
 * lisible par le dirigeant et l'accueil (policy) ; ailleurs, la carte est vide.
 */
export function useRelancesTravaux(garageId, actif = true) {
  const [relances, setRelances] = useState([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!garageId || !actif) { setRelances([]); return; }
    let annule = false;
    supabase.from("relances_travaux").select("*").eq("garage_id", garageId).in("statut", STATUTS_VISIBLES).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (!annule) setRelances(error ? [] : (data || [])); });
    return () => { annule = true; };
  }, [garageId, actif, version]);
  const parTravail = useMemo(() => {
    const m = new Map();
    for (const r of relances) if (!m.has(r.travail_differe_id)) m.set(r.travail_differe_id, r);
    return m;
  }, [relances]);
  return { relances, parTravail, recharger: () => setVersion((v) => v + 1) };
}

function dateFr(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function libelleRefusRelance(raison) {
  switch (raison) {
    case "destinataire_absent": return "Ce client n'a pas d'adresse e-mail : joignez-le autrement, puis marquez le travail contacté.";
    case "destinataire_different": return "L'adresse du client a changé depuis l'affichage. Rouvrez la relance pour vérifier.";
    case "travail_clos": return "Ce travail est clos : il n'y a plus rien à relancer.";
    case "travail_reporte": return "Ce travail a été reporté : une nouvelle relance sera préparée à la nouvelle date.";
    case "statut": return "Cette relance n'est plus modifiable dans son état actuel.";
    case "texte_vide": return "Le sujet et le texte sont obligatoires.";
    default: return "L'action n'a pas abouti. Réessayez.";
  }
}

/**
 * Props :
 *  - relance   : la ligne de relances_travaux
 *  - travail   : le travail différé (intervention, clientNom, vehiculeLabel…)
 *  - onFermer, onChange (après un geste), onToast
 */
export default function RelanceTravailModal({ relance, travail, onFermer, onChange, onToast }) {
  const [sujet, setSujet] = useState(relance.sujet || "");
  const [texte, setTexte] = useState(relance.texte || "");
  const [email, setEmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const modifiable = relance.statut === "a_relire" || relance.statut === "bloque";
  const texteModifie = sujet !== (relance.sujet || "") || texte !== (relance.texte || "");

  // L'adresse du client, au moment de l'affichage : c'est elle que le garage
  // valide, et la base refuse d'écrire ailleurs.
  useEffect(() => {
    let annule = false;
    if (!relance.client_id) { setEmail(""); return; }
    supabase.from("clients").select("email").eq("id", relance.client_id).single()
      .then(({ data }) => { if (!annule) setEmail((data?.email || "").trim()); });
    return () => { annule = true; };
  }, [relance.client_id]);

  // Une fenêtre qui s'ouvre prend le focus, et le rend en se fermant — comme
  // PhotoEnGrand et « Préparer le devis ». Sans cela, au clavier, Tab repartait
  // du haut de la page, derrière la fenêtre.
  // Une seule fois, au montage : `onFermer` est recréée à chaque rendu du
  // parent, et un effet qui en dépend reprendrait le focus à chaque fois.
  //
  // Le focus initial passe par la référence du bouton, pas par l'effet : la
  // fenêtre est rendue par `Portail`, qui ne monte ses enfants qu'au rendu
  // suivant. Au moment de l'effet, le bouton n'existe pas encore — mesuré au
  // clavier le 14 septembre 2026 : le focus restait sur « Revoir la relance »
  // et Tab parcourait la page derrière la fenêtre.
  const fenetreRef = useRef(null);
  const focusPoseRef = useRef(false);
  const poserFocusInitial = (el) => {
    if (el && !focusPoseRef.current) { focusPoseRef.current = true; el.focus(); }
  };
  const onFermerRef = useRef(onFermer);
  onFermerRef.current = onFermer;
  useEffect(() => {
    const precedent = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => { if (e.key === "Escape") onFermerRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (precedent && typeof precedent.focus === "function" && document.contains(precedent)) precedent.focus();
    };
  }, []);

  const toast = (m, t) => onToast?.(m, t);

  const enregistrerTexte = async () => {
    if (!texteModifie) return true;
    const { data, error } = await supabase.rpc("modifier_relance_travail", { p_relance_id: relance.id, p_sujet: sujet, p_texte: texte });
    if (error || !data?.ok) { const m = libelleRefusRelance(data?.raison); setErreur(m); toast(m, "error"); return false; }
    return true;
  };

  const autoriser = async () => {
    setBusy(true); setErreur(null);
    if (!(await enregistrerTexte())) { setBusy(false); return; }
    const { data, error } = await supabase.rpc("autoriser_envoi_relance_travail", { p_relance_id: relance.id, p_destinataire: email || "" });
    setBusy(false);
    if (error) { const m = /accès refusé|introuvable/i.test(error.message || "") ? "Cette relance n'est pas accessible avec votre compte." : libelleRefusRelance(); setErreur(m); toast(m, "error"); return; }
    if (!data?.ok) { const m = libelleRefusRelance(data?.raison); setErreur(m); toast(m, "error"); return; }
    toast(data.deja_autorise ? "Cette relance était déjà autorisée." : "Relance autorisée. Elle partira au prochain passage ; cet écran dira « Envoyée » quand ce sera fait.");
    onChange?.(); onFermer?.();
  };

  const annuler = async () => {
    setBusy(true); setErreur(null);
    const { data, error } = await supabase.rpc("annuler_relance_travail", { p_relance_id: relance.id, p_motif: "le garage a choisi de ne pas relancer" });
    setBusy(false);
    if (error || !data?.ok) { const m = libelleRefusRelance(data?.raison); setErreur(m); toast(m, "error"); return; }
    toast("Relance annulée. Le travail reste dans votre suivi : clôturez-le si le client a refusé.");
    onChange?.(); onFermer?.();
  };

  const sauvegarder = async () => {
    setBusy(true); setErreur(null);
    const ok = await enregistrerTexte();
    setBusy(false);
    if (ok) { toast("Texte enregistré. Rien n'est envoyé."); onChange?.(); }
  };

  return (
    <Portail>
      <div ref={fenetreRef} onKeyDown={(e) => garderLeFocus(e, fenetreRef.current)} className="fixed inset-0 bg-black/40 z-[60] flex items-stretch sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Relance du travail différé">
        <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-slate-900">Relance à relire</div>
              <div className="text-[12.5px] text-slate-500 truncate">{[travail?.vehiculeLabel, travail?.clientNom].filter(Boolean).join(" · ") || "Travail différé"}</div>
            </div>
            <button ref={poserFocusInitial} type="button" onClick={onFermer} aria-label="Fermer" className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-600 space-y-0.5">
              <div><span className="text-slate-400">Travail :</span> {travail?.intervention || "—"}</div>
              <div><span className="text-slate-400">Échéance :</span> {dateFr(relance.echeance)} · <span className="text-slate-400">État :</span> {STATUT_RELANCE_LABEL[relance.statut] || relance.statut}</div>
              {relance.derniere_erreur && <div className="text-amber-700">{relance.derniere_erreur}</div>}
              {relance.motif && <div className="text-amber-700">{relance.motif}</div>}
            </div>

            <div>
              <label className="text-[11.5px] font-medium text-slate-500">Destinataire</label>
              <div className="mt-1 text-[13px] text-slate-800 min-h-[24px]">
                {email === null ? "…" : email || <span className="text-amber-700">Ce client n'a pas d'adresse e-mail.</span>}
              </div>
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-slate-500">Sujet</label>
              <input value={sujet} onChange={(e) => setSujet(e.target.value)} disabled={!modifiable || busy} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white min-h-[40px] disabled:bg-slate-50" />
            </div>
            <div>
              <label className="text-[11.5px] font-medium text-slate-500">Message</label>
              <textarea value={texte} onChange={(e) => setTexte(e.target.value)} disabled={!modifiable || busy} rows={10} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white disabled:bg-slate-50 resize-y" />
            </div>
            <div className="text-[11.5px] text-slate-400">Ce texte est celui qui sera envoyé, tel quel. Autoriser ne l'envoie pas à l'instant : il part au prochain passage de l'automatisation.</div>
            {erreur && <div className="text-[12.5px] text-red-600">{erreur}</div>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
            {modifiable ? (
              <button type="button" onClick={annuler} disabled={busy} className="min-h-[40px] px-3 rounded-xl text-[13px] font-medium text-slate-500 hover:text-red-600">Ne pas relancer</button>
            ) : <span />}
            <div className="flex gap-2">
              {modifiable && texteModifie && (
                <button type="button" onClick={sauvegarder} disabled={busy} className="min-h-[40px] px-3.5 rounded-xl text-[13px] font-medium border border-slate-200 text-slate-600">Enregistrer le texte</button>
              )}
              {modifiable && (
                <button type="button" onClick={autoriser} disabled={busy || !email} className="min-h-[40px] px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5" style={{ backgroundColor: NAVY }}>
                  <Send size={14} /> {busy ? "…" : "Autoriser l'envoi"}
                </button>
              )}
              {!modifiable && (
                <button type="button" onClick={onFermer} className="min-h-[40px] px-4 rounded-xl text-[13px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>Fermer</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portail>
  );
}
