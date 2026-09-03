"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ACCENT, ACCENT_SOFT } from "../garage-os/tokens";
import {
  ACTION_HISTORIQUE_LABEL,
  STATUTS_OR_MODIFIABLES,
  STATUT_OR_LABEL,
  STATUT_OR_TONE,
  TYPE_LIGNE_LABEL,
} from "./ordreReparationConstants";
import {
  calculerTotalEstimeHT,
  estDevisCompatible,
  filtrerDevisAttachables,
  filtrerRendezVousEligibles,
  peutModifierLignes,
  traduireErreurOR,
  trouverOrdrePourRendezVous,
  validerLigneForm,
} from "./calculs";

function Badge({ children, tone = "slate" }) {
  const tones = {
    amber: { bg: "#FEF3E2", text: "#B45309" },
    green: { bg: "#E7F6EC", text: "#15803D" },
    slate: { bg: "#F1F5F9", text: "#475569" },
    red: { bg: "#FDECEC", text: "#B91C1C" },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-block" style={{ backgroundColor: t.bg, color: t.text }}>
      {children}
    </span>
  );
}

function EmptyState({ title, subtitle, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: ACCENT_SOFT }}>
        <ClipboardCheck size={19} color={ACCENT} />
      </div>
      <div className="text-slate-900 font-medium text-sm">{title}</div>
      {subtitle && <div className="text-slate-500 text-[13px] mt-1">{subtitle}</div>}
      {action}
    </div>
  );
}

