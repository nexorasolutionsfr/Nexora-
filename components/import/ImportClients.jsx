"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CHAMPS, analyser, apercu, construireLignes } from "./analyseFichier";

// Reprise de l'ancienne base clients et véhicules.
//
// Le parcours tient en deux gestes : choisir le fichier, confirmer. Tout ce qui
// se passe entre les deux — séparateur, correspondance des colonnes, aperçu
// chiffré — est fait par le logiciel et seulement SOUMIS au garage. Il corrige
// s'il le faut ; il n'a rien à paramétrer s'il ne le faut pas.
//
// L'aperçu n'est pas une politesse : c'est la seule protection du garage contre
// un import de travers. Il est donc obligatoire, et le bouton de confirmation
// n'apparaît qu'après lui.

const ETAT = { VIDE: "vide", LU: "lu", APERCU: "apercu", TERMINE: "termine" };

// Un message d'erreur qui envoie le garage corriger ses colonnes alors que sa
// session a expiré lui fait perdre son temps sur la mauvaise piste. Chaque
// cause connue a donc sa phrase, et le repli générique ne prétend rien savoir.
function messageErreur(error) {
  const code = error?.code || "";
  const brut = error?.message || "";

  // PostgREST ne trouve pas la fonction : la migration n'est pas appliquée sur
  // cet environnement. Ce n'est pas au garage de le deviner.
  if (code === "PGRST202") {
    return "La reprise de données n'est pas encore activée sur votre espace. Écrivez-nous, on s'en occupe.";
  }
  if (code === "42501" || brut.includes("Accès refusé")) {
    return "Vous n'avez pas accès à ce garage, ou votre session a expiré. Reconnectez-vous.";
  }
  if (brut.includes("Fichier invalide")) {
    return brut;
  }
  return "L'import n'a pas abouti. Réessayez dans un instant ; si cela persiste, écrivez-nous avec votre fichier.";
}

function Compteur({ valeur, libelle, ton = "neutre" }) {
  const couleurs = {
    neutre: "text-slate-900",
    bon: "text-emerald-700",
    attention: "text-amber-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className={`text-[20px] font-semibold tabular-nums ${couleurs[ton]}`}>{valeur}</div>
      <div className="text-[12px] text-slate-500">{libelle}</div>
    </div>
  );
}

