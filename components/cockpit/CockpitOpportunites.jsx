"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, ChevronRight, Clock, History, Phone, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ORIGINE_LABEL, SECTIONS, SECTION_LABEL, SECTION_SUBTITLE, SECTION_TONE, SOURCES_SUIVI_INTERNE } from "./cockpitConstants";
import { deriveOpportunites } from "./deriveOpportunites";

// Désignation lisible d'une ligne du journal, résolue à partir des données
// déjà chargées (aucune donnée stockée en plus dans opportunites_actions).
// Les sources ne sont jamais supprimées dans cette app (seul leur statut
// change) : le lookup réussit donc quasi toujours. Fallback honnête sinon.
function libelleSource(action, data) {
  const trouve = (arr = []) => arr.find((x) => x.id === action.source_id);
  switch (action.source_type) {
    case "demande": { const d = trouve(data.demandes); return d ? `Demande — ${d.clients?.nom || "Client"}` : null; }
    case "proposition": { const p = trouve(data.propositions); return p ? `Créneau — ${p.client}` : null; }
    case "devis": { const d = trouve(data.devisList); return d ? `Devis — ${d.client}` : null; }
    case "rappel": { const r = trouve(data.rappelsManques); return r ? `Rappel — ${r.telephone || "numéro non renseigné"}` : null; }
    case "rdv_confirmation": { const r = trouve(data.rendezVous); return r ? `RDV — ${r.client}` : null; }
    case "inspection": { const i = trouve(data.inspections); return i ? `Inspection — ${i.clients?.nom || i.client_nom_libre || "Client libre"}` : null; }
    case "travail_differe": { const t = trouve(data.travauxDifferes); return t ? `Travail différé — ${t.clientNom || t.intervention}` : null; }
    default: return null;
  }
}

// Identité honnête : aucune table de profils/rôles n'existe dans cette app.
// effectue_par (forcé serveur) est affiché tel quel, jamais un nom inventé.
function identiteLabel(uid) {
  return uid ? `Utilisateur authentifié · ${uid.slice(0, 8)}` : "Utilisateur authentifié";
}

const ACCENT = "#3D6BE0";

