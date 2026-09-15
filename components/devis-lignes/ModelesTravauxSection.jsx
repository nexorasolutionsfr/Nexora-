"use client";

// Modèles de travaux — la gestion, dans Paramètres › Mon garage, à côté des
// prestations. Pas une nouvelle rubrique : c'est le même endroit où le garage
// décrit ce qu'il fait.
//
// Un modèle = un nom et des lignes, dans la forme d'une ligne de devis. Le
// prix peut manquer (« à renseigner ») : on n'invente pas de prix. Le
// dirigeant crée, modifie et archive ; l'accueil lit (il insère depuis
// l'éditeur de devis). Modifier un modèle ne touche aucun devis existant :
// les devis ont copié les valeurs (migration 20260919000200).

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import { ACCENT, ACCENT_SOFT } from "../garage-os/tokens";
import { TAUX_TVA_DEFAUT, TYPE_LIGNE_LABEL } from "./devisLignesConstants";
import { formatEuro } from "./calculs";

export const SELECT_MODELES = "id, garage_id, nom, description, actif, created_at, updated_at, modeles_travaux_lignes ( id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position, prestation_id )";

const champ = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white min-h-[40px]";

/** Ce qu'on peut dire d'un modèle sans le déplier : lignes, et prix connus. */
export function resumerModele(modele) {
  const lignes = trierLignesModele(modele?.modeles_travaux_lignes || []);
  const sansPrix = lignes.filter((l) => l.prix_unitaire_ht == null).length;
  const totalHt = lignes.reduce((s, l) => s + (l.prix_unitaire_ht == null ? 0 : Number(l.quantite) * Number(l.prix_unitaire_ht)), 0);
  return { nbLignes: lignes.length, sansPrix, totalHt: Math.round(totalHt * 100) / 100 };
}

export function trierLignesModele(lignes) {
  return [...lignes].sort((a, b) => (a.position - b.position) || String(a.id).localeCompare(String(b.id)));
}

const ligneVide = () => ({ cle: Math.random().toString(36).slice(2), type: "main_oeuvre", libelle: "", quantite: 1, prix_unitaire_ht: "", taux_tva: TAUX_TVA_DEFAUT });

/** Valide les lignes d'un modèle avant écriture. Le prix vide est permis. */
export function validerLignesModele(lignes) {
  if (!lignes.length) return "Un modèle a besoin d'au moins une ligne.";
  for (const l of lignes) {
    if (!String(l.libelle || "").trim()) return "Chaque ligne a besoin d'un libellé.";
    const q = Number(l.quantite);
    if (!Number.isFinite(q) || q <= 0) return "La quantité doit être strictement positive.";
    if (l.prix_unitaire_ht !== "" && l.prix_unitaire_ht != null) {
      const p = Number(l.prix_unitaire_ht);
      if (!Number.isFinite(p) || p < 0) return "Un prix doit être nul ou positif — ou laissé vide.";
    }
    const t = Number(l.taux_tva);
    if (!Number.isFinite(t) || t < 0 || t > 100) return "Le taux de TVA doit être compris entre 0 et 100.";
  }
  return null;
}