function formatDateHeureRdv(rdv) {
  if (!rdv?.date_debut) return "Date non renseignée";
  const date = new Date(rdv.date_debut);
  if (Number.isNaN(date.getTime())) return "Date non renseignée";
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function labelRendezVous(rdv) {
  const date = formatDateHeureRdv(rdv);
  const client = rdv.clients?.nom || rdv.client || "Client inconnu";
  const vehicule = rdv.vehicules ? `${rdv.vehicules.marque || ""} ${rdv.vehicules.modele || ""}`.trim() : rdv.vehicule || "";
  return [date, client, vehicule].filter(Boolean).join(" · ");
}

// =====================================================================
// Création — étape unique : choisir un rendez-vous compatible (obligatoire,
// contrat A.4), puis rattacher facultativement un devis déjà accepté et
// compatible (contrat E.3). Client/véhicule ne sont jamais saisis
// directement : ils viennent du rendez-vous choisi et seront figés par la
// base à la création.
// =====================================================================
function CreerOrdreModal({ rendezVous, devisList, ordres, garageId, initialRendezVousId, initialDevisId, onClose, onSubmit, submitting }) {
  const devisInitial = initialDevisId ? devisList.find((d) => d.id === initialDevisId) : null;
  const contrainteDevis = devisInitial ? { clientId: devisInitial.client_id, vehiculeId: devisInitial.vehicule_id } : {};

  const rdvEligibles = filtrerRendezVousEligibles(rendezVous, ordres, contrainteDevis)
    .slice()
    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut));

  const rdvInitialValide = initialRendezVousId && rdvEligibles.some((r) => r.id === initialRendezVousId) ? initialRendezVousId : "";

  const [rendezVousId, setRendezVousId] = useState(rdvInitialValide);
  const [devisId, setDevisId] = useState("");

  const rdvChoisi = rendezVous.find((r) => r.id === rendezVousId) || null;

  const devisAttachables = rdvChoisi
    ? filtrerDevisAttachables(devisList, { garageId, clientId: rdvChoisi.client_id, vehiculeId: rdvChoisi.vehicule_id })
    : [];

  useEffect(() => {
    if (devisInitial && rdvChoisi && estDevisCompatible(devisInitial, { garageId, clientId: rdvChoisi.client_id, vehiculeId: rdvChoisi.vehicule_id })) {
      setDevisId(devisInitial.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendezVousId]);

  const peutValider = !!rendezVousId;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md text-slate-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Nouvel ordre de réparation</h2>
        <div className="text-[12.5px] text-slate-500 mt-1">
          Un ordre de réparation prolonge toujours un rendez-vous existant. Client et véhicule sont repris automatiquement.
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Rendez-vous</label>
            {rdvEligibles.length === 0 ? (
              <div className="mt-1.5 text-[13px] text-slate-500 bg-slate-50 rounded-xl p-3">
                {devisInitial
                  ? "Aucun rendez-vous compatible (même client, même véhicule) n'est disponible pour ce devis."
                  : "Aucun rendez-vous disponible : tous ont déjà un ordre de réparation, ou aucun rendez-vous n'existe encore."}
              </div>
            ) : (
              <select
                value={rendezVousId}
                onChange={(e) => { setRendezVousId(e.target.value); setDevisId(""); }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">— Choisir un rendez-vous —</option>
                {rdvEligibles.map((r) => (
                  <option key={r.id} value={r.id}>{labelRendezVous(r)}</option>
                ))}
              </select>
            )}
          </div>

          {rdvChoisi && (
            <div>
              <label className="text-[12px] font-medium text-slate-500">Devis d'origine (facultatif)</label>
              {devisAttachables.length === 0 ? (
                <div className="mt-1.5 text-[12.5px] text-slate-400">Aucun devis accepté compatible avec ce rendez-vous.</div>
              ) : (
                <select
                  value={devisId}
                  onChange={(e) => setDevisId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">— Aucun —</option>
                  {devisAttachables.map((d) => (
                    <option key={d.id} value={d.id}>{Number(d.montant_ttc || 0).toFixed(2)} € TTC · accepté</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Annuler</button>
          <button
            onClick={() => rdvChoisi && onSubmit({ garage_id: garageId, rendez_vous_id: rdvChoisi.id, vehicule_id: rdvChoisi.vehicule_id, client_id: rdvChoisi.client_id, devis_id: devisId || null })}
            disabled={submitting || !peutValider}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            {submitting ? "Création…" : "Créer l'ordre de réparation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnnulerOrdreModal({ onClose, onConfirm, submitting }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Annuler cet ordre de réparation</h2>
        <div className="text-[12.5px] text-slate-500 mt-2">
          Le client, le véhicule, les lignes et l'historique déjà enregistrés sont intégralement conservés — rien n'est supprimé. Cette annulation est tracée dans l'historique.
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Retour</button>
          <button onClick={onConfirm} disabled={submitting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#B91C1C" }}>
            {submitting ? "Annulation…" : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LigneForm({ initial, onSave, onCancel, submitting }) {
  const [type, setType] = useState(initial?.type || "main_oeuvre");
  const [libelle, setLibelle] = useState(initial?.libelle || "");
  const [quantite, setQuantite] = useState(initial?.quantite ?? 1);
  const [prixUnitaireHt, setPrixUnitaireHt] = useState(initial?.prix_unitaire_ht ?? "");
  const [dureeMinutes, setDureeMinutes] = useState(initial?.duree_minutes ?? "");
  const [erreurs, setErreurs] = useState({});

  const submit = () => {
    const champs = {
      type,
      libelle,
      quantite,
      prix_unitaire_ht: prixUnitaireHt === "" ? null : prixUnitaireHt,
      duree_minutes: type === "piece" ? null : dureeMinutes === "" ? null : dureeMinutes,
    };
    const { valide, erreurs: nouvellesErreurs } = validerLigneForm(champs);
    setErreurs(nouvellesErreurs);
    if (!valide) return;
    onSave(champs);
  };

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); if (e.target.value === "piece") setDureeMinutes(""); }} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white">
            <option value="main_oeuvre">{TYPE_LIGNE_LABEL.main_oeuvre}</option>
            <option value="piece">{TYPE_LIGNE_LABEL.piece}</option>
          </select>
        </div>
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Quantité</label>
          <input type="number" min="0.01" step="0.01" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white" />
          {erreurs.quantite && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.quantite}</div>}
        </div>
      </div>
      <div>
        <label className="text-[11.5px] font-medium text-slate-500">Libellé</label>
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={type === "main_oeuvre" ? "Ex. Diagnostic, remplacement embrayage…" : "Ex. Filtre à huile, plaquettes…"} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white" />
        {erreurs.libelle && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.libelle}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Prix HT estimé (facultatif)</label>
          <input type="number" min="0" step="0.01" value={prixUnitaireHt} onChange={(e) => setPrixUnitaireHt(e.target.value)} placeholder="—" className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white" />
          {erreurs.prix_unitaire_ht && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.prix_unitaire_ht}</div>}
        </div>
        {type === "main_oeuvre" && (
          <div>
            <label className="text-[11.5px] font-medium text-slate-500">Durée (minutes, facultatif)</label>
            <input type="number" min="1" step="1" value={dureeMinutes} onChange={(e) => setDureeMinutes(e.target.value)} placeholder="—" className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white" />
            {erreurs.duree_minutes && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.duree_minutes}</div>}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="min-h-[40px] px-3.5 rounded-lg text-[13px] font-medium text-slate-500">Annuler</button>
        <button onClick={submit} disabled={submitting} className="min-h-[40px] px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {submitting ? "Enregistrement…" : "Enregistrer la ligne"}
        </button>
      </div>
    </div>
  );
}

function LigneRow({ ligne, modifiable, onUpdate, onDelete, submitting }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <LigneForm
        initial={ligne}
        submitting={submitting}
        onCancel={() => setEditing(false)}
        onSave={async (champs) => { await onUpdate(ligne.id, champs); setEditing(false); }}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{TYPE_LIGNE_LABEL[ligne.type] || ligne.type}</span>
          <span className="text-[13.5px] font-medium text-slate-900 truncate">{ligne.libelle}</span>
        </div>
        <div className="text-[12.5px] text-slate-500 mt-0.5">
          {Number(ligne.quantite)} {ligne.prix_unitaire_ht != null && `· ${Number(ligne.prix_unitaire_ht).toFixed(2)} € HT (unitaire, estimation interne)`}
          {ligne.type === "main_oeuvre" && ligne.duree_minutes != null && ` · ${ligne.duree_minutes} min`}
        </div>
      </div>
      {modifiable && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(true)} className="min-h-[40px] min-w-[40px] rounded-lg text-[12.5px] font-medium text-slate-600 hover:bg-slate-50 px-2.5">Modifier</button>
          <button onClick={() => onDelete(ligne.id)} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center">
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Détail d'un OR — statut, client, véhicule, rendez-vous, étape atelier en
// lecture seule (reflet direct de rendez_vous.statut_atelier, jamais
// modifiée ici), mécanicien assigné, notes internes, lignes, historique.
// =====================================================================
function OrdreDetail({ garageId, ordreId, workshopStages, onClose, onToast, onChanged, mecaniciens = [] }) {
  const [data, setData] = useState(null);
  const [ajoutLigneOuvert, setAjoutLigneOuvert] = useState(false);
  const [annulerOuvert, setAnnulerOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesEditing, setNotesEditing] = useState(false);

  const load = async () => {
    const { data: ordre, error } = await supabase
      .from("ordres_reparation")
      .select("*, clients (nom, telephone), vehicules (marque, modele, immatriculation), rendez_vous (date_debut, date_fin, statut_atelier), devis (id, statut, montant_ttc)")
      .eq("id", ordreId)
      .eq("garage_id", garageId)
      .single();
    if (error) {
      console.error("Erreur chargement ordre de réparation :", error);
      onToast("Impossible de charger cet ordre de réparation", "error");
      return;
    }
    const [{ data: lignes, error: lignesError }, { data: historique, error: histError }] = await Promise.all([
      supabase.from("ordres_reparation_lignes").select("*").eq("ordre_reparation_id", ordreId).order("created_at"),
      supabase.from("ordres_reparation_historique").select("*").eq("ordre_reparation_id", ordreId).order("created_at", { ascending: false }),
    ]);
    if (lignesError || histError) {
      console.error("Erreur chargement détail ordre de réparation :", lignesError || histError);
      onToast("Impossible de charger le détail de cet ordre de réparation", "error");
      return;
    }
    setData({ ordre, lignes: lignes || [], historique: historique || [] });
    setNotes(ordre.notes_internes || "");
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordreId]);

  if (!data) return null;
  const { ordre, lignes, historique } = data;
  const modifiable = peutModifierLignes(ordre);
  const etapeAtelier = workshopStages.find((s) => s.key === (ordre.rendez_vous?.statut_atelier || "a_venir"));

  const changerStatut = async (nouveauStatut) => {
    if (nouveauStatut === ordre.statut) return;
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation").update({ statut: nouveauStatut }).eq("id", ordreId).eq("garage_id", garageId);
    setBusy(false);
    if (error) {
      console.error("Erreur changement de statut OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
    onChanged();
    onToast("Statut mis à jour");
  };

  const annuler = async () => {
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation").update({ statut: "annule" }).eq("id", ordreId).eq("garage_id", garageId);
    setBusy(false);
    setAnnulerOuvert(false);
    if (error) {
      console.error("Erreur annulation OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
    onChanged();
    onToast("Ordre de réparation annulé");
  };

  const assignerMecanicien = async (mecanicienId) => {
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation").update({ mecanicien_id: mecanicienId || null }).eq("id", ordreId).eq("garage_id", garageId);
    setBusy(false);
    if (error) {
      console.error("Erreur affectation mécanicien OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
  };

  const enregistrerNotes = async () => {
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation").update({ notes_internes: notes || null }).eq("id", ordreId).eq("garage_id", garageId);
    setBusy(false);
    setNotesEditing(false);
    if (error) {
      console.error("Erreur enregistrement notes OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
  };

  const ajouterLigne = async (champs) => {
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation_lignes").insert({ ordre_reparation_id: ordreId, garage_id: garageId, ...champs });
    setBusy(false);
    if (error) {
      console.error("Erreur ajout ligne OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    setAjoutLigneOuvert(false);
    await load();
  };

  const modifierLigne = async (ligneId, champs) => {
    setBusy(true);
    const { error } = await supabase.from("ordres_reparation_lignes").update(champs).eq("id", ligneId).eq("garage_id", garageId);
    setBusy(false);
    if (error) {
      console.error("Erreur modification ligne OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
  };

  const supprimerLigne = async (ligneId) => {
    if (!window.confirm("Retirer cette ligne de l'ordre de réparation ?")) return;
    const { error } = await supabase.from("ordres_reparation_lignes").delete().eq("id", ligneId).eq("garage_id", garageId);
    if (error) {
      console.error("Erreur suppression ligne OR :", error);
      onToast(traduireErreurOR(error), "error");
      return;
    }
    await load();
  };

  const totalEstime = calculerTotalEstimeHT(lignes);
  const vehiculeLabel = ordre.vehicules ? `${ordre.vehicules.marque || ""} ${ordre.vehicules.modele || ""}`.trim() : "Véhicule";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center sm:justify-center">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 truncate">{vehiculeLabel || "Véhicule"} {ordre.vehicules?.immatriculation && `· ${ordre.vehicules.immatriculation}`}</div>
            <div className="text-[12.5px] text-slate-500 truncate">{ordre.clients?.nom || "Client"}</div>
          </div>
          <button onClick={onClose} className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={STATUT_OR_TONE[ordre.statut]}>{STATUT_OR_LABEL[ordre.statut] || ordre.statut}</Badge>
            {etapeAtelier && (
              <span className="text-[11.5px] font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: `${etapeAtelier.color}1A`, color: etapeAtelier.color }}>
                Atelier : {etapeAtelier.label}
              </span>
            )}
            {ordre.devis && (
              <Badge tone="slate">Devis d'origine {Number(ordre.devis.montant_ttc || 0).toFixed(2)} € TTC</Badge>
            )}
          </div>
          <div className="text-[12.5px] text-slate-500">
            Rendez-vous : {ordre.rendez_vous ? formatDateHeureRdv(ordre.rendez_vous) : "—"}
          </div>

          {modifiable && (
            <div className="flex flex-wrap items-center gap-2">
              {STATUTS_OR_MODIFIABLES.map((s) => (
                <button
                  key={s}
                  onClick={() => changerStatut(s)}
                  disabled={busy}
                  className="min-h-[40px] px-3.5 rounded-xl text-[12.5px] font-semibold border disabled:opacity-50"
                  style={ordre.statut === s ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "white" } : { borderColor: "#E2E8F0", color: "#475569" }}
                >
                  {STATUT_OR_LABEL[s]}
                </button>
              ))}
              <button onClick={() => setAnnulerOuvert(true)} disabled={busy} className="min-h-[40px] px-3.5 rounded-xl text-[12.5px] font-semibold text-red-700 border border-red-200 ml-auto">
                Annuler l'ordre
              </button>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-slate-500">Mécanicien assigné</label>
            <select
              value={ordre.mecanicien_id || ""}
              onChange={(e) => assignerMecanicien(e.target.value || null)}
              disabled={!modifiable || busy}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-50"
            >
              <option value="">Non assigné</option>
              {mecaniciens.filter((m) => m.actif !== false).map((m) => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-slate-500">Notes internes</label>
              {!notesEditing && modifiable && (
                <button onClick={() => setNotesEditing(true)} className="text-[12px] font-medium" style={{ color: ACCENT }}>Modifier</button>
              )}
            </div>
            {notesEditing ? (
              <div className="mt-1.5 space-y-2">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" placeholder="Notes réservées au garage — jamais visibles du client." />
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setNotes(ordre.notes_internes || ""); setNotesEditing(false); }} className="text-[12.5px] font-medium text-slate-500 px-3 py-1.5">Annuler</button>
                  <button onClick={enregistrerNotes} disabled={busy} className="text-[12.5px] font-semibold text-white px-3.5 py-1.5 rounded-lg disabled:opacity-50" style={{ backgroundColor: ACCENT }}>Enregistrer</button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 text-[13px] text-slate-600 whitespace-pre-line">{ordre.notes_internes || <span className="text-slate-400">Aucune note.</span>}</div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
              <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Lignes</div>
              {lignes.length > 0 && (
                totalEstime.complet ? (
                  <div className="text-[12.5px] text-slate-500">Total estimé HT : {totalEstime.total.toFixed(2)} € <span className="text-slate-400">(indicatif, interne)</span></div>
                ) : (
                  <div className="text-[12.5px] text-amber-600">Total partiel HT — certaines lignes n'ont pas encore de prix <span className="text-slate-400">(indicatif, interne)</span></div>
                )
              )}
            </div>
            <div className="space-y-2">
              {lignes.map((l) => (
                <LigneRow key={l.id} ligne={l} modifiable={modifiable} onUpdate={modifierLigne} onDelete={supprimerLigne} submitting={busy} />
              ))}
              {lignes.length === 0 && !ajoutLigneOuvert && (
                <div className="text-[13px] text-slate-400 py-2">Aucune ligne pour l'instant.</div>
              )}
              {modifiable && ajoutLigneOuvert && (
                <LigneForm submitting={busy} onCancel={() => setAjoutLigneOuvert(false)} onSave={ajouterLigne} />
              )}
              {modifiable && !ajoutLigneOuvert && (
                <button onClick={() => setAjoutLigneOuvert(true)} className="w-full min-h-[44px] rounded-xl border border-dashed border-slate-300 text-[13px] font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 flex items-center justify-center gap-1.5">
                  <Plus size={14} /> Ajouter une ligne
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Historique</div>
            <div className="space-y-1.5">
              {historique.map((h) => (
                <div key={h.id} className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  <span>
                    {ACTION_HISTORIQUE_LABEL[h.action] || h.action}
                    {h.action !== "creation" && h.action !== "changement_mecanicien" && h.nouveau_statut && (
                      <> — {STATUT_OR_LABEL[h.ancien_statut] || h.ancien_statut || "—"} → {STATUT_OR_LABEL[h.nouveau_statut] || h.nouveau_statut}</>
                    )}
                  </span>
                </div>
              ))}
              {historique.length === 0 && <div className="text-[12.5px] text-slate-400">Aucun événement pour l'instant.</div>}
            </div>
          </div>
        </div>
      </div>
      {annulerOuvert && <AnnulerOrdreModal onClose={() => setAnnulerOuvert(false)} onConfirm={annuler} submitting={busy} />}
    </div>
  );
}

export default function OrdresReparationSection({
  garageId,
  rendezVous = [],
  devisList = [],
  mecaniciens = [],
  workshopStages = [],
  onToast,
  focusRendezVousId = null,
  onFocusRendezVousConsumed,
  focusDevisId = null,
  onFocusDevisConsumed,
  initialSearch = "",
}) {
  const [ordres, setOrdres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [statutFilter, setStatutFilter] = useState("tous");
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState({ rendezVousId: null, devisId: null });
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const flashToast = (message, tone) => (onToast ? onToast(message, tone) : console.log(message));

  const loadOrdres = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ordres_reparation")
      .select("*, clients (nom), vehicules (marque, modele, immatriculation), rendez_vous (date_debut)")
      .eq("garage_id", garageId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("Erreur chargement ordres de réparation :", error);
      flashToast("Impossible de charger les ordres de réparation", "error");
      return;
    }
    setOrdres(
      (data || []).map((o) => ({
        ...o,
        clientLabel: o.clients?.nom || "Client inconnu",
        vehiculeLabel: o.vehicules ? `${o.vehicules.marque || ""} ${o.vehicules.modele || ""}`.trim() : "Véhicule non renseigné",
        immatriculation: o.vehicules?.immatriculation || "",
      }))
    );
  };

  useEffect(() => {
    loadOrdres();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garageId]);

  // Points d'entrée externes (détail d'un rendez-vous, Dossier Véhicule,
  // devis accepté) : si le rendez-vous ciblé a déjà un OR, on l'ouvre
  // directement (contrat E, "Tentative de création d'un second OR...
  // redirection vers l'OR déjà existant") ; sinon on pré-ouvre la création.
  useEffect(() => {
    if (!focusRendezVousId && !focusDevisId) return;
    if (loading) return;
    if (focusRendezVousId) {
      const existant = trouverOrdrePourRendezVous(ordres, focusRendezVousId);
      if (existant) {
        setDetailId(existant.id);
      } else {
        setCreateInitial({ rendezVousId: focusRendezVousId, devisId: focusDevisId });
        setCreateOpen(true);
      }
    } else if (focusDevisId) {
      setCreateInitial({ rendezVousId: null, devisId: focusDevisId });
      setCreateOpen(true);
    }
    onFocusRendezVousConsumed && onFocusRendezVousConsumed();
    onFocusDevisConsumed && onFocusDevisConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRendezVousId, focusDevisId, loading]);

  const handleCreer = async (payload) => {
    setSubmittingCreate(true);
    const { data, error } = await supabase.from("ordres_reparation").insert(payload).select("id").single();
    setSubmittingCreate(false);
    if (error) {
      console.error("Erreur création ordre de réparation :", error);
      flashToast(traduireErreurOR(error), "error");
      return;
    }
    setCreateOpen(false);
    await loadOrdres();
    setDetailId(data.id);
  };

  const filtered = ordres.filter((o) => {
    const matchesStatut = statutFilter === "tous" || o.statut === statutFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || o.clientLabel.toLowerCase().includes(q) || o.vehiculeLabel.toLowerCase().includes(q) || o.immatriculation.toLowerCase().includes(q);
    return matchesStatut && matchesSearch;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Ordres de réparation</h1>
          <div className="text-[13px] text-slate-500 mt-0.5">Suivi interne du contenu et de l'avancement des réparations</div>
        </div>
        <button onClick={() => { setCreateInitial({ rendezVousId: null, devisId: null }); setCreateOpen(true); }} className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
          <Plus size={15} /> Nouvel ordre
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, véhicule, immatriculation…"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
          />
        </div>
        <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:border-blue-500">
          <option value="tous">Tous les statuts</option>
          {Object.entries(STATUT_OR_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((k) => (
            <div key={k} className="bg-white rounded-2xl border border-slate-200 h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        ordres.length === 0 && rendezVous.length === 0 ? (
          <EmptyState
            title="Aucun rendez-vous pour l'instant"
            subtitle="Un ordre de réparation prolonge toujours un rendez-vous existant — créez d'abord un rendez-vous depuis l'agenda."
          />
        ) : (
          <EmptyState
            title={ordres.length === 0 ? "Aucun ordre de réparation pour l'instant" : "Aucun résultat"}
            subtitle={ordres.length === 0 ? "Créez-en un depuis un rendez-vous existant, ou transformez un devis accepté." : "Essayez une autre recherche ou un autre filtre."}
          />
        )
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.map((o) => (
            <button key={o.id} onClick={() => setDetailId(o.id)} className="w-full min-h-[64px] flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-slate-900 truncate">{o.vehiculeLabel} {o.immatriculation && `· ${o.immatriculation}`}</div>
                <div className="text-[12.5px] text-slate-500 truncate">{o.clientLabel} · {o.rendez_vous ? formatDateHeureRdv(o.rendez_vous) : "—"}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {o.devis_id && <Badge tone="slate">Devis</Badge>}
                <Badge tone={STATUT_OR_TONE[o.statut]}>{STATUT_OR_LABEL[o.statut] || o.statut}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {createOpen && (
        <CreerOrdreModal
          rendezVous={rendezVous}
          devisList={devisList}
          ordres={ordres}
          garageId={garageId}
          initialRendezVousId={createInitial.rendezVousId}
          initialDevisId={createInitial.devisId}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreer}
          submitting={submittingCreate}
        />
      )}
      {detailId && (
        <OrdreDetail
          garageId={garageId}
          ordreId={detailId}
          workshopStages={workshopStages}
          mecaniciens={mecaniciens}
          onClose={() => setDetailId(null)}
          onToast={flashToast}
          onChanged={loadOrdres}
        />
      )}
    </div>
  );
}
