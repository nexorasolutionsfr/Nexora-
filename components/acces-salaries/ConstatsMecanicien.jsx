"use client";

// Les constats du mécanicien, sur sa fiche.
//
// Ce qu'il voit : les points à signaler du contrôle de CETTE visite, avec
// leurs photos. Ce qu'il fait : décrire ce qui cloche, choisir un état, joindre
// une photo prise sur place. Rien d'autre : ni prix, ni client, ni décision.
//
// Le contrôle est celui que l'accueil reprend dans « Préparer le devis » :
// ce que le mécanicien note ici arrive au comptoir sans être retapé.
//
// Chaque geste passe par une fonction qui revérifie l'affectation
// (20260919000700). Un refus s'affiche tel quel : fiche plus affectée,
// contrôle finalisé, fiche terminée.

import { useCallback, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { EtatPicker } from "../inspections/InspectionCaptureFlow";
import PhotoEnGrand from "../inspections/PhotoEnGrand";
import {
  ETAT_POINT_LABEL,
  GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES,
  MAX_PHOTOS_PAR_POINT,
  PHOTOS_BUCKET,
} from "../inspections/inspectionsConstants";
import { ajouterConstat, chargerMesConstats, deposerPhotoConstat } from "./acces";

const ETATS_CONSTAT = ["a_surveiller", "a_valider_client", "dommage"];

function messageRefus(e) {
  const m = e?.message || "";
  if (/row-level security|violates row-level/i.test(m)) {
    return "Dépôt refusé : ce contrôle n'est plus modifiable ou cette fiche ne vous est plus affectée.";
  }
  if (/introuvable ou accès refusé/i.test(m)) return "Cette fiche ne vous est plus affectée. Revenez à votre liste.";
  if (/^Contrôle finalisé|^Cette fiche est terminée|^Photo :|^Constat :|^Décrivez|^Format de photo/.test(m)) return m;
  return "L'enregistrement n'a pas abouti. Votre saisie est conservée : réessayez.";
}

const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);