function EditeurModele({ garageId, initial, client, onEnregistre, onAnnuler, onToast }) {
  const [nom, setNom] = useState(initial?.nom || "");
  const [lignes, setLignes] = useState(() => {
    const existantes = trierLignesModele(initial?.modeles_travaux_lignes || []);
    return existantes.length ? existantes.map((l) => ({ ...l, cle: l.id, prix_unitaire_ht: l.prix_unitaire_ht ?? "" })) : [ligneVide()];
  });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const maj = (cle, champs) => setLignes((prev) => prev.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));

  const enregistrer = async () => {
    if (!nom.trim()) { setErreur("Donnez un nom à ce modèle."); return; }
    const probleme = validerLignesModele(lignes);
    if (probleme) { setErreur(probleme); return; }
    setBusy(true);
    setErreur(null);
    let modeleId = initial?.id || null;
    if (modeleId) {
      const { error } = await client.from("modeles_travaux").update({ nom: nom.trim() }).eq("id", modeleId).eq("garage_id", garageId);
      if (error) { setBusy(false); setErreur("Impossible d'enregistrer ce modèle."); return; }
      // Les lignes sont réécrites en bloc : un modèle est un tout, pas une
      // liste qu'on retouche ligne à ligne. Les devis déjà créés n'y sont pas.
      const { error: eDel } = await client.from("modeles_travaux_lignes").delete().eq("modele_id", modeleId).eq("garage_id", garageId);
      if (eDel) { setBusy(false); setErreur("Impossible de mettre à jour les lignes."); return; }
    } else {
      const { data, error } = await client.from("modeles_travaux").insert({ garage_id: garageId, nom: nom.trim() }).select("id").single();
      if (error || !data) { setBusy(false); setErreur(error?.code === "42501" ? "Seul le dirigeant peut créer un modèle." : "Impossible de créer ce modèle."); return; }
      modeleId = data.id;
    }
    const charge = lignes.map((l, i) => ({
      modele_id: modeleId,
      garage_id: garageId,
      type: l.type,
      libelle: String(l.libelle).trim(),
      quantite: Number(l.quantite),
      prix_unitaire_ht: l.prix_unitaire_ht === "" || l.prix_unitaire_ht == null ? null : Math.round(Number(l.prix_unitaire_ht) * 100) / 100,
      taux_tva: Number(l.taux_tva),
      position: i,
      prestation_id: l.prestation_id || null,
    }));
    const { error: eLignes } = await client.from("modeles_travaux_lignes").insert(charge);
    setBusy(false);
    if (eLignes) { setErreur("Les lignes n'ont pas pu être enregistrées : " + (eLignes.message || "")); return; }
    onToast?.(initial ? "Modèle mis à jour" : "Modèle enregistré");
    onEnregistre?.(modeleId);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div>
        <label className="text-[11.5px] font-medium text-slate-500">Nom du modèle</label>
        {/* Le formulaire s'ouvre sur un geste explicite : le focus va au nom,
            sinon il restait sur la page (recette clavier du 15 septembre 2026). */}
        <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Plaquettes avant" className={`mt-1 ${champ}`} />
      </div>
      <div className="space-y-2">
        {lignes.map((l, i) => (
          // DEUX RANGÉES, QUELLE QUE SOIT LA LARGEUR DE LA CARTE
          // Une seule rangée de six colonnes (dont cinq de largeur fixe) se
          // calait sur la largeur de l'ÉCRAN, pas de la carte : dans Paramètres
          // (carte de 410 px à 1280 px), le libellé tombait à 22 px, recouvert par
          // la quantité — impossible à cliquer, la frappe partait dans un champ
          // numérique. Mesuré le 15 septembre 2026.
          <div key={l.cle} className="rounded-lg border border-slate-200 bg-white p-2.5 grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-end">
            <div>
              <label className="text-[11px] text-slate-500">Type</label>
              <select value={l.type} onChange={(e) => maj(l.cle, { type: e.target.value })} className={champ}>
                <option value="main_oeuvre">{TYPE_LIGNE_LABEL.main_oeuvre}</option>
                <option value="piece">{TYPE_LIGNE_LABEL.piece}</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Libellé</label>
              <input value={l.libelle} onChange={(e) => maj(l.cle, { libelle: e.target.value })} placeholder={l.type === "piece" ? "Ex. Jeu de plaquettes avant" : "Ex. Remplacement plaquettes"} className={champ} />
            </div>
            {/* Largeurs plafonnées, pas fixes : à 375 px, 64 + 96 + 64 + 40 débordaient
                de la carte et la corbeille sortait de son cadre. */}
            <div className="col-span-2 grid grid-cols-[minmax(0,56px)_minmax(0,1fr)_minmax(0,56px)_40px] gap-2 items-end">
              <div>
                <label className="text-[11px] text-slate-500">Qté</label>
                <input type="number" inputMode="decimal" min="0.001" step="0.001" value={l.quantite} onChange={(e) => maj(l.cle, { quantite: e.target.value })} className={champ} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">Prix HT</label>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={l.prix_unitaire_ht} onChange={(e) => maj(l.cle, { prix_unitaire_ht: e.target.value })} placeholder="à renseigner" className={champ} />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">TVA %</label>
                <input type="number" inputMode="decimal" min="0" max="100" step="0.1" value={l.taux_tva} onChange={(e) => maj(l.cle, { taux_tva: e.target.value })} className={champ} />
              </div>
              <button type="button" aria-label="Retirer la ligne" disabled={lignes.length === 1} onClick={() => setLignes((prev) => prev.filter((x) => x.cle !== l.cle))} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30 flex items-center justify-center justify-self-end"><Trash2 size={15} /></button>
            </div>
            {i === lignes.length - 1 && null}
          </div>
        ))}
      </div>
      <div className="text-[11.5px] text-slate-500">Un prix laissé vide donnera une ligne « Prix à renseigner » dans le devis. Rien n'est déduit des durées du catalogue.</div>
      {erreur && <div className="text-[12.5px] text-red-600">{erreur}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setLignes((prev) => [...prev, ligneVide()])} className="min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-lg text-[13px] font-medium" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}><Plus size={14} /> Ajouter une ligne</button>
        <div className="flex gap-2">
          <button type="button" onClick={onAnnuler} disabled={busy} className="min-h-[40px] px-3.5 rounded-lg text-[13px] font-medium text-slate-500">Annuler</button>
          <button type="button" onClick={enregistrer} disabled={busy} className="min-h-[40px] px-4 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>{busy ? "Enregistrement…" : "Enregistrer le modèle"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Props :
 *  - garageId
 *  - peutModifier : vrai pour le dirigeant ; l'accueil lit seulement
 *  - onToast, client (injectable)
 */
