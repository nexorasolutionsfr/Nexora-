"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import {
  ajouterNote,
  avancerEtapeParOrdre,
  chargerMesNotes,
  chargerMesOrdres,
  chargerMonOrdre,
  marquerLigne,
} from "./acces";

// L'écran du mécanicien.
//
// Il ne lit AUCUNE table. Les cinq fonctions appelées ici sont les seules
// portes que la migration 20260905000400 lui ouvre, et elles projettent
// explicitement les colonnes autorisées : jamais un prix, jamais le téléphone
// ni l'e-mail du client, jamais les notes internes. Il n'y a donc rien à
// masquer côté affichage — ce qui n'est pas montré n'a jamais été reçu.
//
// Pas de barre latérale, pas de vues multiples : un mécanicien a une liste de
// travail et le détail d'une fiche. Lui poser le tableau de bord complet
// autour reviendrait à lui montrer des écrans que la base refuse.

const ETAPES = [
  ["depose", "Véhicule déposé"],
  ["diagnostic", "Diagnostic"],
  ["attente_piece", "Attente pièce"],
  ["attente_client", "Attente client"],
  ["intervention", "En intervention"],
  ["pret", "Prêt"],
];

const LIBELLE_ETAPE = Object.fromEntries([["a_venir", "À venir"], ...ETAPES, ["restitue", "Restitué"]]);

const LIBELLE_STATUT_LIGNE = { prevu: "À faire", fait: "Fait", annule: "Annulée" };

// Un message brut de PostgREST n'apprend rien à un mécanicien. Chaque cause
// connue a sa phrase ; le repli ne prétend rien savoir.
function messageErreur(e) {
  if (e?.code === "PGRST202") {
    return "Cette action n'est pas encore activée sur votre espace. Prévenez votre dirigeant.";
  }
  if (/introuvable ou accès refusé/i.test(e?.message || "")) {
    return "Cette fiche ne vous est plus affectée. Revenez à votre liste.";
  }
  return e?.message || "L'action n'a pas abouti. Réessayez dans un instant.";
}

