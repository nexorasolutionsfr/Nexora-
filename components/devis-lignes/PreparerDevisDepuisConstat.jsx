"use client";

// « Préparer le devis » depuis le dossier d'une voiture.
//
// Un seul écran, trois blocs, dans l'ordre où le garage pense :
//   1. Demande du client — ce pour quoi la voiture est là (le rendez-vous) ;
//   2. Constat du mécanicien — les points du contrôle, avec photos, à cocher ;
//   3. Travaux proposés — dans quel devis les lignes vont naître.
//
// Rien n'est retapé : le libellé et le commentaire de chaque constat sont
// copiés par la base (`preparer_devis_depuis_constat`), et les lignes
// arrivent « Prix à renseigner ». Le chiffrage se fait ensuite, dans
// l'éditeur habituel. Aucun message n'est préparé ni envoyé par ce geste.
//
// L'identifiant de reprise est tiré UNE fois à l'ouverture : un double clic,
// ou deux requêtes concurrentes, n'ajoutent rien deux fois — la base le
// garantit, l'écran se contente de ne pas générer un second identifiant.

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FileText, MessageSquare, X } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import { ACCENT, ACCENT_SOFT, NAVY } from "../garage-os/tokens";
import {
  CATEGORIE_LABEL,
  ETAT_POINT_TONE,
  GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES,
  INSPECTION_STATUT_LABEL,
  PHOTOS_BUCKET,
} from "../inspections/inspectionsConstants";
import PhotoEnGrand from "../inspections/PhotoEnGrand";
import { garderLeFocus } from "../garage-os/Portail";
import { STATUT_DEVIS_LABEL } from "./devisLignesConstants";
import { formatEuro } from "./calculs";
import { controleParDefaut, couvertureDesPoints, libelleRaison, proposerDevis, proposerPoints, referenceDevis, resumerReprise, visiteAUnDevisAccepte } from "./reprise";

const TONS = {
  amber: { bg: "#FEF3E2", text: "#B45309" },
  green: { bg: "#E7F6EC", text: "#15803D" },
  slate: { bg: "#F1F5F9", text: "#475569" },
  red: { bg: "#FDECEC", text: "#B91C1C" },
};

function Badge({ tone = "slate", children }) {
  const t = TONS[tone] || TONS.slate;
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: t.bg, color: t.text }}>{children}</span>;
}