export default function ConstatsMecanicien({ supabase, ordreId }) {
  const [etat, setEtat] = useState(null);
  const [urls, setUrls] = useState({});
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [etatPoint, setEtatPoint] = useState("a_surveiller");
  const [commentaire, setCommentaire] = useState("");
  const [fichier, setFichier] = useState(null);
  const [cleFichier, setCleFichier] = useState(0);
  const [photoOuverte, setPhotoOuverte] = useState(null);

  const recharger = useCallback(async () => {
    try {
      const data = await chargerMesConstats(supabase, ordreId);
      setEtat(data);
      const chemins = (data?.points || []).flatMap((p) => (p.photos || []).map((ph) => ph.chemin));
      if (chemins.length === 0) { setUrls({}); return; }
      const { data: signees } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrls(chemins, GARAGE_PHOTO_SIGNED_URL_TTL_SECONDES);
      const parChemin = {};
      (signees || []).forEach((s) => { if (s.signedUrl && !s.error) parChemin[s.path] = s.signedUrl; });
      setUrls(parChemin);
    } catch (e) {
      setErreur(messageRefus(e));
    }
  }, [supabase, ordreId]);

  useEffect(() => { recharger(); }, [recharger]);

  async function enregistrer(e) {
    e.preventDefault();
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    setInfo("");
    try {
      const cree = await ajouterConstat(supabase, { ordreId, libelle, etat: etatPoint, commentaire });
      if (fichier) {
        try {
          await deposerPhotoConstat(supabase, {
            bucket: PHOTOS_BUCKET, garageId: cree.garage_id, inspectionId: cree.inspection_id,
            pointId: cree.point_id, file: fichier, uuid: uuid(),
          });
        } catch (e2) {
          // Le constat est enregistré ; seule la photo manque. On le dit, et
          // on garde le fichier pour un nouvel essai depuis le constat.
          setLibelle(""); setCommentaire("");
          await recharger();
          setErreur(`Constat enregistré, mais la photo n'a pas été ajoutée : ${messageRefus(e2)}`);
          return;
        }
      }
      setLibelle(""); setCommentaire(""); setFichier(null); setCleFichier((k) => k + 1); setEtatPoint("a_surveiller");
      await recharger();
      setInfo("Constat enregistré. L'accueil le retrouvera pour préparer le devis.");
    } catch (e2) {
      setErreur(messageRefus(e2));
    } finally {
      setEnCours(false);
    }
  }

  async function ajouterPhoto(point, file) {
    if (!file || enCours) return;
    setEnCours(true);
    setErreur("");
    setInfo("");
    try {
      await deposerPhotoConstat(supabase, {
        bucket: PHOTOS_BUCKET, garageId: etat.controle.garage_id, inspectionId: etat.controle.id,
        pointId: point.id, file, uuid: uuid(),
      });
      await recharger();
      setInfo("Photo ajoutée.");
    } catch (e) {
      setErreur(messageRefus(e));
    } finally {
      setEnCours(false);
    }
  }

  if (etat === null && !erreur) {
    return <p className="text-sm text-slate-500">Chargement du contrôle…</p>;
  }

  const points = etat?.points || [];
  const peutAjouter = Boolean(etat?.peut_ajouter);

  return (
    <div>
      {erreur && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{erreur}</p>}
      {info && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">{info}</p>}

      {points.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">Aucun constat sur ce véhicule pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-3">
          {points.map((p) => {
            const photos = (p.photos || []).map((ph) => urls[ph.chemin]).filter(Boolean);
            const idFichier = `nx-photo-${p.id}`;
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 break-words">{p.libelle}</span>
                  <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">{ETAT_POINT_LABEL[p.etat] || p.etat}</span>
                </div>
                {p.commentaire && <p className="text-[13px] text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{p.commentaire}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setPhotoOuverte({ urls: photos, index: i, titre: p.libelle, commentaire: p.commentaire })}
                      aria-label={`Voir la photo en grand — ${p.libelle}${photos.length > 1 ? ` (${i + 1} sur ${photos.length})` : ""}`}
                      className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {peutAjouter && (p.photos || []).length < MAX_PHOTOS_PAR_POINT && (
                    <span>
                      {/* Champ fichier réellement focalisable : Tab l'atteint,
                          Espace ou Entrée ouvre l'appareil photo, sans code. */}
                      <input
                        id={idFichier}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only peer"
                        disabled={enCours}
                        onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; ajouterPhoto(p, f); }}
                      />
                      <label htmlFor={idFichier} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 min-h-[44px] rounded-lg border border-slate-200 text-slate-700 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
                        <Camera size={15} /> Ajouter une photo
                      </label>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!peutAjouter && etat?.motif === "controle_verrouille" && (
        <p className="text-[12.5px] text-slate-500 mb-2">Le contrôle de cette visite est finalisé : demandez au garage de le rouvrir pour ajouter un constat.</p>
      )}
      {!peutAjouter && etat?.motif === "fiche_terminee" && (
        <p className="text-[12.5px] text-slate-500 mb-2">Cette fiche est terminée : elle ne se modifie plus.</p>
      )}

      {peutAjouter && (
        <form onSubmit={enregistrer} className="grid gap-2 border-t border-slate-100 pt-3">
          <label className="text-[13px] font-medium text-slate-700" htmlFor={`nx-constat-${ordreId}`}>Ajouter un constat</label>
          <input
            id={`nx-constat-${ordreId}`}
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={200}
            required
            placeholder="Ex. Plaquettes avant usées"
            className="border border-slate-200 rounded-lg px-3 min-h-[44px] text-sm"
          />
          <fieldset>
            <legend className="text-[12.5px] text-slate-500">État</legend>
            <EtatPicker value={etatPoint} onChange={setEtatPoint} etats={ETATS_CONSTAT} />
          </fieldset>
          <label className="text-[12.5px] text-slate-500" htmlFor={`nx-commentaire-${ordreId}`}>Précision (facultatif)</label>
          <textarea
            id={`nx-commentaire-${ordreId}`}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={2}
            placeholder="Ex. 2 mm restants, disque marqué"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              key={cleFichier}
              id={`nx-photo-nouveau-${ordreId}`}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only peer"
              onChange={(e) => setFichier(e.target.files?.[0] || null)}
            />
            <label htmlFor={`nx-photo-nouveau-${ordreId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 min-h-[44px] rounded-lg border border-slate-200 text-slate-700 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
              <Camera size={15} /> {fichier ? "Changer la photo" : "Joindre une photo"}
            </label>
            {fichier && <span className="text-[12.5px] text-slate-500 truncate max-w-[180px]">{fichier.name}</span>}
          </div>
          <div>
            <button type="submit" disabled={enCours || !libelle.trim()} className="text-sm font-medium px-4 min-h-[44px] rounded-lg bg-slate-900 text-white disabled:opacity-60">
              {enCours ? "Enregistrement…" : "Enregistrer le constat"}
            </button>
          </div>
        </form>
      )}

      {photoOuverte && (
        <PhotoEnGrand photos={photoOuverte.urls} indexInitial={photoOuverte.index} titre={photoOuverte.titre} commentaire={photoOuverte.commentaire} onFermer={() => setPhotoOuverte(null)} />
      )}
    </div>
  );
}
