"use client";

import { useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  ACCENT,
  ACCENT_SOFT,
  CATEGORIE_LABEL,
  CATEGORIES_ORDRE,
  ETAT_POINT_LABEL,
  ETAT_POINT_TONE,
  GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES,
  MAX_PHOTOS_PAR_INSPECTION,
  MAX_PHOTOS_PAR_POINT,
  NIVEAU_CARBURANT_OPTIONS,
  PHOTOS_BUCKET,
  SUGGESTIONS_PAR_CATEGORIE,
} from "./inspectionsConstants";

const ETATS = ["ok", "a_surveiller", "a_valider_client", "dommage"];

function EtatTone({ tone }) {
  const tones = { amber: "#B45309", green: "#15803D", slate: "#475569", red: "#B91C1C" };
  const bg = { amber: "#FEF3E2", green: "#E7F6EC", slate: "#F1F5F9", red: "#FDECEC" };
  return { color: tones[tone], backgroundColor: bg[tone] };
}

function EtatPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {ETATS.map((etat) => (
        <button
          key={etat}
          type="button"
          onClick={() => onChange(etat)}
          className="text-[12.5px] font-medium px-3 py-2 rounded-xl border text-left"
          style={
            value === etat
              ? { ...EtatTone({ tone: ETAT_POINT_TONE[etat] }), borderColor: "transparent" }
              : { color: "#64748B", borderColor: "#E2E8F0", backgroundColor: "#fff" }
          }
        >
          {ETAT_POINT_LABEL[etat]}
        </button>
      ))}
    </div>
  );
}

