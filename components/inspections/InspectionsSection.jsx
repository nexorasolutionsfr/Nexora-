"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Copy, Link2, Plus, RotateCcw, Search, ShieldOff, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ACCENT,
  ACCENT_SOFT,
  CATEGORIE_LABEL,
  ETAT_POINT_LABEL,
  ETAT_POINT_TONE,
  INSPECTION_STATUT_LABEL,
  INSPECTION_TONE,
  NIVEAU_CARBURANT_LABEL,
  PHOTOS_BUCKET,
} from "./inspectionsConstants";
import InspectionCaptureFlow from "./InspectionCaptureFlow";

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
        <ClipboardList size={19} color={ACCENT} />
      </div>
      <div className="text-slate-900 font-medium text-sm">{title}</div>
      {subtitle && <div className="text-slate-500 text-[13px] mt-1">{subtitle}</div>}
      {action}
    </div>
  );
}

function CreerInspectionModal({ clients, rendezVous, onClose, onSubmit, submitting }) {
  const [clientId, setClientId] = useState("");
  const [clientNomLibre, setClientNomLibre] = useState("");
  const [vehiculeId, setVehiculeId] = useState("");
  const [vehiculeLibelleLibre, setVehiculeLibelleLibre] = useState("");
  const [immatriculationLibre, setImmatriculationLibre] = useState("");
  const [rdvId, setRdvId] = useState("");
  const [kilometrage, setKilometrage] = useState("");

  const client = clients.find((c) => c.id === clientId);
  const vehiculesClient = client?.vehicules || [];
  const rdvsClient = clientId ? rendezVous.filter((r) => r.client_id === clientId) : [];

  const clientOk = clientId || clientNomLibre.trim();
  const vehiculeOk = vehiculeId || vehiculeLibelleLibre.trim() || immatriculationLibre.trim();
  const peutValider = clientOk && vehiculeOk;

  const submit = () => {
    if (!peutValider) return;
    onSubmit({
      client_id: clientId || null,
      client_nom_libre: clientId ? null : clientNomLibre.trim(),
      vehicule_id: vehiculeId || null,
      vehicule_libelle_libre: vehiculeId ? null : vehiculeLibelleLibre.trim(),
      immatriculation_libre: vehiculeId ? null : immatriculationLibre.trim(),
      rendez_vous_id: rdvId || null,
      kilometrage: kilometrage ? Number(kilometrage) : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md text-slate-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Nouvelle inspection</h2>
        <div className="text-[12.5px] text-slate-500 mt-1">
          Client et véhicule existants si disponibles, sinon une simple immatriculation ou un libellé véhicule suffit pour démarrer.
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Client existant (facultatif)</label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setVehiculeId(""); setRdvId(""); }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">— Aucun / client libre —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          {!clientId && (
            <div>
              <label className="text-[12px] font-medium text-slate-500">Nom du client</label>
              <input value={clientNomLibre} onChange={(e) => setClientNomLibre(e.target.value)} placeholder="Ex. M. Martin" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          )}
          {clientId && vehiculesClient.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-slate-500">Véhicule existant (facultatif)</label>
              <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="">— Aucun / véhicule libre —</option>
                {vehiculesClient.map((v) => (
                  <option key={v.id} value={v.id}>{v.marque} {v.modele} · {v.immatriculation}</option>
                ))}
              </select>
            </div>
          )}
          {!vehiculeId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-slate-500">Véhicule (libellé)</label>
                <input value={vehiculeLibelleLibre} onChange={(e) => setVehiculeLibelleLibre(e.target.value)} placeholder="Ex. Clio 4" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-500">Immatriculation</label>
                <input value={immatriculationLibre} onChange={(e) => setImmatriculationLibre(e.target.value)} placeholder="Ex. AB-123-CD" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
              </div>
            </div>
          )}
          {clientId && rdvsClient.length > 0 && (
            <div>
              <label className="text-[12px] font-medium text-slate-500">Rendez-vous associé (facultatif)</label>
              <select value={rdvId} onChange={(e) => setRdvId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="">—</option>
                {rdvsClient.map((r) => (
                  <option key={r.id} value={r.id}>{new Date(r.date_debut).toLocaleDateString("fr-FR")} · {r.prestations?.nom || "RDV"}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[12px] font-medium text-slate-500">Kilométrage (facultatif)</label>
            <input type="number" min="0" value={kilometrage} onChange={(e) => setKilometrage(e.target.value)} placeholder="Ex. 84 500" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Annuler</button>
          <button onClick={submit} disabled={submitting || !peutValider} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {submitting ? "Création…" : "Créer et démarrer la saisie"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReouvrirModal({ onClose, onConfirm, submitting }) {
  const [motif, setMotif] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Réouvrir l'inspection</h2>
        <div className="text-[12.5px] text-slate-500 mt-1">
          Le lien client existant sera révoqué immédiatement. Cette action et son motif sont tracés dans l'historique.
        </div>
        <div className="mt-4">
          <label className="text-[12px] font-medium text-slate-500">Motif (obligatoire)</label>
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} placeholder="Ex. erreur sur l'état d'un pneu à corriger" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600">Annuler</button>
          <button onClick={() => onConfirm(motif.trim())} disabled={submitting || !motif.trim()} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#B45309" }}>
            {submitting ? "Réouverture…" : "Réouvrir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PointReadRow({ point, photos }) {
  const pointPhotos = photos.filter((p) => p.point_id === point.id);
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[13px] font-medium text-slate-800">{CATEGORIE_LABEL[point.categorie]} · {point.libelle}</div>
        <div className="flex items-center gap-1.5">
          <Badge tone={ETAT_POINT_TONE[point.etat]}>{ETAT_POINT_LABEL[point.etat]}</Badge>
          {point.soumis_client && <Badge tone="slate">Soumis au client</Badge>}
          {point.decision_client && <Badge tone={point.decision_client === "valide" ? "green" : "red"}>{point.decision_client === "valide" ? "Validé par le client" : "Refusé par le client"}</Badge>}
        </div>
      </div>
      {point.commentaire && <div className="text-[12.5px] text-slate-500 mt-1.5">{point.commentaire}</div>}
      {pointPhotos.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {pointPhotos.map((ph) => (
            <img key={ph.id} src={ph.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionDetail({ garageId, inspectionId, onClose, onToast, onChanged }) {
  const [data, setData] = useState(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [reouvrirOpen, setReouvrirOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState("");

  const load = async () => {
    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*, clients (nom), vehicules (marque, modele, immatriculation)")
      .eq("id", inspectionId)
      .eq("garage_id", garageId)
      .single();
    if (error) {
      console.error("Erreur chargement inspection :", error);
      onToast("Impossible de charger cette inspection", "error");
      return;
    }
    const [{ data: points, error: pointsError }, { data: photosRows, error: photosError }, { data: historique, error: histError }] = await Promise.all([
      supabase.from("inspections_points").select("*").eq("inspection_id", inspectionId).order("created_at"),
      supabase.from("inspections_photos").select("*").eq("inspection_id", inspectionId).order("created_at"),
      supabase.from("inspections_historique").select("*").eq("inspection_id", inspectionId).order("created_at", { ascending: false }),
    ]);
    if (pointsError || photosError || histError) {
      console.error("Erreur chargement détail inspection :", pointsError || photosError || histError);
      onToast("Impossible de charger le détail de cette inspection", "error");
      return;
    }
    const photos = (photosRows || []).map((p) => ({ ...p, url: supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(p.storage_path).data.publicUrl }));
    setData({
      inspection: {
        ...inspection,
        vehiculeLabel: inspection.vehicules ? `${inspection.vehicules.marque || ""} ${inspection.vehicules.modele || ""}`.trim() : inspection.vehicule_libelle_libre,
        clientLabel: inspection.clients?.nom || inspection.client_nom_libre || "Client libre",
      },
      points: points || [],
      photos,
      historique: historique || [],
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  if (!data) return null;
  const { inspection, points, photos, historique } = data;

  const updateInspectionFields = async (fields) => {
    setData((prev) => ({ ...prev, inspection: { ...prev.inspection, ...fields } }));
    const { error } = await supabase.from("inspections").update(fields).eq("id", inspectionId).eq("garage_id", garageId);
    if (error) {
      console.error("Erreur mise à jour inspection :", error);
      onToast("Impossible d'enregistrer cette modification", "error");
    }
  };

  const addPoint = async (categorie, libelle) => {
    const { data: row, error } = await supabase
      .from("inspections_points")
      .insert({ inspection_id: inspectionId, garage_id: garageId, categorie, libelle, etat: "ok" })
      .select()
      .single();
    if (error) {
      console.error("Erreur ajout point :", error);
      onToast("Impossible d'ajouter ce point", "error");
      return;
    }
    setData((prev) => ({ ...prev, points: [...prev.points, row] }));
  };

  const updatePoint = async (pointId, changes) => {
    setData((prev) => ({ ...prev, points: prev.points.map((p) => (p.id === pointId ? { ...p, ...changes } : p)) }));
    const { error } = await supabase.from("inspections_points").update(changes).eq("id", pointId).eq("garage_id", garageId);
    if (error) {
      console.error("Erreur mise à jour point :", error);
      onToast("Impossible de mettre à jour ce point", "error");
    }
  };

  const deletePoint = async (pointId) => {
    const { error } = await supabase.from("inspections_points").delete().eq("id", pointId).eq("garage_id", garageId);
    if (error) {
      console.error("Erreur suppression point :", error);
      onToast("Impossible de retirer ce point", "error");
      return;
    }
    setData((prev) => ({ ...prev, points: prev.points.filter((p) => p.id !== pointId) }));
  };

  const finaliser = async () => {
    const { data: statut, error } = await supabase.rpc("finaliser_inspection", { p_inspection_id: inspectionId });
    if (error) {
      console.error("Erreur finalisation inspection :", error);
      onToast("Impossible de finaliser cette inspection", "error");
      return;
    }
    setCaptureOpen(false);
    await load();
    onChanged();
    onToast(statut === "finalisee_sans_decision" ? "Inspection finalisée — sans décision client" : "Inspection finalisée, en attente de décision client");
  };

  const copierLien = async () => {
    setBusy(true);
    const { data: token, error } = await supabase.rpc("creer_jeton_inspection", { p_inspection_id: inspectionId });
    setBusy(false);
    if (error || !token) {
      console.error("Erreur génération lien :", error);
      onToast("Impossible de générer le lien", "error");
      return;
    }
    const url = `${window.location.origin}/i/${token}`;
    setLastLink(url);
    try {
      await navigator.clipboard.writeText(url);
      onToast("Lien copié — partagez-le manuellement avec le client");
    } catch {
      onToast("Lien généré, copiez-le manuellement ci-dessous");
    }
  };

  const revoquerLien = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("revoquer_jeton_inspection", { p_inspection_id: inspectionId });
    setBusy(false);
    if (error) {
      console.error("Erreur révocation lien :", error);
      onToast("Impossible de révoquer le lien", "error");
      return;
    }
    setLastLink("");
    onToast("Lien révoqué");
  };

  const reouvrir = async (motif) => {
    setBusy(true);
    const { error } = await supabase.rpc("reouvrir_inspection", { p_inspection_id: inspectionId, p_motif: motif });
    setBusy(false);
    if (error) {
      console.error("Erreur réouverture inspection :", error);
      onToast(error.message?.includes("Motif") ? error.message : "Impossible de réouvrir cette inspection", "error");
      return;
    }
    setReouvrirOpen(false);
    setLastLink("");
    await load();
    onChanged();
    onToast("Inspection réouverte, lien précédent révoqué");
  };

  const estVerrouillee = !!inspection.verrouille_le;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center sm:justify-center">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="text-base font-semibold text-slate-900">{inspection.vehiculeLabel || "Véhicule non renseigné"}</div>
            <div className="text-[12.5px] text-slate-500">{inspection.clientLabel}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={INSPECTION_TONE[inspection.statut]}>{INSPECTION_STATUT_LABEL[inspection.statut]}</Badge>
            {inspection.kilometrage != null && <span className="text-[12.5px] text-slate-500">{inspection.kilometrage.toLocaleString("fr-FR")} km</span>}
            {inspection.niveau_carburant && <span className="text-[12.5px] text-slate-500">Carburant : {NIVEAU_CARBURANT_LABEL[inspection.niveau_carburant]}</span>}
            {inspection.immatriculation_libre && <span className="text-[12.5px] text-slate-500">{inspection.immatriculation_libre}</span>}
          </div>

          {!estVerrouillee && (
            <button onClick={() => setCaptureOpen(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
              Reprendre la saisie
            </button>
          )}

          {estVerrouillee && (
            <div className="flex flex-wrap gap-2">
              <button onClick={copierLien} disabled={busy} className="px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                <Copy size={13} /> Copier le lien client
              </button>
              <button onClick={revoquerLien} disabled={busy} className="px-3.5 py-2 rounded-xl text-[13px] font-medium text-slate-600 border border-slate-200 flex items-center gap-1.5 disabled:opacity-50">
                <ShieldOff size={13} /> Révoquer le lien
              </button>
              <button onClick={() => setReouvrirOpen(true)} className="px-3.5 py-2 rounded-xl text-[13px] font-medium text-amber-700 border border-amber-200 flex items-center gap-1.5">
                <RotateCcw size={13} /> Réouvrir l'inspection
              </button>
            </div>
          )}
          {lastLink && (
            <div className="text-[12px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2">
              <Link2 size={13} className="text-slate-400 shrink-0" />
              <span className="truncate flex-1">{lastLink}</span>
            </div>
          )}

          <div>
            <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Points de contrôle</div>
            <div className="space-y-2">
              {points.map((p) => (
                <PointReadRow key={p.id} point={p} photos={photos} />
              ))}
              {points.length === 0 && <div className="text-[13px] text-slate-400">Aucun point saisi pour l'instant.</div>}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Historique</div>
            <div className="space-y-1.5">
              {historique.map((h) => (
                <div key={h.id} className="text-[12px] text-slate-500 flex items-center gap-2">
                  <span className="text-slate-400">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  <span>
                    {h.action === "reouverture" ? `Réouverte (motif : ${h.motif})` : `Statut : ${INSPECTION_STATUT_LABEL[h.ancien_statut] || h.ancien_statut || "—"} → ${INSPECTION_STATUT_LABEL[h.nouveau_statut] || h.nouveau_statut}`}
                  </span>
                </div>
              ))}
              {historique.length === 0 && <div className="text-[12.5px] text-slate-400">Aucun événement pour l'instant.</div>}
            </div>
          </div>
        </div>
      </div>

      {captureOpen && (
        <InspectionCaptureFlow
          inspection={inspection}
          points={points}
          photos={photos}
          garageId={garageId}
          onToast={onToast}
          onClose={() => setCaptureOpen(false)}
          onUpdateInspectionFields={updateInspectionFields}
          onAddPoint={addPoint}
          onUpdatePoint={updatePoint}
          onDeletePoint={deletePoint}
          onPhotosChange={(newPhotos) => setData((prev) => ({ ...prev, photos: newPhotos }))}
          onFinaliser={finaliser}
        />
      )}
      {reouvrirOpen && <ReouvrirModal onClose={() => setReouvrirOpen(false)} onConfirm={reouvrir} submitting={busy} />}
    </div>
  );
}

export default function InspectionsSection({ garageId, clients = [], rendezVous = [], onToast }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("tous");
  const [createOpen, setCreateOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const flashToast = (message, tone) => (onToast ? onToast(message, tone) : console.log(message));

  const loadInspections = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inspections")
      .select("*, clients (nom), vehicules (marque, modele, immatriculation)")
      .eq("garage_id", garageId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("Erreur chargement inspections :", error);
      flashToast("Impossible de charger les inspections", "error");
      return;
    }
    setInspections(
      (data || []).map((i) => ({
        ...i,
        clientLabel: i.clients?.nom || i.client_nom_libre || "Client libre",
        vehiculeLabel: i.vehicules ? `${i.vehicules.marque || ""} ${i.vehicules.modele || ""}`.trim() : i.vehicule_libelle_libre || "Véhicule non renseigné",
        immatriculation: i.vehicules?.immatriculation || i.immatriculation_libre || "",
      }))
    );
  };

  useEffect(() => {
    loadInspections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garageId]);

  const handleCreer = async (fields) => {
    setSubmittingCreate(true);
    const { data, error } = await supabase
      .from("inspections")
      .insert({ garage_id: garageId, statut: "brouillon", ...fields })
      .select("*, clients (nom), vehicules (marque, modele, immatriculation)")
      .single();
    setSubmittingCreate(false);
    if (error) {
      console.error("Erreur création inspection :", error);
      flashToast("Impossible de créer cette inspection", "error");
      return;
    }
    setCreateOpen(false);
    await loadInspections();
    setDetailId(data.id);
  };

  const filtered = inspections.filter((i) => {
    const matchesStatut = statutFilter === "tous" || i.statut === statutFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || i.clientLabel.toLowerCase().includes(q) || i.vehiculeLabel.toLowerCase().includes(q) || i.immatriculation.toLowerCase().includes(q);
    return matchesStatut && matchesSearch;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inspections</h1>
          <div className="text-[13px] text-slate-500 mt-0.5">Contrôle véhicule digital avant intervention</div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
          <Plus size={15} /> Nouvelle inspection
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
          {Object.entries(INSPECTION_STATUT_LABEL).map(([value, label]) => (
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
        <EmptyState
          title={inspections.length === 0 ? "Aucune inspection pour l'instant" : "Aucun résultat"}
          subtitle={inspections.length === 0 ? "Créez une inspection avant la prochaine intervention." : "Essayez une autre recherche ou un autre filtre."}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {filtered.map((i) => (
            <button key={i.id} onClick={() => setDetailId(i.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-slate-900 truncate">{i.vehiculeLabel} {i.immatriculation && `· ${i.immatriculation}`}</div>
                <div className="text-[12.5px] text-slate-500 truncate">{i.clientLabel} · {new Date(i.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <Badge tone={INSPECTION_TONE[i.statut]}>{INSPECTION_STATUT_LABEL[i.statut]}</Badge>
            </button>
          ))}
        </div>
      )}

      {createOpen && (
        <CreerInspectionModal clients={clients} rendezVous={rendezVous} onClose={() => setCreateOpen(false)} onSubmit={handleCreer} submitting={submittingCreate} />
      )}
      {detailId && (
        <InspectionDetail
          garageId={garageId}
          inspectionId={detailId}
          onClose={() => setDetailId(null)}
          onToast={flashToast}
          onChanged={loadInspections}
        />
      )}
    </div>
  );
}
