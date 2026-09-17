"use client";

// Documents d'une voiture : factures, procès-verbaux, carnet, carte grise,
// assurance. Le fichier part dans le compartiment privé auto-documents, puis
// sa fiche est enregistrée ; si la fiche échoue, le fichier est retiré. Un
// document s'ouvre par une adresse signée de cinq minutes.

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileImage, FileText, LoaderCircle, Paperclip, ReceiptText, Trash2, Upload } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { nouvelIdentifiant } from "@/lib/auto/identifiants";
import {
  COMPARTIMENT,
  DUREE_LIEN_SECONDES,
  TYPES_DOCUMENT,
  cheminDocument,
  nomAffichable,
  tailleLisible,
  verifierFichier,
} from "@/lib/auto/documents";
import { Alerte, aide, boutonLien, boutonPrincipal, boutonSecondaire, carte, carteListe, champ, etiquette } from "@/components/auto/elements";
import { TYPES_INTERVENTION, formaterDate, libelleDe, messageErreurAuto } from "@/components/auto/format";

// Ouvre un document dans un nouvel onglet. L'onglet est ouvert AVANT l'appel
// réseau : sinon les navigateurs mobiles bloquent la fenêtre.
export async function ouvrirDocument(document) {
  const onglet = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(COMPARTIMENT).createSignedUrl(document.chemin, DUREE_LIEN_SECONDES);
  if (error || !data?.signedUrl) {
    onglet?.close();
    return false;
  }
  if (onglet) onglet.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
  return true;
}

export function libelleIntervention(ligne) {
  return `${libelleDe(TYPES_INTERVENTION, ligne.type)} du ${formaterDate(ligne.realise_le)}`;
}