function ReporterModal({ item, onClose, onConfirm, submitting }) {
  const [motif, setMotif] = useState("");
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(demain);

  const peutValider = motif.trim().length > 0 && date;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Reporter cette opportunité</h2>
        <div className="text-[12.5px] text-slate-500 mt-1">{item.titre}</div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Revoir le</label>
            <input type="date" value={date} onInput={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Motif</label>
            <input autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. client injoignable, à retenter demain" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Annuler</button>
          <button
            onClick={() => onConfirm(motif.trim(), new Date(`${date}T00:00:00`).toISOString())}
            disabled={submitting || !peutValider}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {submitting ? "Report…" : "Reporter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Reprogrammation d'un travail différé — même garde-fous que l'original
// (components/NexoraDashboard.jsx: ReprogrammerDateControl) : contrôlé,
// date future obligatoire, confirmation explicite avant tout appel réseau.
function ReprogrammerDateInline({ onReprogrammer }) {
  const [value, setValue] = useState("");
  const [erreur, setErreur] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  const confirmer = async () => {
    if (!value || enregistrement) return;
    const saisie = new Date(`${value}T00:00:00`);
    if (Number.isNaN(saisie.getTime())) {
      setErreur("Date invalide");
      return;
    }
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);
    if (saisie <= aujourdHui) {
      setErreur("Choisissez une date future");
      return;
    }
    setErreur("");
    setEnregistrement(true);
    const succes = await onReprogrammer(value);
    setEnregistrement(false);
    if (!succes) {
      setErreur("Échec de l'enregistrement, réessayez");
      return;
    }
    setValue("");
    setConfirme(true);
    setTimeout(() => setConfirme(false), 2500);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        title="Programmer une nouvelle date de relance"
        value={value}
        onInput={(e) => { setValue(e.target.value); setErreur(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") confirmer(); }}
        disabled={enregistrement}
        className="text-[12px] rounded-[10px] border border-slate-200 px-2 py-2 text-slate-600 bg-white outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={confirmer}
        disabled={!value || enregistrement}
        title="Confirmer la nouvelle date de relance"
        className="text-[12px] font-semibold px-2.5 py-2 rounded-[10px] border border-slate-200 text-slate-600 disabled:opacity-40 whitespace-nowrap"
      >
        {enregistrement ? "…" : "Programmer"}
      </button>
      {erreur && <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">{erreur}</span>}
      {confirme && <span className="text-[11px] font-medium text-green-600 whitespace-nowrap">Reprogrammé ✓</span>}
    </div>
  );
}

function OpportuniteRow({ item, onTraiter, onOuvrirReporter }) {
  return (
    <div className="flex items-center gap-3 py-3 px-2.5 border-b border-slate-50 last:border-0 flex-wrap">
      <span className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: item.stripe }} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
          {item.titre}
          {"amount" in item && (item.amount ? (
            <span className="text-[13px] font-bold" style={{ color: "#B45309" }}>{item.amount.toLocaleString("fr-FR")} € TTC</span>
          ) : (
            <span className="text-[12px] font-semibold text-slate-400">montant non estimé</span>
          ))}
        </div>
        <div className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{ORIGINE_LABEL[item.sourceType]}</span>
          {item.suiviInterne && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: "#64748B" }} title="Contrôle de suivi interne — n'envoie rien au client">
              Suivi interne
            </span>
          )}
          <span>·</span>
          <span>{item.meta}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 w-full sm:flex-row sm:flex-nowrap sm:items-center sm:w-auto shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap sm:contents">
          {item.statusControl && (
            <select
              value={item.statusControl.value}
              onChange={(e) => item.statusControl.onChange(e.target.value)}
              className="text-[12px] rounded-[10px] border border-slate-200 px-2 py-2 text-slate-600 bg-white outline-none"
            >
              {(item.statusControl.options || [
                { value: "a_rappeler", label: "À rappeler" },
                { value: "tentative_sans_reponse", label: "Tentative sans réponse" },
                { value: "rdv_a_creer", label: "RDV à créer" },
                { value: "rdv_cree", label: "RDV créé" },
                { value: "demande_traitee", label: "Demande traitée" },
                { value: "perdu", label: "Perdu / non pertinent" },
              ]).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {item.dateControl && <ReprogrammerDateInline onReprogrammer={item.dateControl.onChange} />}
          {item.telHref ? (
            <a href={item.telHref} className="text-[12.5px] font-semibold px-3 py-2 rounded-[10px] text-white whitespace-nowrap inline-flex items-center gap-1.5" style={{ backgroundColor: item.urgent ? "#DC2626" : ACCENT }}>
              <Phone size={12} /> {item.action}
            </a>
          ) : (
            <button onClick={item.onAction} className="text-[12.5px] font-semibold px-3 py-2 rounded-[10px] text-white whitespace-nowrap" style={{ backgroundColor: item.urgent ? "#DC2626" : ACCENT }}>
              {item.action}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:contents">
          <button onClick={() => onTraiter(item)} title="Marque cette ligne traitée dans le Cockpit — n'envoie et ne valide rien" className="flex-1 sm:flex-none justify-center h-8 px-2.5 rounded-[10px] border border-slate-200 flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-green-600 hover:border-green-200 shrink-0 whitespace-nowrap">
            <CheckCircle2 size={14} /> Traiter
          </button>
          <button onClick={() => onOuvrirReporter(item)} title="Masque cette ligne jusqu'à l'échéance choisie — n'envoie et ne valide rien" className="flex-1 sm:flex-none justify-center h-8 px-2.5 rounded-[10px] border border-slate-200 flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-amber-600 hover:border-amber-200 shrink-0 whitespace-nowrap">
            <Clock size={14} /> Reporter
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ section, items, onTraiter, onOuvrirReporter }) {
  const tone = SECTION_TONE[section];
  const [expanded, setExpanded] = useState(section === "maintenant");
  const visible = expanded ? items : items.slice(0, 3);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 text-[12.5px]">
        <span className="font-semibold" style={{ color: tone.text }}>{SECTION_LABEL[section]}</span>
        <span className="text-slate-400">— rien ici pour l'instant</span>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="font-semibold text-slate-900 text-[14.5px]">{SECTION_LABEL[section]}</div>
          <div className="text-[12px] text-slate-500 mt-0.5">{SECTION_SUBTITLE[section]}</div>
        </div>
        <div className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: tone.bg, color: tone.text }}>{items.length}</div>
      </div>
      <div className="px-2.5 py-1">
        {visible.map((item) => (
          <OpportuniteRow key={item.key} item={item} onTraiter={onTraiter} onOuvrirReporter={onOuvrirReporter} />
        ))}
      </div>
      {items.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="w-full text-left px-5 py-2.5 border-t border-slate-100 text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: "#64748B" }}>
          {expanded ? "Réduire" : `Voir tout (${items.length})`}
          <ChevronRight size={12} style={{ transform: expanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .15s" }} />
        </button>
      )}
    </section>
  );
}

export default function CockpitOpportunites({
  garageId,
  demandes = [],
  propositions = [],
  devisList = [],
  rappelsManques = [],
  rendezVous = [],
  travauxDifferes = [],
  clients = [],
  onSelectDemande,
  onSelectAppt,
  setView,
  onChangerStatutRappel,
  onAjouterRappel,
  onOuvrirTravailDiffereModal,
  onMarquerContacteTravail,
  onReprogrammerTravail,
  onMarquerRecupereTravail,
  onCloturerRefusTravail,
  onOuvrirInspection,
  onToast,
}) {
  const [inspections, setInspections] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reporterCible, setReporterCible] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [masqueesOuvert, setMasqueesOuvert] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const PAGE_HISTORIQUE = 20;
  const [historiqueVisibleCount, setHistoriqueVisibleCount] = useState(PAGE_HISTORIQUE);

  const chargerInspections = async () => {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, statut, verrouille_le, updated_at, client_nom_libre, vehicule_libelle_libre, clients (nom), vehicules (marque, modele)")
      .eq("garage_id", garageId)
      .in("statut", ["en_attente_client", "consulte", "partiellement_valide"]);
    if (error) {
      console.error("Cockpit — erreur chargement inspections :", error);
      return;
    }
    setInspections(data || []);
  };

  // Historique append-only : chargé intégralement, sans limite de date — une
  // action ancienne ne doit jamais devenir invisible silencieusement. Sert
  // aussi à la logique de masquage/réapparition (deriveOpportunites), qui a
  // besoin de connaître la dernière action même si elle est ancienne.
  const chargerActions = async () => {
    const { data, error } = await supabase
      .from("opportunites_actions")
      .select("*")
      .eq("garage_id", garageId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Cockpit — erreur chargement du journal d'actions :", error);
      return;
    }
    setActions(data || []);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([chargerInspections(), chargerActions()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garageId]);

  const handlers = {
    onSelectDemande,
    onSelectAppt,
    setView,
    onChangerStatutRappel,
    onMarquerContacteTravail,
    onReprogrammerTravail,
    onMarquerRecupereTravail,
    onCloturerRefusTravail,
    onOuvrirInspection,
    onToast,
  };

  const { sections, masquees, compteurs } = useMemo(
    () => deriveOpportunites({ demandes, propositions, devisList, rappelsManques, rendezVous, travauxDifferes, clients, inspections, actions, handlers }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demandes, propositions, devisList, rappelsManques, rendezVous, travauxDifferes, clients, inspections, actions]
  );

  const enregistrerAction = async (payload) => {
    const { error } = await supabase.from("opportunites_actions").insert({ garage_id: garageId, ...payload });
    if (error) {
      console.error("Cockpit — erreur enregistrement action :", error);
      onToast && onToast("Impossible d'enregistrer cette action", "error");
      return false;
    }
    await chargerActions();
    return true;
  };

  const traiter = async (item) => {
    const ok = await enregistrerAction({ source_type: item.sourceType, source_id: item.sourceId, action: "traite" });
    if (ok) onToast && onToast("Marqué traité");
  };

  const confirmerReport = async (motif, masquerJusquAu) => {
    setSubmitting(true);
    const ok = await enregistrerAction({
      source_type: reporterCible.sourceType,
      source_id: reporterCible.sourceId,
      action: "reporte",
      motif,
      masquer_jusqu_au: masquerJusquAu,
    });
    setSubmitting(false);
    if (ok) {
      onToast && onToast("Reporté");
      setReporterCible(null);
    }
  };

  const reactiver = async (item) => {
    const ok = await enregistrerAction({ source_type: item.sourceType, source_id: item.sourceId, action: "reactiver" });
    if (ok) onToast && onToast("Opportunité réactivée");
  };

  const totalVisible = compteurs.maintenant + compteurs.aujourdhui + compteurs.a_planifier;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-slate-200 h-24 animate-pulse" />
        <div className="bg-white rounded-2xl border border-slate-200 h-24 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-3 flex-wrap text-[12.5px] font-semibold">
          {SECTIONS.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: SECTION_TONE[s].bg, color: SECTION_TONE[s].text }}>
              {SECTION_LABEL[s]} · {compteurs[s]}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onAjouterRappel && onAjouterRappel()} className="text-[12px] font-semibold flex items-center gap-1.5 whitespace-nowrap" style={{ color: ACCENT }}>
            <Phone size={12} /> Ajouter un rappel
          </button>
          <button onClick={() => onOuvrirTravailDiffereModal && onOuvrirTravailDiffereModal()} className="text-[12px] font-semibold flex items-center gap-1.5 whitespace-nowrap" style={{ color: ACCENT }}>
            <Calendar size={12} /> Enregistrer un travail différé
          </button>
        </div>
      </div>

      <div className="px-1 text-[12px] text-slate-400">
        Traiter et Reporter organisent seulement le Cockpit. Aucun message n'est envoyé au client.
      </div>

      {totalVisible === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#E7F6EC" }}>
            <CheckCircle2 size={19} color="#16A34A" />
          </div>
          <div className="text-slate-900 font-medium text-sm">Tout est sous contrôle</div>
          <div className="text-slate-500 text-[13px] mt-1">Aucune opportunité à traiter pour l'instant.</div>
        </div>
      ) : (
        SECTIONS.map((s) => <SectionBlock key={s} section={s} items={sections[s]} onTraiter={traiter} onOuvrirReporter={setReporterCible} />)
      )}

      {masquees.length > 0 && (
        <details open={masqueesOuvert} onToggle={(e) => setMasqueesOuvert(e.target.open)} className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3">
          <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[12.5px] font-semibold text-slate-600">
            Traité ou reporté récemment ({masquees.length})
            <ChevronRight size={14} className="text-slate-400" style={{ transform: masqueesOuvert ? "rotate(90deg)" : "none" }} />
          </summary>
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            {masquees.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 flex-wrap text-[12.5px] py-1.5">
                <div className="min-w-0">
                  <span className="font-medium text-slate-700">{m.titre}</span>
                  <span className="text-slate-400"> — {m.masquageAction.action === "traite" ? "traité" : `reporté${m.masquageAction.motif ? ` (${m.masquageAction.motif})` : ""}`} le {new Date(m.masquageAction.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
                <button onClick={() => reactiver(m)} className="text-[12px] font-semibold flex items-center gap-1 shrink-0" style={{ color: ACCENT }}>
                  <RotateCcw size={12} /> Réactiver
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {actions.length > 0 && (
        <details open={historiqueOuvert} onToggle={(e) => setHistoriqueOuvert(e.target.open)} className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3">
          <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[12.5px] font-semibold text-slate-600">
            <History size={13} /> Historique des actions ({actions.length})
            <ChevronRight size={14} className="text-slate-400" style={{ transform: historiqueOuvert ? "rotate(90deg)" : "none" }} />
          </summary>
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 max-h-96 overflow-y-auto">
            {actions.slice(0, historiqueVisibleCount).map((a) => {
              const libelle = libelleSource(a, { demandes, propositions, devisList, rappelsManques, rendezVous, travauxDifferes, clients, inspections }) || `${ORIGINE_LABEL[a.source_type] || a.source_type} (détail indisponible)`;
              return (
                <div key={a.id} className="text-[12.5px] py-1.5 border-b border-slate-50 last:border-0">
                  <div className="font-medium text-slate-700">
                    {libelle} — {a.action === "traite" ? "traité" : a.action === "reactiver" ? "réactivé" : "reporté"}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {identiteLabel(a.effectue_par)} · {new Date(a.created_at).toLocaleString("fr-FR")}
                    {a.motif && ` · motif : ${a.motif}`}
                    {a.masquer_jusqu_au && ` · revoir le ${new Date(a.masquer_jusqu_au).toLocaleDateString("fr-FR")}`}
                  </div>
                </div>
              );
            })}
          </div>
          {historiqueVisibleCount < actions.length ? (
            <button
              onClick={() => setHistoriqueVisibleCount((n) => n + PAGE_HISTORIQUE)}
              className="w-full text-center mt-2 pt-2.5 border-t border-slate-100 text-[12.5px] font-semibold"
              style={{ color: ACCENT }}
            >
              Charger plus ancien ({actions.length - historiqueVisibleCount} restante{actions.length - historiqueVisibleCount > 1 ? "s" : ""})
            </button>
          ) : (
            actions.length > PAGE_HISTORIQUE && (
              <div className="text-center mt-2 pt-2.5 border-t border-slate-100 text-[12px] text-slate-400">Tout l'historique est affiché ({actions.length} action{actions.length > 1 ? "s" : ""})</div>
            )
          )}
        </details>
      )}

      {reporterCible && (
        <ReporterModal item={reporterCible} onClose={() => setReporterCible(null)} onConfirm={confirmerReport} submitting={submitting} />
      )}
    </div>
  );
}