export default function ImportClients({ garageId, onTermine }) {
  const [etat, setEtat] = useState(ETAT.VIDE);
  const [nomFichier, setNomFichier] = useState("");
  const [analyse, setAnalyse] = useState(null);
  const [correspondance, setCorrespondance] = useState({});
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const champFichier = useRef(null);

  function reinitialiser() {
    setEtat(ETAT.VIDE);
    setNomFichier("");
    setAnalyse(null);
    setCorrespondance({});
    setRapport(null);
    setErreur("");
    if (champFichier.current) champFichier.current.value = "";
  }

  async function choisirFichier(fichier) {
    if (!fichier) return;
    setErreur("");
    setRapport(null);

    // Un fichier de plusieurs dizaines de mégaoctets bloquerait l'onglet avant
    // même d'être lisible. On refuse avant de lire, pas après.
    if (fichier.size > 5 * 1024 * 1024) {
      setErreur("Le fichier dépasse 5 Mo. Exportez vos clients par tranches, ou envoyez-le-nous.");
      return;
    }

    const texte = await fichier.text();
    const resultat = analyser(texte);
    if (resultat.erreur) {
      setErreur(resultat.erreur);
      return;
    }

    setNomFichier(fichier.name);
    setAnalyse(resultat);
    setCorrespondance(resultat.correspondance);
    setEtat(ETAT.LU);
  }

  async function appelerImport(confirmer) {
    setErreur("");
    setEnCours(true);
    const lignes = construireLignes(analyse.lignes, correspondance);
    const { data, error } = await supabase.rpc("importer_clients_vehicules", {
      p_garage_id: garageId,
      p_lignes: lignes,
      p_confirmer: confirmer,
    });
    setEnCours(false);

    if (error) {
      console.error("Erreur import :", error);
      setErreur(messageErreur(error));
      return;
    }

    setRapport(data);
    setEtat(confirmer ? ETAT.TERMINE : ETAT.APERCU);
    if (confirmer && onTermine) onTermine(data);
  }

  const nomAssocie = correspondance.nom !== null && correspondance.nom !== undefined;
  const lignesUtiles = analyse ? construireLignes(analyse.lignes, correspondance).length : 0;

  return (
    <div className="max-w-3xl">
      <h2 className="text-[17px] font-semibold text-slate-900">Reprendre votre ancienne base</h2>
      <p className="mt-1 text-[13px] text-slate-500">
        Exportez vos clients depuis votre ancien logiciel au format CSV, puis déposez le fichier
        ici. Nexora reconnaît les colonnes tout seul et vous montre le résultat avant d&apos;écrire
        quoi que ce soit.
      </p>

      {/* ---------------------------------------------------------------- */}
      {etat === ETAT.VIDE && (
        <div className="mt-4">
          <label
            htmlFor="import-fichier"
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-blue-400 hover:bg-blue-50/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choisirFichier(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="text-[14px] font-medium text-slate-700">
              Déposez votre fichier, ou cliquez pour le choisir
            </span>
            <span className="mt-1 text-[12px] text-slate-500">CSV, jusqu&apos;à 5 Mo et 2 000 lignes</span>
          </label>
          <input
            id="import-fichier"
            ref={champFichier}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => choisirFichier(e.target.files?.[0])}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {analyse && etat !== ETAT.TERMINE && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[13px] font-medium text-slate-900">{nomFichier}</div>
            <button
              type="button"
              onClick={reinitialiser}
              className="text-[12px] text-slate-500 underline hover:text-slate-800"
            >
              Changer de fichier
            </button>
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            {analyse.lignes.length} ligne{analyse.lignes.length > 1 ? "s" : ""} lue
            {analyse.lignes.length > 1 ? "s" : ""}, {analyse.entetes.length} colonnes
          </div>

          <div className="mt-4 text-[12.5px] font-medium text-slate-700">
            Colonnes reconnues
          </div>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Corrigez si l&apos;une d&apos;elles est mal associée.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CHAMPS.map(({ cle, label, requis }) => (
              <label key={cle} className="flex items-center gap-2">
                <span className="w-[125px] shrink-0 text-[12.5px] text-slate-600">
                  {label}
                  {requis && <span className="text-rose-600"> *</span>}
                </span>
                <select
                  value={correspondance[cle] ?? ""}
                  onChange={(e) =>
                    setCorrespondance((p) => ({
                      ...p,
                      [cle]: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12.5px] text-slate-900"
                >
                  <option value="">— aucune —</option>
                  {analyse.entetes.map((entete, i) => (
                    <option key={i} value={i}>
                      {entete || `Colonne ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {!nomAssocie && (
            <p className="mt-3 text-[12.5px] text-amber-700">
              Associez la colonne du nom du client : c&apos;est la seule information obligatoire.
            </p>
          )}

          {nomAssocie && analyse.lignes.length > 0 && (
            <>
              <div className="mt-5 text-[12.5px] font-medium text-slate-700">
                Aperçu de vos premières lignes
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      {CHAMPS.map(({ cle, label }) => (
                        <th key={cle} className="whitespace-nowrap py-1.5 pr-3 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apercu(analyse.lignes, correspondance, 4).map((ligne, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {CHAMPS.map(({ cle }) => (
                          <td key={cle} className="whitespace-nowrap py-1.5 pr-3 text-slate-700">
                            {ligne[cle] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {erreur && <p className="mt-4 text-[12.5px] text-rose-600">{erreur}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => appelerImport(false)}
              disabled={!nomAssocie || enCours || lignesUtiles === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {enCours && etat === ETAT.LU ? "Analyse..." : "Vérifier sans rien importer"}
            </button>
            {etat === ETAT.APERCU && rapport && (
              <button
                type="button"
                onClick={() => appelerImport(true)}
                disabled={enCours}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {enCours ? "Import..." : `Importer ${rapport.clients_crees} client${rapport.clients_crees > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {rapport && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[13px] font-semibold text-slate-900">
            {rapport.confirme ? "Import terminé" : "Ce qui sera importé"}
          </div>
          {!rapport.confirme && (
            <p className="mt-0.5 text-[12px] text-slate-500">
              Rien n&apos;a encore été écrit. Ces chiffres sont exactement ceux de l&apos;import.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Compteur valeur={rapport.clients_crees} libelle="clients à créer" ton="bon" />
            <Compteur valeur={rapport.vehicules_crees} libelle="véhicules à créer" ton="bon" />
            <Compteur
              valeur={rapport.clients_ignores_doublon + rapport.vehicules_ignores_doublon}
              libelle="déjà connus, ignorés"
            />
            <Compteur
              valeur={rapport.lignes_rejetees}
              libelle="lignes écartées"
              ton={rapport.lignes_rejetees > 0 ? "attention" : "neutre"}
            />
          </div>

          {rapport.rejets?.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] text-amber-700">
                Voir les {rapport.rejets.length} ligne{rapport.rejets.length > 1 ? "s" : ""} écartée
                {rapport.rejets.length > 1 ? "s" : ""} et pourquoi
              </summary>
              <ul className="mt-2 max-h-52 overflow-y-auto text-[12px] text-slate-600">
                {rapport.rejets.map((r, i) => (
                  <li key={i} className="border-b border-slate-100 py-1">
                    Ligne {r.ligne}
                    {r.nom ? ` — ${r.nom}` : ""} : {r.motif}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rapport.confirme && (
            <button
              type="button"
              onClick={reinitialiser}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-medium text-slate-700"
            >
              Importer un autre fichier
            </button>
          )}
        </div>
      )}

      {erreur && !analyse && <p className="mt-4 text-[12.5px] text-rose-600">{erreur}</p>}

      <p className="mt-5 text-[12px] text-slate-400">
        Votre fichier ne quitte votre navigateur que sous forme de lignes reconnues, envoyées à
        votre propre garage. Si la reprise ne passe pas, écrivez-nous : on la fait pour vous.
      </p>
    </div>
  );
}
