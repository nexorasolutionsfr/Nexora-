"use client";

// Devis multi-lignes V1 — éditeur de lignes (main-d'œuvre / pièces).
// Contrat : docs/architecture/devis-multi-lignes-v1.md, section I.
//
// La base est la seule source de vérité : chaque mutation (ajout, édition,
// suppression, réordonnancement) est envoyée à Supabase, puis les lignes ET
// les totaux du devis sont RELUS depuis la base et remontés au parent via
// onChange. Les montants affichés pendant la saisie sont calculés avec la
// même règle d'arrondi (calculs.js) pour un retour immédiat, jamais pour se
// substituer aux colonnes générées.
//
// Depuis le 2026-09-19, une ligne peut venir d'un CONSTAT du contrôle
// véhicule (docs/architecture/constat-vers-devis-v1.md). Elle porte alors :
//   - `inspection_point_id` : le constat d'origine, dont on montre la note et
//     les photos — signées au moment de la consultation, avec les droits du
//     garage, jamais stockées ;
//   - `prix_a_renseigner` : l'état « pas encore chiffré ». Le 0 qui
//     l'accompagne n'est pas un prix, et l'écran ne l'affiche jamais comme tel.
//
// Le client Supabase est injectable (prop `client`) pour permettre un rendu
// hors réseau (harnais local, tests) — par défaut, le client applicatif.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookmarkPlus, Camera, ClipboardList, LayoutTemplate, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import { ACCENT, ACCENT_SOFT } from "../garage-os/tokens";
import { GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES, PHOTOS_BUCKET } from "../inspections/inspectionsConstants";
import PhotoEnGrand from "../inspections/PhotoEnGrand";
import { STATUT_DEVIS_LABEL, TAUX_TVA_COURANTS, TAUX_TVA_DEFAUT, TYPE_LIGNE_LABEL } from "./devisLignesConstants";
import {
  calculerLigne,
  calculerTotaux,
  deplacerLigne,
  devisStatutModifiable,
  formatEuro,
  normaliserLigneDevis,
  preremplirDepuisPrestation,
  traduireErreurDevisLignes,
  trierLignes,
  validerLigneDevisForm,
} from "./calculs";

const COLONNES_LIGNE = "id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position, prestation_id, montant_ht, montant_tva, created_at, updated_at, inspection_point_id, reprise_id, note_constat, prix_a_renseigner";

const champInput = "mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white min-h-[40px]";