export default function ModelesTravauxSection({ garageId, peutModifier = false, onToast, client = supabaseClient }) {
  const [modeles, setModeles] = useState(null);
  const [edition, setEdition] = useState(null); // null | "nouveau" | modele
  const [archivesVisibles, setArchivesVisibles] = useState(false);

  const charger = async () => {
    const { data, error } = await client.from("modeles_travaux").select(SELECT_MODELES).eq("garage_id", garageId).order("actif", { ascending: false }).order("nom");
    if (error) { console.error("Modèles de travaux :", error); onToast?.("Impossible de charger les modèles de travaux", "error"); setModeles([]); return; }
    setModeles(data || []);
  };

  useEffect(() => { if (garageId) charger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [garageId]);

  const archiver = async (m, actif) => {
    const { data, error } = await client.from("modeles_travaux").update({ actif }).eq("id", m.id).eq("garage_id", garageId).select("id");
    if (error || !data?.length) { onToast?.(actif ? "Impossible de réactiver ce modèle" : "Impossible d'archiver ce modèle", "error"); return; }
    onToast?.(actif ? "Modèle réactivé" : "Modèle archivé — les devis déjà créés ne changent pas");
    charger();
  };

  const visibles = useMemo(() => (modeles || []).filter((m) => archivesVisibles || m.actif), [modeles, archivesVisibles]);
  const nbArchives = (modeles || []).filter((m) => !m.actif).length;

  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-slate-500">Des travaux qui reviennent souvent, prêts à être ajoutés à un devis en un geste : pièces et main-d'œuvre, quantités, prix connus.</div>
      {modeles === null ? (
        <div className="text-[13px] text-slate-400">Chargement…</div>
      ) : (
        <div className="space-y-2">
          {visibles.length === 0 && edition === null && (
            <div className="text-[13px] text-slate-400 py-2">{peutModifier ? "Aucun modèle pour l'instant. Créez le premier ci-dessous, ou enregistrez un devis existant comme modèle depuis l'écran Devis." : "Aucun modèle pour l'instant. Le dirigeant peut en créer."}</div>
          )}
          {visibles.map((m) => {
            const r = resumerModele(m);
            if (edition && edition !== "nouveau" && edition.id === m.id) {
              return <EditeurModele key={m.id} garageId={garageId} initial={m} client={client} onToast={onToast} onAnnuler={() => setEdition(null)} onEnregistre={() => { setEdition(null); charger(); }} />;
            }
            return (
              <div key={m.id} className={`flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0 ${m.actif ? "" : "opacity-60"}`}>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800 truncate">{m.nom}{!m.actif && <span className="ml-2 text-[11px] font-medium text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-100">Archivé</span>}</div>
                  <div className="text-[12px] text-slate-500">
                    {r.nbLignes} ligne{r.nbLignes > 1 ? "s" : ""} · {r.sansPrix === r.nbLignes ? "prix à renseigner" : `${formatEuro(r.totalHt)} HT${r.sansPrix > 0 ? ` + ${r.sansPrix} à renseigner` : ""}`}
                  </div>
                </div>
                {peutModifier && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {m.actif && <button type="button" aria-label={`Modifier ${m.nom}`} title="Modifier" onClick={() => setEdition(m)} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 flex items-center justify-center"><Pencil size={15} /></button>}
                    <button type="button" aria-label={m.actif ? `Archiver ${m.nom}` : `Réactiver ${m.nom}`} title={m.actif ? "Archiver" : "Réactiver"} onClick={() => archiver(m, !m.actif)} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 flex items-center justify-center">{m.actif ? <Archive size={15} /> : <ArchiveRestore size={15} />}</button>
                  </div>
                )}
              </div>
            );
          })}
          {edition === "nouveau" && (
            <EditeurModele garageId={garageId} initial={null} client={client} onToast={onToast} onAnnuler={() => setEdition(null)} onEnregistre={() => { setEdition(null); charger(); }} />
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {peutModifier && edition === null && (
          <button type="button" onClick={() => setEdition("nouveau")} className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-xl text-[13px] font-semibold text-white" style={{ backgroundColor: ACCENT }}><Plus size={15} /> Nouveau modèle</button>
        )}
        {nbArchives > 0 && (
          <button type="button" onClick={() => setArchivesVisibles((v) => !v)} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-700">{archivesVisibles ? "Masquer les archivés" : `Voir les archivés (${nbArchives})`}</button>
        )}
      </div>
    </div>
  );
}