function Puce({ ton = "neutre", children }) {
  const tons = {
    neutre: "bg-slate-100 text-slate-700",
    vert: "bg-emerald-50 text-emerald-700",
    ambre: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${tons[ton]}`}>
      {children}
    </span>
  );
}

export default function AtelierMecanicienScreen() {
  const [ordres, setOrdres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [ordreOuvert, setOrdreOuvert] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [notes, setNotes] = useState([]);
  const [nouvelleNote, setNouvelleNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  // L'action « étape » dépend d'une fonction ajoutée après coup
  // (20260913000200). Tant qu'elle n'est pas appliquée, on ne propose pas un
  // bouton qui échouerait : on le découvre au premier essai, une seule fois.
  const [etapeIndisponible, setEtapeIndisponible] = useState(false);

  const rechargerListe = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      setOrdres(await chargerMesOrdres(supabase));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    rechargerListe();
  }, [rechargerListe]);

  const ouvrir = useCallback(async (ordre) => {
    setErreur("");
    setOrdreOuvert(ordre);
    setLignes([]);
    setNotes([]);
    try {
      const [l, n] = await Promise.all([
        chargerMonOrdre(supabase, ordre.ordre_id),
        chargerMesNotes(supabase, ordre.ordre_id),
      ]);
      setLignes(l);
      setNotes(n);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, []);

  async function changerLigne(ligne, statut) {
    setEnCours(true);
    setErreur("");
    try {
      await marquerLigne(supabase, { ligneId: ligne.ligne_id, statut });
      setLignes(await chargerMonOrdre(supabase, ordreOuvert.ordre_id));
      await rechargerListe();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function changerEtape(statut) {
    setEnCours(true);
    setErreur("");
    try {
      await avancerEtapeParOrdre(supabase, { ordreId: ordreOuvert.ordre_id, statut });
      setOrdreOuvert((o) => ({ ...o, etape_atelier: statut }));
      await rechargerListe();
    } catch (e) {
      if (e?.code === "PGRST202") setEtapeIndisponible(true);
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerNote(e) {
    e.preventDefault();
    setEnCours(true);
    setErreur("");
    try {
      await ajouterNote(supabase, { ordreId: ordreOuvert.ordre_id, note: nouvelleNote });
      setNouvelleNote("");
      setNotes(await chargerMesNotes(supabase, ordreOuvert.ordre_id));
    } catch (e2) {
      setErreur(messageErreur(e2));
    } finally {
      setEnCours(false);
    }
  }

  const entete = (
    <header className="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[20px] font-semibold text-slate-900">Mon atelier</h1>
        <p className="text-[13px] text-slate-500">
          Les fiches qui vous sont affectées, et rien d'autre.
        </p>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="text-[13px] font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
      >
        Se déconnecter
      </button>
    </header>
  );

  const bandeauErreur = erreur ? (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
      {erreur}
    </p>
  ) : null;

  if (ordreOuvert) {
    const vehicule = [ordreOuvert.marque, ordreOuvert.modele].filter(Boolean).join(" ");
    const clos = ordreOuvert.statut === "termine";
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {entete}
          <button
            type="button"
            onClick={() => { setOrdreOuvert(null); setErreur(""); }}
            className="text-[13px] font-medium text-slate-600 hover:underline mb-4"
          >
            ← Revenir à mes fiches
          </button>
          {bandeauErreur}

          <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-slate-900">
                {vehicule || "Véhicule"}
              </span>
              {ordreOuvert.immatriculation && (
                <Puce>{ordreOuvert.immatriculation}</Puce>
              )}
              <Puce ton="ambre">{LIBELLE_ETAPE[ordreOuvert.etape_atelier] || "—"}</Puce>
            </div>
            <p className="text-[13px] text-slate-500 mt-1">{ordreOuvert.client_nom}</p>
          </section>

          {!etapeIndisponible && (
            <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
              <h2 className="text-[14px] font-semibold text-slate-900 mb-2">Où en est le véhicule</h2>
              <div className="flex flex-wrap gap-2">
                {ETAPES.map(([cle, libelle]) => (
                  <button
                    key={cle}
                    type="button"
                    disabled={enCours}
                    onClick={() => changerEtape(cle)}
                    className="text-[13px] font-medium px-3 py-1.5 rounded-lg border disabled:opacity-60"
                    style={
                      ordreOuvert.etape_atelier === cle
                        ? { backgroundColor: "#0F172A", color: "#fff", borderColor: "#0F172A" }
                        : { borderColor: "#E2E8F0", color: "#334155" }
                    }
                  >
                    {libelle}
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] text-slate-500 mt-2">
                La restitution au client n'est pas de votre ressort : elle ouvre
                la facturation.
              </p>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <h2 className="text-[14px] font-semibold text-slate-900 mb-2">Le travail à faire</h2>
            {lignes.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune ligne sur cette fiche.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lignes.map((l) => (
                  <li key={l.ligne_id} className="py-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-900">
                      {l.libelle}
                      {l.quantite && Number(l.quantite) !== 1 ? ` × ${l.quantite}` : ""}
                    </span>
                    {l.duree_minutes ? (
                      <span className="text-[12.5px] text-slate-500">{l.duree_minutes} min</span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-2">
                      <Puce ton={l.statut === "fait" ? "vert" : "neutre"}>
                        {LIBELLE_STATUT_LIGNE[l.statut] || l.statut}
                      </Puce>
                      {!clos && l.statut !== "annule" && (
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => changerLigne(l, l.statut === "fait" ? "prevu" : "fait")}
                          className="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-60"
                        >
                          {l.statut === "fait" ? "Rouvrir" : "Marquer fait"}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {clos && (
              <p className="text-[12.5px] text-slate-500 mt-3">
                Cette fiche est terminée : elle ne se modifie plus.
              </p>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-[14px] font-semibold text-slate-900 mb-2">Vos constats</h2>
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500 mb-3">Aucun constat pour l'instant.</p>
            ) : (
              <ul className="divide-y divide-slate-100 mb-3">
                {notes.map((n) => (
                  <li key={n.note_id} className="py-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</p>
                    <p className="text-[12px] text-slate-400">
                      {new Date(n.created_at).toLocaleString("fr-FR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={envoyerNote} className="grid gap-2">
              <label className="text-[13px] font-medium text-slate-700" htmlFor="nx-note">
                Ajouter un constat
              </label>
              <textarea
                id="nx-note"
                value={nouvelleNote}
                onChange={(e) => setNouvelleNote(e.target.value)}
                rows={3}
                required
                placeholder="Ce que vous avez constaté sur le véhicule."
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
              <div>
                <button
                  type="submit"
                  disabled={enCours || !nouvelleNote.trim()}
                  className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-60"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {entete}
        {bandeauErreur}
        {chargement ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : ordres.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune fiche ne vous est affectée pour l'instant. Elles apparaîtront
            ici dès que votre dirigeant vous en confie une.
          </p>
        ) : (
          <ul className="grid gap-3">
            {ordres.map((o) => {
              const vehicule = [o.marque, o.modele].filter(Boolean).join(" ");
              const total = Number(o.nb_lignes || 0);
              const faites = Number(o.nb_lignes_faites || 0);
              return (
                <li key={o.ordre_id}>
                  <button
                    type="button"
                    onClick={() => ouvrir(o)}
                    className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-slate-900">
                        {vehicule || "Véhicule"}
                      </span>
                      {o.immatriculation && <Puce>{o.immatriculation}</Puce>}
                      <span className="ml-auto">
                        <Puce ton={total > 0 && faites === total ? "vert" : "ambre"}>
                          {faites}/{total} fait{faites > 1 ? "s" : ""}
                        </Puce>
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-500 mt-1">
                      {o.client_nom}
                      {o.date_debut
                        ? ` · ${new Date(o.date_debut).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`
                        : ""}
                      {o.etape_atelier ? ` · ${LIBELLE_ETAPE[o.etape_atelier] || o.etape_atelier}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