export function BadgePrixARenseigner({ compact = false, libelle = "Prix à renseigner" }) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${compact ? "text-[11px] px-2 py-0.5" : "text-[11.5px] px-2.5 py-1"}`} style={{ backgroundColor: "#FEF3E2", color: "#B45309" }}>
      {libelle}
    </span>
  );
}

/**
 * Les constats déjà présents sur le devis, pour qu'une pièce ajoutée à la
 * main puisse se rattacher au même constat que la main-d'œuvre. Un constat =
 * une entrée, même s'il porte déjà deux lignes.
 */
function constatsDesLignes(lignes) {
  const vus = new Map();
  for (const l of lignes) {
    if (l.inspection_point_id && !vus.has(l.inspection_point_id)) {
      vus.set(l.inspection_point_id, { id: l.inspection_point_id, libelle: l.libelle, note: l.note_constat || null });
    }
  }
  return Array.from(vus.values());
}

function LigneDevisForm({ initial, prestations = [], constats = [], onSave, onCancel, submitting }) {
  const aRenseigner = Boolean(initial?.prix_a_renseigner);
  const [type, setType] = useState(initial?.type || "main_oeuvre");
  const [libelle, setLibelle] = useState(initial?.libelle || "");
  const [quantite, setQuantite] = useState(initial?.quantite ?? 1);
  // Une ligne « Prix à renseigner » arrive avec le champ VIDE, pas avec 0 :
  // ce 0 n'est pas un prix, et le montrer ferait croire qu'il l'est.
  const [prixUnitaireHt, setPrixUnitaireHt] = useState(aRenseigner ? "" : (initial?.prix_unitaire_ht ?? ""));
  const [tauxTva, setTauxTva] = useState(initial?.taux_tva ?? TAUX_TVA_DEFAUT);
  const [prestationId, setPrestationId] = useState(initial?.prestation_id || "");
  const [constatId, setConstatId] = useState(initial?.inspection_point_id || "");
  const [erreurs, setErreurs] = useState({});

  const apercu = calculerLigne({ quantite, prix_unitaire_ht: prixUnitaireHt, taux_tva: tauxTva });
  const prixVide = prixUnitaireHt === "" || prixUnitaireHt == null;

  const choisirPrestation = (id) => {
    setPrestationId(id);
    const pre = preremplirDepuisPrestation(prestations.find((p) => p.id === id));
    if (!pre) return;
    // Pré-remplissage uniquement : les champs restent modifiables ensuite.
    setType(pre.type);
    setLibelle(pre.libelle);
    setPrixUnitaireHt(pre.prix_unitaire_ht);
  };

  const submit = () => {
    const champs = {
      type, libelle, quantite, prix_unitaire_ht: prixUnitaireHt, taux_tva: tauxTva,
      prestation_id: prestationId || null,
      prix_a_renseigner: aRenseigner,
      // Une ligne nouvelle peut se rattacher à un constat déjà sur le devis ;
      // une ligne existante garde le sien.
      inspection_point_id: initial ? initial.inspection_point_id || null : (constatId || null),
    };
    const { valide, erreurs: nouvellesErreurs } = validerLigneDevisForm(champs);
    setErreurs(nouvellesErreurs);
    if (!valide) return;
    onSave(normaliserLigneDevis(champs));
  };

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
      {prestations.length > 0 && (
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Pré-remplir depuis une prestation (facultatif)</label>
          <select value={prestationId} onChange={(e) => choisirPrestation(e.target.value)} className={champInput}>
            <option value="">— Saisie libre —</option>
            {prestations.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}{p.prix_ht != null ? ` (${formatEuro(p.prix_ht)} HT)` : ""}</option>
            ))}
          </select>
          <div className="text-[11px] text-slate-400 mt-0.5">Le libellé et le prix sont copiés ici, puis figés sur la ligne : la prestation n'est plus relue ensuite.</div>
        </div>
      )}
      {!initial && constats.length > 0 && (
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Constat concerné (facultatif)</label>
          <select value={constatId} onChange={(e) => setConstatId(e.target.value)} className={champInput}>
            <option value="">— Aucun —</option>
            {constats.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle}</option>
            ))}
          </select>
          <div className="text-[11px] text-slate-400 mt-0.5">Pour qu'une pièce reste rattachée au même constat que sa main-d'œuvre.</div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={champInput}>
            <option value="main_oeuvre">{TYPE_LIGNE_LABEL.main_oeuvre}</option>
            <option value="piece">{TYPE_LIGNE_LABEL.piece}</option>
          </select>
          {erreurs.type && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.type}</div>}
        </div>
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={type === "main_oeuvre" ? "Ex. Remplacement plaquettes avant" : "Ex. Jeu de plaquettes avant"} className={champInput} />
          {erreurs.libelle && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.libelle}</div>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Quantité</label>
          <input type="number" inputMode="decimal" min="0.001" step="0.001" value={quantite} onChange={(e) => setQuantite(e.target.value)} className={champInput} />
          {erreurs.quantite && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.quantite}</div>}
        </div>
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Prix unitaire HT</label>
          {/* « Chiffrer la ligne » ouvre ce formulaire pour le prix : le focus y va,
              sinon il retombait sur la page et le clavier repartait du haut. */}
          <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus={aRenseigner} value={prixUnitaireHt} onChange={(e) => setPrixUnitaireHt(e.target.value)} placeholder={aRenseigner ? "À renseigner" : "0,00"} className={champInput} />
          {erreurs.prix_unitaire_ht && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.prix_unitaire_ht}</div>}
          {aRenseigner && !erreurs.prix_unitaire_ht && (
            <div className="text-[11px] text-amber-700 mt-0.5">
              {prixVide ? "Laissez vide pour garder « Prix à renseigner ». Tapez 0 pour un prix nul confirmé." : "Ce prix remplacera « Prix à renseigner »."}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">TVA (%)</label>
          <input type="number" inputMode="decimal" min="0" max="100" step="0.1" list="devis-lignes-taux-tva" value={tauxTva} onChange={(e) => setTauxTva(e.target.value)} className={champInput} />
          <datalist id="devis-lignes-taux-tva">
            {TAUX_TVA_COURANTS.map((t) => <option key={t} value={t} />)}
          </datalist>
          {erreurs.taux_tva && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.taux_tva}</div>}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
        <div className="text-[12.5px] text-slate-600">
          {aRenseigner && prixVide ? (
            <span>Cette ligne : <BadgePrixARenseigner compact /></span>
          ) : (
            <>Cette ligne : <span className="font-semibold text-slate-900">{formatEuro(apercu.montant_ht)} HT</span> · TVA {formatEuro(apercu.montant_tva)} · <span className="font-semibold text-slate-900">{formatEuro(apercu.montant_ttc)} TTC</span></>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[40px] px-3.5 rounded-lg text-[13px] font-medium text-slate-500">Annuler</button>
          <button type="button" onClick={submit} disabled={submitting} className="min-h-[40px] px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {submitting ? "Enregistrement…" : "Enregistrer la ligne"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Le constat d'où vient la ligne : sa note, ses photos. Rien d'autre. */
function ProvenanceConstat({ ligne, photos = [], onOuvrirPhoto }) {
  if (!ligne.inspection_point_id) return null;
  return (
    <div className="mt-1.5 flex items-start gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
        <ClipboardList size={11} /> Constat
      </span>
      {ligne.note_constat && <span className="text-[12px] text-slate-500 min-w-0 break-words">{ligne.note_constat}</span>}
      {photos.length > 0 && (
        <span className="flex items-center gap-1">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => onOuvrirPhoto(photos, i, ligne.libelle, ligne.note_constat)}
              aria-label={`Voir la photo du constat en grand — ${ligne.libelle}${photos.length > 1 ? ` (${i + 1} sur ${photos.length})` : ""}`}
              className="w-9 h-9 rounded-md overflow-hidden border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function LigneDevisRow({ ligne, index, total, modifiable, prestations, photosConstat, onOuvrirPhoto, onUpdate, onDelete, onMove, submitting }) {
  const [editing, setEditing] = useState(false);
  const aRenseigner = ligne.prix_a_renseigner === true;
  const montants = ligne.montant_ht != null && ligne.montant_tva != null
    ? { montant_ht: Number(ligne.montant_ht), montant_tva: Number(ligne.montant_tva), montant_ttc: Number(ligne.montant_ht) + Number(ligne.montant_tva) }
    : calculerLigne(ligne);

  if (editing) {
    return (
      <LigneDevisForm
        initial={ligne}
        prestations={prestations}
        submitting={submitting}
        onCancel={() => setEditing(false)}
        onSave={async (champs) => { const ok = await onUpdate(ligne.id, champs); if (ok !== false) setEditing(false); }}
      />
    );
  }

  const grille = modifiable
    ? "md:grid md:grid-cols-[minmax(0,1fr)_56px_92px_56px_100px_168px] md:items-center md:gap-2.5"
    : "md:grid md:grid-cols-[minmax(0,1fr)_56px_92px_56px_100px] md:items-center md:gap-2.5";

  return (
    <div className={`border rounded-xl p-3 ${aRenseigner ? "border-amber-200 bg-amber-50/40" : "border-slate-200"} ${grille}`}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{TYPE_LIGNE_LABEL[ligne.type] || ligne.type}</div>
        <div className="text-[13.5px] font-medium text-slate-900 break-words">{ligne.libelle}</div>
        <div className="md:hidden text-[12.5px] text-slate-500 mt-1">
          {aRenseigner ? <BadgePrixARenseigner compact /> : <>{Number(ligne.quantite)} × {formatEuro(ligne.prix_unitaire_ht)} HT · TVA {Number(ligne.taux_tva)} %</>}
        </div>
        <ProvenanceConstat ligne={ligne} photos={photosConstat} onOuvrirPhoto={onOuvrirPhoto} />
      </div>
      <div className="hidden md:block text-[13px] text-slate-700 text-right tabular-nums">{Number(ligne.quantite)}</div>
      <div className="hidden md:block text-[13px] text-slate-700 text-right tabular-nums whitespace-nowrap">{aRenseigner ? "—" : formatEuro(ligne.prix_unitaire_ht)}</div>
      <div className="hidden md:block text-[13px] text-slate-700 text-right tabular-nums whitespace-nowrap">{Number(ligne.taux_tva)} %</div>
      <div className="flex items-baseline justify-between md:block md:text-right mt-1.5 md:mt-0">
        <span className="md:hidden text-[12px] text-slate-500">Total ligne</span>
        {aRenseigner ? (
          // La colonne fait 100 px : le libellé court, le long est sur mobile.
          <span className="hidden md:inline"><BadgePrixARenseigner compact libelle="À chiffrer" /></span>
        ) : (
          <span className="text-[13.5px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatEuro(montants.montant_ht)} <span className="text-[11px] font-medium text-slate-400">HT</span></span>
        )}
        {aRenseigner && <span className="md:hidden text-[12px] text-amber-700">à chiffrer</span>}
      </div>
      {modifiable && (
        <div className="flex items-center justify-end gap-0.5 mt-2 md:mt-0">
          <button type="button" aria-label="Monter la ligne" title="Monter" disabled={submitting || index === 0} onClick={() => onMove(index, "haut")} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center"><ArrowUp size={15} /></button>
          <button type="button" aria-label="Descendre la ligne" title="Descendre" disabled={submitting || index === total - 1} onClick={() => onMove(index, "bas")} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center"><ArrowDown size={15} /></button>
          <button type="button" aria-label={aRenseigner ? "Chiffrer la ligne" : "Modifier la ligne"} title={aRenseigner ? "Chiffrer" : "Modifier"} onClick={() => setEditing(true)} disabled={submitting} className={`min-h-[40px] rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-1 ${aRenseigner ? "px-2.5 text-[12.5px] font-semibold" : "min-w-[40px] text-slate-600"}`} style={aRenseigner ? { color: ACCENT } : undefined}><Pencil size={15} />{aRenseigner && "Chiffrer"}</button>
          <button type="button" aria-label="Supprimer la ligne" title="Supprimer" onClick={() => onDelete(ligne.id)} disabled={submitting} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center"><Trash2 size={15} /></button>
        </div>
      )}
    </div>
  );
}

/**
 * Les photos des constats repris, signées à la consultation.
 *
 * Le bucket est privé ; l'URL signée est éphémère et n'est jamais stockée :
 * on la refait à chaque ouverture, avec la session du garage. Une photo
 * absente n'est pas une erreur du devis — on affiche la ligne sans elle.
 */
function usePhotosDesConstats(client, lignes) {
  const pointIds = useMemo(
    () => Array.from(new Set(lignes.map((l) => l.inspection_point_id).filter(Boolean))).sort().join(","),
    [lignes],
  );
  const [photos, setPhotos] = useState({});
  useEffect(() => {
    if (!pointIds) { setPhotos({}); return; }
    let annule = false;
    (async () => {
      const ids = pointIds.split(",");
      const { data: rows, error } = await client.from("inspections_photos").select("id, point_id, storage_path").in("point_id", ids).order("created_at");
      if (error || !rows?.length) { if (!annule) setPhotos({}); return; }
      const { data: signed, error: signError } = await client.storage.from(PHOTOS_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES);
      if (signError || annule) return;
      const parChemin = {};
      (signed || []).forEach((s) => { if (s.signedUrl && !s.error) parChemin[s.path] = s.signedUrl; });
      const parPoint = {};
      for (const r of rows) {
        const url = parChemin[r.storage_path];
        if (!url) continue;
        (parPoint[r.point_id] ||= []).push(url);
      }
      setPhotos(parPoint);
    })();
    return () => { annule = true; };
  }, [client, pointIds]);
  return photos;
}

/**
 * « Ajouter un modèle » : la liste des modèles actifs du garage, chargée à
 * l'ouverture, et un identifiant d'insertion tiré UNE fois par ouverture —
 * deux clics n'insèrent qu'une fois (migration 20260919000200).
 */
function ChoisirModele({ client, garageId, constats = [], onInserer, onFermer, busy }) {
  const [modeles, setModeles] = useState(null);
  const [modeleId, setModeleId] = useState("");
  const [constatId, setConstatId] = useState("");
  const insertionId = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);

  useEffect(() => {
    let annule = false;
    client.from("modeles_travaux").select("id, nom, modeles_travaux_lignes ( id, prix_unitaire_ht )").eq("garage_id", garageId).eq("actif", true).order("nom")
      .then(({ data }) => { if (!annule) setModeles(data || []); });
    return () => { annule = true; };
  }, [client, garageId]);

  const choisi = (modeles || []).find((m) => m.id === modeleId) || null;
  const nbLignes = choisi?.modeles_travaux_lignes?.length || 0;
  const sansPrix = (choisi?.modeles_travaux_lignes || []).filter((l) => l.prix_unitaire_ht == null).length;

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
      <div>
        <label className="text-[11.5px] font-medium text-slate-500">Modèle de travaux</label>
        {modeles === null ? (
          <div className="text-[12.5px] text-slate-400 mt-1">Chargement…</div>
        ) : modeles.length === 0 ? (
          <div className="text-[12.5px] text-slate-500 mt-1">Aucun modèle pour l'instant. Le dirigeant peut en créer dans Paramètres › Mon garage, ou enregistrer ce devis comme modèle.</div>
        ) : (
          /* « Ajouter un modèle » ouvre ce choix : le focus y va, sinon il
             retombait sur la page (recette clavier du 15 septembre 2026). */
          <select autoFocus value={modeleId} onChange={(e) => setModeleId(e.target.value)} className={champInput}>
            <option value="">— Choisir un modèle —</option>
            {modeles.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.modeles_travaux_lignes?.length || 0} ligne{(m.modeles_travaux_lignes?.length || 0) > 1 ? "s" : ""})</option>)}
          </select>
        )}
        {choisi && (
          <div className="text-[11.5px] text-slate-500 mt-0.5">
            {nbLignes} ligne{nbLignes > 1 ? "s" : ""} copiée{nbLignes > 1 ? "s" : ""} telles quelles{sansPrix > 0 ? ` — ${sansPrix} sans prix, à renseigner ensuite` : ""}.
          </div>
        )}
      </div>
      {constats.length > 0 && (
        <div>
          <label className="text-[11.5px] font-medium text-slate-500">Pour chiffrer un constat (facultatif)</label>
          <select value={constatId} onChange={(e) => setConstatId(e.target.value)} className={champInput}>
            <option value="">— Aucun —</option>
            {constats.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFermer} disabled={busy} className="min-h-[40px] px-3.5 rounded-lg text-[13px] font-medium text-slate-500">Annuler</button>
        <button type="button" disabled={busy || !modeleId || !insertionId.current} onClick={() => onInserer({ insertionId: insertionId.current, modeleId, constatId: constatId || null })} className="min-h-[40px] px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {busy ? "Ajout…" : "Ajouter au devis"}
        </button>
      </div>
    </div>
  );
}

/**
 * Props :
 *  - devis        : { id, garage_id, statut, devis_lignes? }
 *  - lignes       : lignes déjà chargées (par défaut devis.devis_lignes)
 *  - prestations  : catalogue du garage, pour le pré-remplissage
 *  - readOnly     : forcé ; sinon dérivé du statut (fermé par défaut)
 *  - onChange     : (devisId, { lignes, montant_ht, montant_ttc }) après chaque mutation relue
 *  - onToast      : (message, type)
 *  - client       : client Supabase injectable
 *  - peutCreerModele : vrai pour le dirigeant — « Enregistrer comme modèle »
 */
export default function DevisLignesEditor({ devis, lignes: lignesProp, prestations = [], readOnly, onChange, onToast, client = supabaseClient, ajoutInitial = false, peutCreerModele = false }) {
  const garageId = devis?.garage_id;
  const modifiable = readOnly === true ? false : devisStatutModifiable(devis?.statut);
  const [lignes, setLignes] = useState(trierLignes(lignesProp ?? devis?.devis_lignes ?? []));
  // Un devis tout juste créé arrive formulaire ouvert : la suite évidente est
  // d'y mettre la main-d'œuvre et les pièces (recette du 2026-09-11).
  const [ajoutOuvert, setAjoutOuvert] = useState(Boolean(ajoutInitial && modifiable));
  const [modeleOuvert, setModeleOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [photoOuverte, setPhotoOuverte] = useState(null);
  const photosConstats = usePhotosDesConstats(client, lignes);

  useEffect(() => {
    setLignes(trierLignes(lignesProp ?? devis?.devis_lignes ?? []));
  }, [lignesProp, devis?.devis_lignes]);

  const totaux = useMemo(() => calculerTotaux(lignes), [lignes]);
  const constats = useMemo(() => constatsDesLignes(lignes), [lignes]);
  const toast = (message, type) => (onToast ? onToast(message, type) : null);

  // Relecture depuis la base : les lignes ET les totaux du devis, puis
  // remontée au parent — le devis affiché ne diverge jamais de la base.
  const relire = async () => {
    const [lignesRes, devisRes] = await Promise.all([
      client.from("devis_lignes").select(COLONNES_LIGNE).eq("devis_id", devis.id).order("position").order("created_at"),
      client.from("devis").select("montant_ht, montant_ttc").eq("id", devis.id).single(),
    ]);
    if (lignesRes.error) { setErreur(traduireErreurDevisLignes(lignesRes.error)); return; }
    const nouvelles = trierLignes(lignesRes.data || []);
    setLignes(nouvelles);
    setErreur(null);
    onChange && onChange(devis.id, {
      lignes: nouvelles,
      montant_ht: devisRes.error ? null : devisRes.data?.montant_ht,
      montant_ttc: devisRes.error ? null : devisRes.data?.montant_ttc,
    });
  };

  const executer = async (operation, messageOk) => {
    setBusy(true);
    setErreur(null);
    const { error } = await operation();
    setBusy(false);
    if (error) {
      const msg = traduireErreurDevisLignes(error);
      setErreur(msg);
      toast(msg, "error");
      return false;
    }
    await relire();
    if (messageOk) toast(messageOk);
    return true;
  };

  const ajouter = async (champs) => {
    const position = lignes.length;
    const ok = await executer(() => client.from("devis_lignes").insert({ devis_id: devis.id, garage_id: garageId, position, ...champs }), "Ligne ajoutée");
    if (ok) setAjoutOuvert(false);
    return ok;
  };

  const modifier = (ligneId, champs) =>
    executer(() => client.from("devis_lignes").update(champs).eq("id", ligneId).eq("garage_id", garageId), champs.prix_a_renseigner ? "Ligne modifiée" : "Ligne chiffrée");

  const supprimer = async (ligneId) => {
    if (typeof window !== "undefined" && !window.confirm("Retirer cette ligne du devis ?")) return false;
    return executer(() => client.from("devis_lignes").delete().eq("id", ligneId).eq("garage_id", garageId), "Ligne retirée");
  };

  const deplacer = async (index, direction) => {
    const { positionsAChanger } = deplacerLigne(lignes, index, direction);
    if (positionsAChanger.length === 0) return;
    await executer(async () => {
      for (const { id, position } of positionsAChanger) {
        const { error } = await client.from("devis_lignes").update({ position }).eq("id", id).eq("garage_id", garageId);
        if (error) return { error };
      }
      return { error: null };
    });
  };

  const ouvrirPhoto = (urls, index, titre, commentaire) => setPhotoOuverte({ urls, index, titre, commentaire });

  // Insérer un modèle : la base copie les lignes et garantit qu'un même
  // identifiant d'insertion n'écrit qu'une fois. On relit ensuite.
  const insererModele = async ({ insertionId, modeleId, constatId }) => {
    setBusy(true);
    setErreur(null);
    const { data, error } = await client.rpc("inserer_modele_dans_devis", {
      p_insertion_id: insertionId, p_devis_id: devis.id, p_modele_id: modeleId, p_inspection_point_id: constatId,
    });
    setBusy(false);
    if (error) {
      const msg = /accès refusé|introuvable/i.test(error.message || "") ? "Ce modèle n'est pas disponible pour ce devis." : traduireErreurDevisLignes(error);
      setErreur(msg); toast(msg, "error"); return;
    }
    if (!data?.ok) {
      const msg = data?.raison === "modele_archive" ? "Ce modèle est archivé : réactivez-le pour l'utiliser."
        : data?.raison === "modele_vide" ? "Ce modèle n'a aucune ligne."
        : data?.raison === "devis_verrouille" ? "Ce devis est verrouillé : ses lignes ne peuvent plus être modifiées."
        : data?.raison === "vehicule_different" ? "Ce constat concerne un autre véhicule."
        : "L'ajout n'a pas abouti.";
      setErreur(msg); toast(msg, "error"); return;
    }
    await relire();
    setModeleOuvert(false);
    const n = (data.lignes_creees || []).length;
    const aRenseigner = (data.lignes_creees || []).filter((l) => l.prix_a_renseigner).length;
    toast(data.deja_jouee ? "Ce modèle avait déjà été ajouté : rien n'a été dupliqué."
      : `${n} ligne${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} depuis « ${data.modele} »${aRenseigner > 0 ? ` — ${aRenseigner} à chiffrer` : ""}.`);
  };

  // Enregistrer ce devis comme modèle : le dirigeant seulement, et depuis un
  // devis en lecture aussi (lire n'est pas modifier). Un nom suffit.
  const enregistrerCommeModele = async () => {
    if (typeof window === "undefined") return;
    const nom = window.prompt("Nom du modèle de travaux (ex. « Plaquettes avant ») :", "");
    if (nom == null) return;
    if (!nom.trim()) { toast("Donnez un nom au modèle.", "error"); return; }
    setBusy(true);
    const { error } = await client.rpc("enregistrer_devis_comme_modele", { p_devis_id: devis.id, p_nom: nom.trim() });
    setBusy(false);
    if (error) {
      toast(/accès refusé|introuvable/i.test(error.message || "") ? "Seul le dirigeant peut enregistrer un modèle." : (error.message?.includes("pas de lignes") ? "Ce devis n'a pas de lignes : rien à enregistrer." : "Impossible d'enregistrer ce modèle."), "error");
      return;
    }
    toast(`Modèle « ${nom.trim()} » enregistré. Il se gère dans Paramètres › Mon garage.`);
  };

  const statutLabel = STATUT_DEVIS_LABEL[devis?.statut] || (devis?.statut ? devis.statut : "statut inconnu");
  const grilleEntete = modifiable
    ? "md:grid md:grid-cols-[minmax(0,1fr)_56px_92px_56px_100px_168px] md:items-center md:gap-2.5"
    : "md:grid md:grid-cols-[minmax(0,1fr)_56px_92px_56px_100px] md:items-center md:gap-2.5";

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[12.5px] font-semibold text-slate-700">
          Lignes du devis {lignes.length > 0 && <span className="font-normal text-slate-400">({lignes.length})</span>}
        </div>
        {!modifiable && (
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <Lock size={12} /> Devis {statutLabel.toLowerCase()} : lecture seule
          </div>
        )}
      </div>

      {totaux.incomplet && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 flex items-start gap-2">
          <Camera size={14} className="shrink-0 mt-0.5 opacity-0" aria-hidden="true" />
          <span>
            {totaux.lignes_a_chiffrer === 1 ? "1 ligne attend son prix." : `${totaux.lignes_a_chiffrer} lignes attendent leur prix.`}{" "}
            Tant qu'il en reste, le devis ne peut ni être partagé ni être envoyé.
          </span>
        </div>
      )}

      {lignes.length > 0 && (
        <div className={`hidden px-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${grilleEntete}`}>
          <div>Désignation</div><div className="text-right">Qté</div><div className="text-right">PU HT</div><div className="text-right">TVA</div><div className="text-right">Total HT</div>{modifiable && <div />}
        </div>
      )}

      <div className="mt-2 space-y-2">
        {lignes.map((ligne, index) => (
          <LigneDevisRow
            key={ligne.id}
            ligne={ligne}
            index={index}
            total={lignes.length}
            modifiable={modifiable}
            prestations={prestations}
            photosConstat={photosConstats[ligne.inspection_point_id] || []}
            onOuvrirPhoto={ouvrirPhoto}
            onUpdate={modifier}
            onDelete={supprimer}
            onMove={deplacer}
            submitting={busy}
          />
        ))}

        {lignes.length === 0 && !ajoutOuvert && (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
            {modifiable ? (
              <>
                <div className="text-[13px] text-slate-600">Ce devis n'a pas encore de lignes détaillées.</div>
                <div className="text-[12px] text-slate-400 mt-1">Dès la première ligne, les totaux HT, TVA et TTC sont calculés depuis les lignes et le montant global n'est plus saisi à la main.</div>
              </>
            ) : (
              <div className="text-[13px] text-slate-500">Devis à prestation unique — montants d'origine conservés.</div>
            )}
          </div>
        )}

        {ajoutOuvert && (
          <LigneDevisForm prestations={prestations} constats={constats} submitting={busy} onCancel={() => setAjoutOuvert(false)} onSave={ajouter} />
        )}
        {modeleOuvert && (
          <ChoisirModele client={client} garageId={garageId} constats={constats} busy={busy} onFermer={() => setModeleOuvert(false)} onInserer={insererModele} />
        )}
      </div>

      {erreur && <div className="mt-2 text-[12.5px] text-red-600">{erreur}</div>}

      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {modifiable && !ajoutOuvert && !modeleOuvert && (
            <button type="button" onClick={() => setAjoutOuvert(true)} disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg text-[13px] font-medium disabled:opacity-50" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
              <Plus size={14} /> {lignes.length === 0 ? "Détailler en lignes" : "Ajouter une ligne"}
            </button>
          )}
          {modifiable && !ajoutOuvert && !modeleOuvert && (
            <button type="button" onClick={() => setModeleOuvert(true)} disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg text-[13px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <LayoutTemplate size={14} /> Ajouter un modèle
            </button>
          )}
          {peutCreerModele && lignes.length > 0 && !ajoutOuvert && !modeleOuvert && (
            <button type="button" onClick={enregistrerCommeModele} disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-[12.5px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50" title="Réutiliser ces lignes dans d'autres devis">
              <BookmarkPlus size={14} /> Enregistrer comme modèle
            </button>
          )}
        </div>

        {lignes.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:flex sm:items-baseline sm:gap-5 text-right">
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{totaux.incomplet ? "HT partiel" : "Total HT"}</div><div className="text-[13.5px] font-semibold text-slate-900 tabular-nums">{formatEuro(totaux.total_ht)}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">TVA</div><div className="text-[13.5px] font-semibold text-slate-900 tabular-nums">{formatEuro(totaux.total_tva)}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{totaux.incomplet ? "TTC partiel" : "Total TTC"}</div><div className="text-[15px] font-bold text-slate-900 tabular-nums">{formatEuro(totaux.total_ttc)}</div></div>
          </div>
        )}
      </div>

      {photoOuverte && (
        <PhotoEnGrand
          photos={photoOuverte.urls}
          indexInitial={photoOuverte.index}
          titre={photoOuverte.titre}
          commentaire={photoOuverte.commentaire}
          onFermer={() => setPhotoOuverte(null)}
        />
      )}
    </div>
  );
}
