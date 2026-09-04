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
// Le client Supabase est injectable (prop `client`) pour permettre un rendu
// hors réseau (harnais local, tests) — par défaut, le client applicatif.

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import { ACCENT, ACCENT_SOFT } from "../garage-os/tokens";
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

const COLONNES_LIGNE = "id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position, prestation_id, montant_ht, montant_tva, created_at, updated_at";

const champInput = "mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-500 bg-white min-h-[40px]";

function LigneDevisForm({ initial, prestations = [], onSave, onCancel, submitting }) {
  const [type, setType] = useState(initial?.type || "main_oeuvre");
  const [libelle, setLibelle] = useState(initial?.libelle || "");
  const [quantite, setQuantite] = useState(initial?.quantite ?? 1);
  const [prixUnitaireHt, setPrixUnitaireHt] = useState(initial?.prix_unitaire_ht ?? "");
  const [tauxTva, setTauxTva] = useState(initial?.taux_tva ?? TAUX_TVA_DEFAUT);
  const [prestationId, setPrestationId] = useState(initial?.prestation_id || "");
  const [erreurs, setErreurs] = useState({});

  const apercu = calculerLigne({ quantite, prix_unitaire_ht: prixUnitaireHt, taux_tva: tauxTva });

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
    const champs = { type, libelle, quantite, prix_unitaire_ht: prixUnitaireHt, taux_tva: tauxTva, prestation_id: prestationId || null };
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
          <input type="number" inputMode="decimal" min="0" step="0.01" value={prixUnitaireHt} onChange={(e) => setPrixUnitaireHt(e.target.value)} placeholder="0,00" className={champInput} />
          {erreurs.prix_unitaire_ht && <div className="text-[11px] text-red-600 mt-0.5">{erreurs.prix_unitaire_ht}</div>}
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
          Cette ligne : <span className="font-semibold text-slate-900">{formatEuro(apercu.montant_ht)} HT</span> · TVA {formatEuro(apercu.montant_tva)} · <span className="font-semibold text-slate-900">{formatEuro(apercu.montant_ttc)} TTC</span>
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

function LigneDevisRow({ ligne, index, total, modifiable, prestations, onUpdate, onDelete, onMove, submitting }) {
  const [editing, setEditing] = useState(false);
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

  return (
    <div className="border border-slate-200 rounded-xl p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_88px_110px_64px_110px_auto] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{TYPE_LIGNE_LABEL[ligne.type] || ligne.type}</span>
          <span className="text-[13.5px] font-medium text-slate-900 truncate">{ligne.libelle}</span>
        </div>
        <div className="sm:hidden text-[12.5px] text-slate-500 mt-1">
          {Number(ligne.quantite)} × {formatEuro(ligne.prix_unitaire_ht)} HT · TVA {Number(ligne.taux_tva)} %
        </div>
      </div>
      <div className="hidden sm:block text-[13px] text-slate-700 text-right tabular-nums">{Number(ligne.quantite)}</div>
      <div className="hidden sm:block text-[13px] text-slate-700 text-right tabular-nums">{formatEuro(ligne.prix_unitaire_ht)}</div>
      <div className="hidden sm:block text-[13px] text-slate-700 text-right tabular-nums">{Number(ligne.taux_tva)} %</div>
      <div className="flex items-baseline justify-between sm:block sm:text-right mt-1.5 sm:mt-0">
        <span className="sm:hidden text-[12px] text-slate-500">Total ligne</span>
        <span className="text-[13.5px] font-semibold text-slate-900 tabular-nums">{formatEuro(montants.montant_ht)} <span className="text-[11px] font-medium text-slate-400">HT</span></span>
      </div>
      {modifiable && (
        <div className="flex items-center justify-end gap-1 mt-2 sm:mt-0">
          <button type="button" aria-label="Monter la ligne" disabled={submitting || index === 0} onClick={() => onMove(index, "haut")} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center"><ArrowUp size={15} /></button>
          <button type="button" aria-label="Descendre la ligne" disabled={submitting || index === total - 1} onClick={() => onMove(index, "bas")} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-30 flex items-center justify-center"><ArrowDown size={15} /></button>
          <button type="button" onClick={() => setEditing(true)} disabled={submitting} className="min-h-[40px] px-2.5 rounded-lg text-[12.5px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Modifier</button>
          <button type="button" aria-label="Supprimer la ligne" onClick={() => onDelete(ligne.id)} disabled={submitting} className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center"><Trash2 size={15} /></button>
        </div>
      )}
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
 */
export default function DevisLignesEditor({ devis, lignes: lignesProp, prestations = [], readOnly, onChange, onToast, client = supabaseClient }) {
  const garageId = devis?.garage_id;
  const modifiable = readOnly === true ? false : devisStatutModifiable(devis?.statut);
  const [lignes, setLignes] = useState(trierLignes(lignesProp ?? devis?.devis_lignes ?? []));
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    setLignes(trierLignes(lignesProp ?? devis?.devis_lignes ?? []));
  }, [lignesProp, devis?.devis_lignes]);

  const totaux = useMemo(() => calculerTotaux(lignes), [lignes]);
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
    executer(() => client.from("devis_lignes").update(champs).eq("id", ligneId).eq("garage_id", garageId), "Ligne modifiée");

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

  const statutLabel = STATUT_DEVIS_LABEL[devis?.statut] || (devis?.statut ? devis.statut : "statut inconnu");

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

      {lignes.length > 0 && (
        <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_88px_110px_64px_110px_auto] sm:gap-3 px-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <div>Désignation</div><div className="text-right">Qté</div><div className="text-right">PU HT</div><div className="text-right">TVA</div><div className="text-right">Total HT</div><div className={modifiable ? "w-[176px]" : "w-0"} />
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
          <LigneDevisForm prestations={prestations} submitting={busy} onCancel={() => setAjoutOuvert(false)} onSave={ajouter} />
        )}
      </div>

      {erreur && <div className="mt-2 text-[12.5px] text-red-600">{erreur}</div>}

      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {modifiable && !ajoutOuvert ? (
          <button type="button" onClick={() => setAjoutOuvert(true)} disabled={busy} className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg text-[13px] font-medium disabled:opacity-50" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>
            <Plus size={14} /> {lignes.length === 0 ? "Détailler en lignes" : "Ajouter une ligne"}
          </button>
        ) : <div />}

        {lignes.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:flex sm:items-baseline sm:gap-5 text-right">
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Total HT</div><div className="text-[13.5px] font-semibold text-slate-900 tabular-nums">{formatEuro(totaux.total_ht)}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">TVA</div><div className="text-[13.5px] font-semibold text-slate-900 tabular-nums">{formatEuro(totaux.total_tva)}</div></div>
            <div><div className="text-[11px] uppercase tracking-wide text-slate-400">Total TTC</div><div className="text-[15px] font-bold text-slate-900 tabular-nums">{formatEuro(totaux.total_ttc)}</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