function PointCard({ point, photos, onUpdate, onDelete, onUploadPhoto, onDeletePhoto, uploading, totalPhotosCount }) {
  const pointPhotos = photos.filter((p) => p.point_id === point.id && p.url);
  const atLimitPoint = pointPhotos.length >= MAX_PHOTOS_PAR_POINT;
  const atLimitTotal = totalPhotosCount >= MAX_PHOTOS_PAR_INSPECTION;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{point.libelle}</div>
        <button onClick={() => onDelete(point.id)} className="text-slate-400 hover:text-red-600 shrink-0" title="Retirer ce point">
          <Trash2 size={15} />
        </button>
      </div>
      <EtatPicker
        value={point.etat}
        onChange={(etat) =>
          // Un point retiré de "à valider avec le client" ne peut plus rester soumis
          // à décision (contrainte base de données) : on le désélectionne au même moment.
          onUpdate(point.id, { etat, ...(etat !== "a_valider_client" && point.soumis_client ? { soumis_client: false } : {}) })
        }
      />
      <textarea
        value={point.commentaire || ""}
        onChange={(e) => onUpdate(point.id, { commentaire: e.target.value })}
        placeholder="Commentaire (facultatif)"
        rows={2}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500 resize-none"
      />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {pointPhotos.map((photo) => (
          <div key={photo.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200">
            <img src={photo.url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onDeletePhoto(photo)}
              className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-lg p-0.5"
              title="Supprimer la photo"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {!atLimitPoint && !atLimitTotal && (
          <label className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 cursor-pointer shrink-0">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadPhoto(point.id, file);
                e.target.value = "";
              }}
            />
            <Camera size={16} />
          </label>
        )}
      </div>
      {atLimitPoint && <div className="text-[11px] text-slate-400 mt-1">Limite de {MAX_PHOTOS_PAR_POINT} photos atteinte pour ce point.</div>}
    </div>
  );
}

function CategorieStep({ categorie, points, photos, onAddPoint, onUpdatePoint, onDeletePoint, onUploadPhoto, onDeletePhoto, uploadingId, totalPhotosCount }) {
  const [libelle, setLibelle] = useState("");
  const suggestions = SUGGESTIONS_PAR_CATEGORIE[categorie] || [];
  const pointsCategorie = points.filter((p) => p.categorie === categorie);
  const dejaAjoutes = new Set(pointsCategorie.map((p) => p.libelle));

  return (
    <div>
      <div className="text-[13px] text-slate-500 mb-3">Ajoutez un point pour chaque élément vérifié. Classez-le OK, à surveiller, à valider avec le client, ou dommage constaté.</div>
      {suggestions.filter((s) => !dejaAjoutes.has(s)).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.filter((s) => !dejaAjoutes.has(s)).map((s) => (
            <button key={s} onClick={() => onAddPoint(categorie, s)} className="text-[12px] font-medium px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 flex items-center gap-1">
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 mb-4">
        <input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Autre élément…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={() => {
            if (!libelle.trim()) return;
            onAddPoint(categorie, libelle.trim());
            setLibelle("");
          }}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-white shrink-0"
          style={{ backgroundColor: ACCENT }}
        >
          Ajouter
        </button>
      </div>
      <div className="space-y-3">
        {pointsCategorie.map((point) => (
          <PointCard
            key={point.id}
            point={point}
            photos={photos}
            onUpdate={onUpdatePoint}
            onDelete={onDeletePoint}
            onUploadPhoto={onUploadPhoto}
            onDeletePhoto={onDeletePhoto}
            uploading={uploadingId === point.id}
            totalPhotosCount={totalPhotosCount}
          />
        ))}
        {pointsCategorie.length === 0 && <div className="text-[13px] text-slate-400 text-center py-6">Aucun point ajouté pour cette catégorie.</div>}
      </div>
    </div>
  );
}

function ReviewStep({ points, onToggleSoumis }) {
  const eligibles = points.filter((p) => p.etat === "a_valider_client");
  const dommages = points.filter((p) => p.etat === "dommage");
  return (
    <div>
      <div className="text-[13px] text-slate-500 mb-3">
        Sélectionnez les points « à valider avec le client » qui seront soumis à décision sur le portail. Une validation ne porte que sur ces points précis.
      </div>
      {eligibles.length === 0 && (
        <div className="text-[13px] text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          Aucun point classé « à valider avec le client ». L'inspection pourra être finalisée sans décision client.
        </div>
      )}
      <div className="space-y-2 mb-5">
        {eligibles.map((p) => (
          <label key={p.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={!!p.soumis_client} onChange={(e) => onToggleSoumis(p.id, e.target.checked)} className="w-4 h-4" />
            <div className="flex-1 text-[13px] text-slate-800">{CATEGORIE_LABEL[p.categorie]} · {p.libelle}</div>
          </label>
        ))}
      </div>
      {dommages.length > 0 && (
        <>
          <div className="text-[12px] font-medium text-slate-500 mb-2">Constats "dommage" (visibles, non soumis à une validation) :</div>
          <div className="space-y-2">
            {dommages.map((p) => (
              <div key={p.id} className="text-[13px] text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                {CATEGORIE_LABEL[p.categorie]} · {p.libelle}
              </div>
            ))}
          </div>
          <div className="text-[11.5px] text-slate-400 mt-2">
            Un dommage constaté n'implique jamais une autorisation de travaux : seule une décision explicite du client sur un point soumis fait foi.
          </div>
        </>
      )}
    </div>
  );
}

export default function InspectionCaptureFlow({ inspection, points, photos, garageId, onClose, onToast, onUpdateInspectionFields, onAddPoint, onUpdatePoint, onDeletePoint, onPhotosChange, onFinaliser }) {
  const steps = useMemo(() => ["infos", ...CATEGORIES_ORDRE, "revue"], []);
  const [stepIndex, setStepIndex] = useState(0);
  const [uploadingId, setUploadingId] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const step = steps[stepIndex];

  const uploadPhoto = async (pointId, file) => {
    if (photos.length >= MAX_PHOTOS_PAR_INSPECTION) {
      onToast("Limite de photos atteinte pour cette inspection", "error");
      return;
    }
    setUploadingId(pointId);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${garageId}/${inspection.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      console.error("Erreur upload photo :", uploadError);
      onToast("Impossible d'envoyer la photo", "error");
      setUploadingId(null);
      return;
    }
    const { data: row, error } = await supabase
      .from("inspections_photos")
      .insert({ inspection_id: inspection.id, garage_id: garageId, point_id: pointId, storage_path: path })
      .select()
      .single();
    setUploadingId(null);
    if (error) {
      console.error("Erreur enregistrement photo :", error);
      onToast("Photo envoyée mais non enregistrée, réessayez", "error");
      return;
    }
    // Bucket privé : on signe immédiatement pour l'aperçu, avec la session
    // authenticated du garage (RLS storage.objects scope déjà à son garage).
    const { data: signedData, error: signError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(path, GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES);
    if (signError) {
      console.error("Erreur génération URL photo :", signError);
    }
    onPhotosChange([...photos, { ...row, url: signedData?.signedUrl || null }]);
  };

  const deletePhoto = async (photo) => {
    const { error } = await supabase.from("inspections_photos").delete().eq("id", photo.id).eq("garage_id", garageId);
    if (error) {
      console.error("Erreur suppression photo :", error);
      onToast("Impossible de supprimer la photo", "error");
      return;
    }
    await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
    onPhotosChange(photos.filter((p) => p.id !== photo.id));
  };

  const toggleSoumis = async (pointId, checked) => {
    await onUpdatePoint(pointId, { soumis_client: checked });
  };

  const finaliser = async () => {
    setFinalizing(true);
    await onFinaliser();
    setFinalizing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-stretch sm:items-center sm:justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div>
            <div className="text-sm font-semibold text-slate-900">Saisie de l'inspection</div>
            <div className="text-[11.5px] text-slate-400">{inspection.vehiculeLabel || "Véhicule non renseigné"}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%`, backgroundColor: ACCENT }} />
          </div>
          <div className="text-[11.5px] text-slate-400 mt-1.5">
            Étape {stepIndex + 1} / {steps.length} ·{" "}
            {step === "infos" ? "Informations" : step === "revue" ? "Revue" : CATEGORIE_LABEL[step]}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === "infos" && (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-slate-500">Kilométrage</label>
                <input
                  type="number"
                  min="0"
                  value={inspection.kilometrage ?? ""}
                  onChange={(e) => onUpdateInspectionFields({ kilometrage: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Ex. 84 500"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-500">Niveau de carburant</label>
                <div className="grid grid-cols-5 gap-1.5 mt-1">
                  {NIVEAU_CARBURANT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onUpdateInspectionFields({ niveau_carburant: opt.value })}
                      className="text-[11.5px] font-medium py-2 rounded-lg border"
                      style={inspection.niveau_carburant === opt.value ? { backgroundColor: ACCENT_SOFT, color: ACCENT, borderColor: "transparent" } : { color: "#64748B", borderColor: "#E2E8F0" }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {CATEGORIES_ORDRE.includes(step) && (
            <CategorieStep
              categorie={step}
              points={points}
              photos={photos}
              onAddPoint={onAddPoint}
              onUpdatePoint={onUpdatePoint}
              onDeletePoint={onDeletePoint}
              onUploadPhoto={uploadPhoto}
              onDeletePhoto={deletePhoto}
              uploadingId={uploadingId}
              totalPhotosCount={photos.length}
            />
          )}
          {step === "revue" && <ReviewStep points={points} onToggleSoumis={toggleSoumis} />}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 shrink-0 gap-2">
          <button
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft size={15} /> Précédent
          </button>
          {step !== "revue" ? (
            <button
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1"
              style={{ backgroundColor: ACCENT }}
            >
              Suivant <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={finaliser} disabled={finalizing} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#16A34A" }}>
              {finalizing ? "Finalisation…" : "Finaliser l'inspection"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