function Bloc({ icone: Icone, titre, aide, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT_SOFT }}>
          <Icone size={14} color={ACCENT} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">{titre}</div>
          {aide && <div className="text-[12px] text-slate-500 leading-snug">{aide}</div>}
        </div>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function dateCourte(valeur) {
  if (!valeur) return "";
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Props :
 *  - garageId, vehicule, client : le contexte, déjà connu — on ne le redemande pas
 *  - rdv          : la visite courante, ou null
 *  - devis        : les devis du véhicule, déjà chargés par le dashboard
 *  - onPrepare    : (devisId, resultat) après une préparation réussie
 *  - onOuvrirDevis: (devisId) ouvre un devis existant (celui qui porte déjà un constat)
 *  - onFermer, onToast
 */
export default function PreparerDevisDepuisConstat({ garageId, vehicule, client, rdv = null, devis = [], onPrepare, onOuvrirDevis = null, onFermer, onToast, supabase = supabaseClient }) {
  const repriseId = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);
  const [inspections, setInspections] = useState(null);
  const [inspectionId, setInspectionId] = useState(null);
  const [points, setPoints] = useState([]);
  const [photos, setPhotos] = useState({});
  const [lignesCible, setLignesCible] = useState([]);
  const [coches, setCoches] = useState(null);
  const [cible, setCible] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [photoOuverte, setPhotoOuverte] = useState(null);
  const fermerRef = useRef(null);
  const fenetreRef = useRef(null);

  const toast = (m, t) => onToast?.(m, t);

  // Les contrôles de CETTE voiture. Le choix par défaut ne devine rien : un
  // seul contrôle, ou celui de la visite, sinon on demande.
  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, statut, verrouille_le, created_at, rendez_vous_id, kilometrage")
        .eq("garage_id", garageId)
        .eq("vehicule_id", vehicule.id)
        .order("created_at", { ascending: false });
      if (annule) return;
      if (error) { setErreur("Impossible de charger les contrôles de ce véhicule."); setInspections([]); return; }
      setInspections(data || []);
      setInspectionId(controleParDefaut(data || [], rdv?.id || null));
    })();
    return () => { annule = true; };
  }, [supabase, garageId, vehicule.id, rdv?.id]);

  // Les points et photos du contrôle choisi.
  useEffect(() => {
    if (!inspectionId) { setPoints([]); setPhotos({}); setCoches(null); return; }
    let annule = false;
    (async () => {
      const [{ data: pts, error: e1 }, { data: phs, error: e2 }] = await Promise.all([
        supabase.from("inspections_points").select("*").eq("inspection_id", inspectionId).order("created_at"),
        supabase.from("inspections_photos").select("id, point_id, storage_path").eq("inspection_id", inspectionId).order("created_at"),
      ]);
      if (annule) return;
      if (e1 || e2) { setErreur("Impossible de charger le détail de ce contrôle."); return; }
      setPoints(pts || []);
      setCoches(null);
      if ((phs || []).length === 0) { setPhotos({}); return; }
      const { data: signed } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrls(phs.map((p) => p.storage_path), GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES);
      if (annule) return;
      const parChemin = {};
      (signed || []).forEach((s) => { if (s.signedUrl && !s.error) parChemin[s.path] = s.signedUrl; });
      const parPoint = {};
      for (const p of phs) { const url = parChemin[p.storage_path]; if (url) (parPoint[p.point_id] ||= []).push(url); }
      setPhotos(parPoint);
    })();
    return () => { annule = true; };
  }, [supabase, inspectionId]);

  // Le devis réceptacle : proposé, jamais deviné.
  const { candidats, parDefaut } = useMemo(
    () => proposerDevis({ devis, vehiculeId: vehicule.id, rdvId: rdv?.id || null }),
    [devis, vehicule.id, rdv?.id],
  );
  const cibleEffective = cible ?? parDefaut;

  // Les lignes du devis réceptacle, pour signaler les constats déjà repris.
  useEffect(() => {
    if (!cibleEffective || cibleEffective === "nouveau") { setLignesCible([]); return; }
    const local = devis.find((d) => d.id === cibleEffective)?.devis_lignes;
    if (Array.isArray(local)) { setLignesCible(local); return; }
    let annule = false;
    supabase.from("devis_lignes").select("id, inspection_point_id").eq("devis_id", cibleEffective).then(({ data }) => { if (!annule) setLignesCible(data || []); });
    return () => { annule = true; };
  }, [supabase, cibleEffective, devis]);

  // Un constat déjà chiffré dans un AUTRE devis de la voiture (accepté, encore
  // modifiable ou refusé) n'est plus coché d'avance : le garage choisit entre
  // ouvrir ce devis et faire un complément, en le sachant.
  const couverture = useMemo(
    () => couvertureDesPoints(devis, cibleEffective === "nouveau" ? null : cibleEffective),
    [devis, cibleEffective],
  );
  const proposes = useMemo(() => proposerPoints(points, lignesCible, couverture), [points, lignesCible, couverture]);
  const complement = visiteAUnDevisAccepte(devis, rdv?.id || null);
  const acceptesDeLaVisite = rdv?.id ? devis.filter((d) => d.rendez_vous_id === rdv.id && d.statut === "accepte") : [];
  const selection = coches ?? Object.fromEntries(proposes.map((p) => [p.point.id, p.coche]));
  const nbCoches = proposes.filter((p) => selection[p.point.id]).length;
  const inspectionChoisie = (inspections || []).find((i) => i.id === inspectionId) || null;

  // Le focus se pose UNE fois, à l'ouverture. Rattaché à `onFermer` — une
  // fonction recréée à chaque rendu du parent — il revenait sur « Fermer » à
  // chaque rechargement de données, et un Entrée au clavier fermait la fenêtre
  // (mesuré au clavier CDP le 14 septembre 2026).
  const onFermerRef = useRef(onFermer);
  onFermerRef.current = onFermer;
  const photoOuverteRef = useRef(false);
  photoOuverteRef.current = Boolean(photoOuverte);
  useEffect(() => {
    const precedent = document.activeElement;
    fermerRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !photoOuverteRef.current) onFermerRef.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (precedent && typeof precedent.focus === "function" && document.contains(precedent)) precedent.focus();
    };
  }, []);

  const preparer = async () => {
    if (busy || !inspectionId || nbCoches === 0 || !repriseId.current) return;
    setBusy(true);
    setErreur(null);
    const { data, error } = await supabase.rpc("preparer_devis_depuis_constat", {
      p_reprise_id: repriseId.current,
      p_inspection_id: inspectionId,
      p_points: proposes.filter((p) => selection[p.point.id]).map((p) => p.point.id),
      p_devis_id: cibleEffective === "nouveau" ? null : cibleEffective,
      p_rendez_vous_id: rdv?.id || null,
    });
    setBusy(false);
    if (error) {
      const msg = /accès refusé|introuvable/i.test(error.message || "")
        ? "Préparation refusée : ce contrôle ou ce devis n'est pas accessible avec votre compte."
        : "La préparation n'a pas abouti. Rien n'a été ajouté. Réessayez.";
      setErreur(msg);
      toast(msg, "error");
      return;
    }
    const resume = resumerReprise(data);
    if (!data?.ok) { setErreur(resume); toast(resume, "error"); return; }
    toast(resume);
    onPrepare?.(data.devis_id, data);
  };

  const demande = rdv ? [rdv.prestation || rdv.prestations?.nom || null, rdv.notes || null].filter(Boolean) : [];

  return (
    <div ref={fenetreRef} onKeyDown={(e) => garderLeFocus(e, fenetreRef.current)} className="fixed inset-0 bg-black/40 z-[60] flex items-stretch sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Préparer le devis">
      <div className="bg-slate-50 w-full sm:max-w-xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto flex flex-col overflow-hidden">
        <div className="bg-white flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900">Préparer le devis</div>
            <div className="text-[12.5px] text-slate-500 truncate">
              {[vehicule.marque, vehicule.modele].filter(Boolean).join(" ") || "Véhicule"}{vehicule.immatriculation ? ` · ${vehicule.immatriculation}` : ""}{client?.nom ? ` · ${client.nom}` : ""}
            </div>
          </div>
          <button ref={fermerRef} type="button" onClick={onFermer} aria-label="Fermer" className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <Bloc icone={MessageSquare} titre="Demande du client" aide={rdv ? `Visite du ${dateCourte(rdv.date_debut)}` : "Aucune visite sélectionnée"}>
            {demande.length > 0 ? (
              <div className="text-[13px] text-slate-800 space-y-0.5">
                {demande.map((ligne, i) => <div key={i} className={i === 0 ? "font-medium" : "text-slate-600"}>{ligne}</div>)}
              </div>
            ) : (
              <div className="text-[12.5px] text-slate-400">Rien d'enregistré pour cette visite.</div>
            )}
          </Bloc>

          <Bloc icone={ClipboardList} titre="Constat du mécanicien" aide="Cochez les points à reprendre dans le devis. Les photos suivent la ligne.">
            {inspections === null ? (
              <div className="text-[12.5px] text-slate-400">Chargement du contrôle…</div>
            ) : inspections.length === 0 ? (
              <div className="text-[12.5px] text-slate-500">Aucun contrôle pour cette voiture. Créez-en un depuis « Contrôles » puis revenez ici.</div>
            ) : (
              <>
                {inspections.length > 1 && (
                  <div className="mb-2.5">
                    <label className="text-[11.5px] font-medium text-slate-500">Contrôle</label>
                    <select value={inspectionId || ""} onChange={(e) => setInspectionId(e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] bg-white min-h-[40px]">
                      <option value="">— Choisir un contrôle —</option>
                      {inspections.map((i) => (
                        <option key={i.id} value={i.id}>
                          {dateCourte(i.created_at)} · {INSPECTION_STATUT_LABEL[i.statut] || i.statut}{i.rendez_vous_id && rdv && i.rendez_vous_id === rdv.id ? " · cette visite" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {inspectionChoisie && proposes.length === 0 && (
                  <div className="text-[12.5px] text-slate-500">Ce contrôle n'a rien à signaler : tout est OK.</div>
                )}
                <div className="space-y-2">
                  {proposes.map(({ point, raison, devisLie, bloquant, etatLabel, valide }) => {
                    const desactive = bloquant;
                    const photosPoint = photos[point.id] || [];
                    const reprisAilleurs = Boolean(devisLie) && !bloquant;
                    return (
                      <label key={point.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${desactive ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white cursor-pointer"}`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 mt-0.5 shrink-0"
                          checked={Boolean(selection[point.id])}
                          disabled={desactive || busy}
                          onChange={(e) => setCoches({ ...selection, [point.id]: e.target.checked })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[13px] font-medium ${desactive ? "text-slate-500" : "text-slate-900"}`}>{point.libelle}</span>
                            <Badge tone={ETAT_POINT_TONE[point.etat]}>{etatLabel}</Badge>
                            {valide && <Badge tone="green">Validé par le client</Badge>}
                            {point.decision_client === "refuse" && <Badge tone="red">Refusé par le client</Badge>}
                          </span>
                          <span className="block text-[11.5px] text-slate-400">{CATEGORIE_LABEL[point.categorie] || point.categorie}</span>
                          {point.commentaire && <span className="block text-[12.5px] text-slate-600 mt-0.5">{point.commentaire}</span>}
                          {raison && <span className="block text-[12px] text-amber-700 mt-0.5">{libelleRaison(raison, devisLie)}</span>}
                          {reprisAilleurs && selection[point.id] && (
                            <span className="block text-[12px] text-slate-700 mt-0.5 font-medium">Complément : ce point sera chiffré à nouveau, le devis {referenceDevis(devisLie)} n&apos;est pas modifié.</span>
                          )}
                          {reprisAilleurs && onOuvrirDevis && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOuvrirDevis(devisLie.id); }}
                              className="mt-1 text-[12.5px] font-medium min-h-[32px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                              style={{ color: ACCENT }}
                            >
                              Ouvrir le devis {referenceDevis(devisLie)}
                            </button>
                          )}
                          {photosPoint.length > 0 && (
                            <span className="flex items-center gap-1.5 mt-1.5">
                              {photosPoint.map((url, i) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); setPhotoOuverte({ urls: photosPoint, index: i, titre: point.libelle, commentaire: point.commentaire }); }}
                                  aria-label={`Voir la photo en grand — ${point.libelle}${photosPoint.length > 1 ? ` (${i + 1} sur ${photosPoint.length})` : ""}`}
                                  className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </Bloc>

          <Bloc icone={FileText} titre="Travaux proposés" aide={nbCoches > 0 ? `${nbCoches} ligne${nbCoches > 1 ? "s" : ""} « Prix à renseigner » à chiffrer ensuite.` : "Aucun point coché."}>
            <div className="space-y-1.5">
              {/* Un devis accepté ne reçoit plus de lignes : on le montre, verrouillé,
                  pour qu'on l'ouvre plutôt que d'en refaire un sans le savoir. */}
              {acceptesDeLaVisite.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-slate-900">Devis accepté {referenceDevis(d)}</span>
                    <span className="block text-[12px] text-slate-500">{dateCourte(d.created_at)} · {formatEuro(d.montant_ttc)} TTC · verrouillé, il ne sera pas modifié</span>
                  </span>
                  {onOuvrirDevis && (
                    <button type="button" onClick={() => onOuvrirDevis(d.id)} className="shrink-0 min-h-[36px] px-3 rounded-lg text-[12.5px] font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">Ouvrir</button>
                  )}
                </div>
              ))}
              {candidats.map(({ devis: d, deLaVisite }) => (
                <label key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 cursor-pointer">
                  <input type="radio" name="devis-cible" className="w-4 h-4 shrink-0" checked={cibleEffective === d.id} onChange={() => setCible(d.id)} disabled={busy} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-slate-900">Compléter le devis {referenceDevis(d)}</span>
                    <span className="block text-[12px] text-slate-500">
                      {dateCourte(d.created_at)} · {formatEuro(d.montant_ttc)} TTC · {STATUT_DEVIS_LABEL[d.statut] || d.statut}{deLaVisite ? " · préparé pour cette visite" : " · sans visite"}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 cursor-pointer">
                <input type="radio" name="devis-cible" className="w-4 h-4 shrink-0" checked={cibleEffective === "nouveau"} onChange={() => setCible("nouveau")} disabled={busy} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-900">{complement ? "Nouveau devis complémentaire pour cette visite" : `Nouveau devis${rdv ? " pour cette visite" : ""}`}</span>
                  {complement && <span className="block text-[12px] text-slate-500">Pour un travail en plus de ce que le client a déjà accepté.</span>}
                </span>
              </label>
            </div>
            <div className="text-[11.5px] text-slate-400 mt-2">Rien n'est envoyé au client par ce geste. Le devis reste à chiffrer, puis à relire avant tout envoi.</div>
          </Bloc>

          {erreur && <div className="text-[12.5px] text-red-600">{erreur}</div>}
        </div>

        <div className="bg-white flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
          <button type="button" onClick={onFermer} disabled={busy} className="min-h-[40px] px-3.5 rounded-xl text-[13px] font-medium text-slate-600">Annuler</button>
          <button
            type="button"
            onClick={preparer}
            disabled={busy || !inspectionId || nbCoches === 0}
            className="min-h-[40px] px-4 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: NAVY }}
          >
            {busy ? "Préparation…" : cibleEffective === "nouveau" ? "Créer le devis" : "Ajouter au devis"}
          </button>
        </div>
      </div>

      {photoOuverte && (
        <PhotoEnGrand photos={photoOuverte.urls} indexInitial={photoOuverte.index} titre={photoOuverte.titre} commentaire={photoOuverte.commentaire} onFermer={() => setPhotoOuverte(null)} />
      )}
    </div>
  );
}