export default function BlocDocuments({ vehiculeId, proprietaireId, documents, historique, formulaireOuvert, historiquePrechoisi, onOuvrir, onFermer, onChange, archive = false }) {
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(null);

  async function ouvrir(document) {
    setErreur("");
    const ok = await ouvrirDocument(document);
    if (!ok) setErreur("Ce document n'a pas pu être ouvert. Réessayez.");
  }

  async function supprimer(document) {
    if (!window.confirm(`Supprimer « ${document.titre || document.nom_fichier} » ?`)) return;
    setErreur("");
    setEnCours(document.id);
    const { data, error } = await supabase.from("auto_documents").delete().eq("id", document.id).select("id");
    if (error || !data?.length) {
      setEnCours(null);
      setErreur("La suppression n'a pas abouti. Réessayez.");
      return;
    }
    // La fiche est partie : le fichier suit. Un échec ici ne laisse qu'un
    // fichier orphelin, invisible, jamais une fiche sans fichier.
    await supabase.storage.from(COMPARTIMENT).remove([document.chemin]);
    setEnCours(null);
    onChange("Document supprimé.");
  }

  const parId = new Map(historique.map((h) => [h.id, h]));

  return (
    <section id="documents" className="scroll-mt-20" aria-labelledby="titre-documents">
      <div className="mb-2 mt-7 flex items-center justify-between">
        <h2 id="titre-documents" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Documents
        </h2>
        {!formulaireOuvert ? (
          <div className="flex flex-wrap justify-end gap-x-1">
            {!archive ? (
              <Link href={`/auto/factures/nouvelle?vehicule=${vehiculeId}`} className={boutonLien}>
                <ReceiptText className="size-4" aria-hidden="true" />
                Ajouter une facture
              </Link>
            ) : null}
            <button type="button" onClick={() => onOuvrir(null)} className={boutonLien}>
              <Upload className="size-4" aria-hidden="true" />
              Autre document
            </button>
          </div>
        ) : null}
      </div>

      {formulaireOuvert ? (
        <div className={`${carte} mb-3`}>
          <h3 className="font-semibold text-foreground">Nouveau document</h3>
          <FormulaireDocument
            vehiculeId={vehiculeId}
            proprietaireId={proprietaireId}
            historique={historique}
            historiquePrechoisi={historiquePrechoisi}
            onAnnuler={onFermer}
            onEnregistre={() => onChange("Document ajouté.")}
          />
        </div>
      ) : null}

      {erreur ? (
        <div className="mb-3">
          <Alerte>{erreur}</Alerte>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className={`${carte} flex items-center gap-3 text-sm text-muted-foreground`}>
          <FileText className="size-5 shrink-0" aria-hidden="true" />
          <p>Aucun document. Gardez ici vos factures, le procès-verbal du contrôle technique ou la carte grise.</p>
        </div>
      ) : (
        <ul className={carteListe}>
          {documents.map((d) => {
            const Icone = d.type_mime === "application/pdf" ? FileText : FileImage;
            const lie = d.historique_id ? parId.get(d.historique_id) : null;
            return (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70">
                  <Icone className="size-4" aria-hidden="true" />
                </span>
                <button type="button" onClick={() => ouvrir(d)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="truncate">{d.titre || libelleDe(TYPES_DOCUMENT, d.type)}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {[libelleDe(TYPES_DOCUMENT, d.type), d.date_document ? formaterDate(d.date_document) : null, tailleLisible(d.taille_octets)].filter(Boolean).join(" · ")}
                  </span>
                  {lie ? (
                    <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground/80">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      Justifie : {libelleIntervention(lie)}
                    </span>
                  ) : null}
                </button>
                {d.type === "facture" && !d.historique_id && d.source === "proprietaire" && !archive ? (
                  <Link href={`/auto/factures/${d.id}`} className="shrink-0 self-center rounded-lg px-2 py-2 text-sm font-semibold text-primary hover:bg-secondary">
                    À compléter
                  </Link>
                ) : null}
                {d.source === "proprietaire" ? (
                  <button
                    type="button"
                    onClick={() => supprimer(d)}
                    disabled={enCours === d.id}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 hover:text-destructive"
                    aria-label={`Supprimer ${d.titre || d.nom_fichier}`}
                  >
                    {enCours === d.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FormulaireDocument({ vehiculeId, proprietaireId, historique, historiquePrechoisi, onAnnuler, onEnregistre }) {
  const aujourdhui = aujourdhuiIso();
  const prechoisi = historique.find((h) => h.id === historiquePrechoisi);
  const [fichier, setFichier] = useState(null);
  const [saisie, setSaisie] = useState({
    type: prechoisi?.type === "controle_technique" ? "proces_verbal_ct" : "facture",
    titre: "",
    dateDocument: prechoisi?.realise_le?.slice(0, 10) ?? "",
    historiqueId: historiquePrechoisi ?? "",
  });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const changer = (nom) => (e) => setSaisie((s) => ({ ...s, [nom]: e.target.value }));

  async function soumettre(evenement) {
    evenement.preventDefault();
    setErreur("");
    const verification = verifierFichier(fichier);
    if (!verification.valide) return setErreur(verification.erreur);
    if (saisie.dateDocument && saisie.dateDocument > aujourdhui) return setErreur("La date ne peut pas être dans le futur.");

    setEnCours(true);
    const chemin = cheminDocument({ proprietaireId, vehiculeId, identifiant: nouvelIdentifiant(), typeMime: verification.typeMime });
    const depot = await supabase.storage.from(COMPARTIMENT).upload(chemin, fichier, { contentType: verification.typeMime, upsert: false });
    if (depot.error) {
      setEnCours(false);
      return setErreur("Le fichier n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.");
    }
    const { error } = await supabase.from("auto_documents").insert({
      vehicule_id: vehiculeId,
      historique_id: saisie.historiqueId || null,
      type: saisie.type,
      titre: saisie.titre.trim().slice(0, 120) || null,
      date_document: saisie.dateDocument || null,
      chemin,
      nom_fichier: nomAffichable(fichier.name),
      type_mime: verification.typeMime,
      taille_octets: fichier.size,
    });
    if (error) {
      // Pas de fichier sans fiche.
      await supabase.storage.from(COMPARTIMENT).remove([chemin]);
      setEnCours(false);
      return setErreur(messageErreurAuto(error));
    }
    setEnCours(false);
    onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <div>
        <label htmlFor="document-fichier" className={etiquette}>
          Fichier
        </label>
        <input
          id="document-fichier"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2.5 file:text-sm file:font-semibold file:text-primary"
        />
        <p className={aide}>PDF ou photo, 10 Mo au plus. Le fichier reste privé.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="document-type" className={etiquette}>
            Type
          </label>
          <select id="document-type" value={saisie.type} onChange={changer("type")} className={`${champ} appearance-none`}>
            {TYPES_DOCUMENT.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="document-date" className={etiquette}>
            Date <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <input id="document-date" type="date" max={aujourdhui} value={saisie.dateDocument} onChange={changer("dateDocument")} className={champ} />
        </div>
      </div>
      <div>
        <label htmlFor="document-titre" className={etiquette}>
          Titre <span className="font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <input id="document-titre" value={saisie.titre} onChange={changer("titre")} maxLength={120} className={champ} placeholder="Facture révision, Garage Martin" />
      </div>
      {historique.length > 0 ? (
        <div>
          <label htmlFor="document-intervention" className={etiquette}>
            Justifie une intervention <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <select id="document-intervention" value={saisie.historiqueId} onChange={changer("historiqueId")} className={`${champ} appearance-none`}>
            <option value="">Aucune</option>
            {historique.map((h) => (
              <option key={h.id} value={h.id}>
                {libelleIntervention(h)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {erreur ? <Alerte>{erreur}</Alerte> : null}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={enCours} className={`${boutonPrincipal} h-11 flex-1`}>
          {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
          Enregistrer
        </button>
        <button type="button" onClick={onAnnuler} disabled={enCours} className={`${boutonSecondaire} h-11 w-auto px-4`}>
          Annuler
        </button>
      </div>
    </form>
  );
}
