"use client";

// PROTOTYPE de l'écran Aujourd'hui — données fictives, aucune base.
//
// CE QU'ON CHERCHE À MONTRER
//
// L'écran actuel dit bonjour, affiche quatre grands compteurs, rappelle des
// raccourcis déjà dans la barre latérale, explique en permanence comment
// fonctionnent les envois, et finit par une liste de devis. Un garagiste qui
// l'ouvre à 8 h doit faire défiler pour trouver ce qui lui est demandé.
//
// Ici : un en-tête compact, une phrase, puis CE QU'IL FAUT FAIRE — véhicule,
// situation, raison de la priorité, une action nommée. Le reste descend.
//
// CE QU'IL RÉUTILISE
//
// `filVehicule` pour l'état et la prochaine action, `priorites.js` pour
// l'ordre et la raison, `groupes.js` pour le résumé de l'atelier. Aucune règle
// métier n'est réécrite ici : la maquette montre ce que le vrai code produit,
// sans quoi elle ne prouverait rien.

import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronRight, Search, Wrench } from "lucide-react";

import { filVehicule, libelleQuiAgit } from "../atelier/filVehicule";
import { GROUPES_ATELIER, regrouperOperationnel } from "../atelier/groupes";
import { arriveesDuJour, classerPriorites, decouperPriorites, pretesARendre } from "./priorites";
import { MAINTENANT_PROTO, SCENARIOS } from "./donneesPrototype";

const ACCENT = "#3D6BE0";
const NAVY = "#0F1B33";
const LIMITE_PRIORITES = 4;

const dateLongue = (d) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);

/** Le nom d'une voiture quand il manque une moitié — jamais un blanc. */
function nommerVehicule(d) {
  const modele = (d.vehicule || "").trim();
  if (modele && d.immatriculation) return { titre: d.immatriculation, sous: `${modele} · ${d.client}` };
  if (d.immatriculation) return { titre: d.immatriculation, sous: `Modèle non renseigné · ${d.client}` };
  if (modele) return { titre: modele, sous: `Sans plaque · ${d.client}` };
  return { titre: "Sans plaque", sous: `Véhicule non renseigné · ${d.client}` };
}

/** L'action nommée, telle que `filVehicule` la décide — jamais réécrite ici. */
function actionDe(ligne) {
  if (ligne.raisonCle === "prete_client_pas_prevenu") return "Prévenir le client";
  if (ligne.raisonCle === "attendue_en_retard") return "Appeler le client";
  if (ligne.raisonCle === "contradiction") return "Ouvrir le dossier";
  return ligne.fil?.libelleAction || "Ouvrir le dossier";
}

// ---------------------------------------------------------------------------

function Section({ titre, compte, action, enfants }) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {titre}
          {compte != null && <span className="ml-2 text-slate-400 tabular-nums">{compte}</span>}
        </h2>
        {action}
      </div>
      {enfants}
    </section>
  );
}

/**
 * Une priorité : une ligne, pas une carte.
 *
 * Sur téléphone, l'action passe SOUS le texte plutôt qu'à côté. Côte à côte,
 * la plaque tombait seule sur sa ligne, le nom du client était coupé à trois
 * mots et la raison s'étalait sur trois lignes contre un bouton — mesuré à
 * 375 px. Le texte prend la largeur, le bouton prend la sienne.
 */
function LignePriorite({ ligne, onAction }) {
  const { titre, sous } = nommerVehicule(ligne);
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-3 border-t border-slate-200 first:border-t-0"
      style={ligne.urgent ? { boxShadow: "inset 3px 0 0 #D97706", paddingLeft: 10 } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{titre}</span>
          <span className="text-[12.5px] text-slate-500 truncate">{sous}</span>
        </div>
        {/* La raison de la priorité, en clair : sans elle, l'ordre de la liste
            est un hasard qu'on subit. */}
        <div className={`text-[13px] mt-0.5 ${ligne.urgent ? "font-medium" : ""}`} style={{ color: ligne.urgent ? "#B45309" : "#334155" }}>
          {ligne.raison}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAction(ligne, actionDe(ligne))}
        className="shrink-0 w-full sm:w-auto min-h-[44px] px-3.5 rounded-lg text-[13px] font-semibold text-white"
        style={{ backgroundColor: ACCENT }}
      >
        {actionDe(ligne)}
      </button>
    </div>
  );
}

function LigneArrivee({ d, onOuvrir }) {
  const { titre, sous } = nommerVehicule(d);
  return (
    <button
      type="button"
      onClick={() => onOuvrir(d)}
      className="w-full text-left flex items-center gap-3 py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
    >
      <span className={`shrink-0 w-[52px] text-[13.5px] font-semibold tabular-nums ${d.enRetard ? "text-amber-700" : "text-slate-900"}`}>
        {d.heure}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[13.5px] font-medium text-slate-900 tabular-nums">{titre}</span>
        <span className="text-[12.5px] text-slate-500 ml-2 truncate">{sous}</span>
      </span>
      {d.enRetard && <span className="shrink-0 text-[12px] font-medium text-amber-700">pas arrivée</span>}
      <ChevronRight size={15} className="shrink-0 text-slate-300" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function AujourdhuiPrototype() {
  const [scenarioCle, setScenarioCle] = useState("habituelle");
  const [toutesLesPriorites, setToutesLesPriorites] = useState(false);
  const [destination, setDestination] = useState(null);

  const scenario = SCENARIOS.find((s) => s.cle === scenarioCle) || SCENARIOS[1];
  const maintenant = MAINTENANT_PROTO;

  // Le fil de chaque voiture, produit par le vrai module.
  const dossiers = useMemo(
    () => scenario.dossiers.map((d) => ({
      ...d,
      fil: filVehicule({
        rdv: d.rdv,
        devis: d.devis,
        ordre: d.ordre,
        facture: d.facture,
        etatEnvoiDevis: d.etatEnvoiDevis,
        etatEnvoiFacture: d.etatEnvoiFacture,
      }),
    })),
    [scenario],
  );

  const lignes = useMemo(() => classerPriorites(dossiers, maintenant), [dossiers, maintenant]);
  const { visibles, total, masquees } = decouperPriorites(lignes, toutesLesPriorites ? lignes.length : LIMITE_PRIORITES);
  const arrivees = useMemo(() => arriveesDuJour(dossiers, maintenant), [dossiers, maintenant]);
  const pretes = useMemo(() => pretesARendre(dossiers), [dossiers]);
  const groupes = useMemo(() => regrouperOperationnel(dossiers.map((d) => d.rdv), maintenant), [dossiers, maintenant]);
  const auGarage = groupes.reduce((n, g) => n + g.rendezVous.length, 0);

  // La phrase de situation : deux chiffres, pas un paragraphe.
  const phrase = auGarage === 0
    ? "Aucune voiture au garage aujourd'hui."
    : total === 0
      ? `${auGarage} voiture${auGarage > 1 ? "s" : ""} au garage. Rien n'attend de décision de votre part.`
      : `${auGarage} voiture${auGarage > 1 ? "s" : ""} au garage. ${total} demande${total > 1 ? "nt" : ""} une décision de votre part.`;

  const ouvrir = (d, quoi) => setDestination({ d, quoi });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F7F8FA" }}>
      {/* Sélecteur de scénario — il n'existe QUE dans le prototype. */}
      <div className="px-4 sm:px-6 py-2 text-white text-[12px] flex items-center gap-2 flex-wrap" style={{ backgroundColor: NAVY }}>
        <span className="font-semibold">Prototype</span>
        <span className="opacity-70">données fictives, aucune base</span>
        <span className="ml-auto flex items-center gap-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.cle}
              type="button"
              onClick={() => { setScenarioCle(s.cle); setToutesLesPriorites(false); setDestination(null); }}
              className="min-h-[32px] px-2.5 rounded-md text-[12px] font-medium"
              style={s.cle === scenarioCle ? { backgroundColor: "white", color: NAVY } : { backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              {s.titre}
            </button>
          ))}
        </span>
      </div>

      {/* EN-TÊTE COMPACT : le nom de l'écran, la date, la recherche. Pas de
          « Bonjour » — le garagiste sait qui il est, et la ligne coûtait la
          moitié du premier écran sur téléphone. */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Aujourd'hui</h1>
            <div className="text-[12.5px] text-slate-500 capitalize">{dateLongue(maintenant)}</div>
          </div>
          <div className="order-last w-full sm:order-none sm:w-auto sm:ml-auto sm:max-w-[380px] sm:flex-1">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 h-10">
              <Search size={16} className="shrink-0 text-slate-400" />
              <span className="text-[13.5px] text-slate-400 truncate">Plaque, client, téléphone, n° de facture…</span>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-4 max-w-[900px]">
        <p className="text-[14px] text-slate-700">{phrase}</p>

        {scenario.dossiers.length === 0 ? (
          // GARAGE VIDE : une seule entrée utile. Pas cinq cartes de mise en
          // route, pas de compteurs à zéro, pas de raccourcis.
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-8 text-center">
            <Wrench size={24} className="mx-auto text-slate-300" />
            <div className="mt-3 text-[15px] font-semibold text-slate-900">Votre première voiture</div>
            <p className="mt-1 text-[13px] text-slate-500 max-w-sm mx-auto">
              Dès qu'un rendez-vous est prévu pour aujourd'hui, il apparaît ici avec ce qu'il y a à faire.
            </p>
            <button
              type="button"
              onClick={() => ouvrir(null, "Ouvrir l'agenda")}
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] rounded-lg px-4 text-[13.5px] font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Prendre un rendez-vous <ArrowRight size={15} />
            </button>
            {!scenario.garage.horairesRenseignes && (
              // La configuration incomplète, DISCRÈTE : une ligne, pas une
              // carte de progression. Et elle nomme ce qu'elle débloque.
              <p className="mt-5 text-[12.5px] text-slate-400">
                Vos horaires ne sont pas renseignés : l'agenda proposera des créneaux les jours de fermeture.{" "}
                <button type="button" onClick={() => ouvrir(null, "Paramètres · horaires")} className="underline font-medium text-slate-500">
                  Les renseigner
                </button>
              </p>
            )}
          </div>
        ) : (
          <>
            <Section
              titre="À faire maintenant"
              compte={total || null}
              action={masquees > 0 || toutesLesPriorites ? (
                <button
                  type="button"
                  onClick={() => setToutesLesPriorites((v) => !v)}
                  className="text-[12.5px] font-semibold"
                  style={{ color: ACCENT }}
                >
                  {toutesLesPriorites ? "Réduire" : `Voir toutes (${total})`}
                </button>
              ) : null}
              enfants={
                total === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
                    Rien n'attend de décision. Les voitures en cours sont dans l'Atelier.
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white px-4">
                    {visibles.map((l) => <LignePriorite key={l.id} ligne={l} onAction={ouvrir} />)}
                  </div>
                )
              }
            />

            <Section
              titre="Arrivées et voitures prêtes"
              enfants={
                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="px-4 pt-3 pb-1 text-[12px] font-medium text-slate-500">
                    Attendues aujourd'hui {arrivees.length > 0 && <span className="tabular-nums">· {arrivees.length}</span>}
                  </div>
                  <div className="px-4 pb-2">
                    {arrivees.length === 0 ? (
                      <div className="py-3 text-[13px] text-slate-400">Aucune arrivée prévue aujourd'hui.</div>
                    ) : (
                      arrivees.map((d) => <LigneArrivee key={d.id} d={d} onOuvrir={(x) => ouvrir(x, "Ouvrir le dossier")} />)
                    )}
                  </div>

                  <div className="border-t border-slate-200 px-4 pt-3 pb-1">
                    <div className="text-[12px] font-medium text-slate-500">
                      Prêtes à rendre {pretes.length > 0 && <span className="tabular-nums">· {pretes.length}</span>}
                    </div>
                    {/* LA DISTINCTION QUI COMPTE : une arrivée a une heure, une
                        restitution n'en a pas. Nexora ne porte aucune heure de
                        restitution — on le dit, plutôt que d'afficher celle du
                        matin en laissant croire à un rendez-vous. */}
                    <div className="text-[11.5px] text-slate-400">Aucune heure de restitution n'est prévue dans Nexora.</div>
                  </div>
                  <div className="px-4 pb-3">
                    {pretes.length === 0 ? (
                      <div className="py-2 text-[13px] text-slate-400">Aucune voiture prête.</div>
                    ) : (
                      pretes.map((d) => {
                        const { titre, sous } = nommerVehicule(d);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => ouvrir(d, d.clientPrevenu ? "Ouvrir le dossier" : "Prévenir le client")}
                            className="w-full text-left flex items-center gap-3 py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="text-[13.5px] font-medium text-slate-900 tabular-nums">{titre}</span>
                              <span className="text-[12.5px] text-slate-500 ml-2 truncate">{sous}</span>
                            </span>
                            {d.clientPrevenu ? (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[12px] text-emerald-700">
                                <Check size={13} /> client prévenu
                              </span>
                            ) : (
                              <span className="shrink-0 text-[12px] font-medium text-amber-700">à prévenir</span>
                            )}
                            <ChevronRight size={15} className="shrink-0 text-slate-300" aria-hidden />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              }
            />

            {/* RÉSUMÉ DE L'ATELIER, DISCRET : une ligne de quatre chiffres qui
                mènent aux quatre files. Les quatre grandes cartes de compteurs
                disparaissent : elles occupaient un écran pour dire ce que
                cette ligne dit. */}
            <Section
              titre="Atelier"
              action={
                <button type="button" onClick={() => ouvrir(null, "Atelier")} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
                  Ouvrir l'Atelier
                </button>
              }
              enfants={
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 flex items-center gap-1 flex-wrap">
                  {GROUPES_ATELIER.map((g) => {
                    const n = groupes.find((x) => x.key === g.key)?.rendezVous.length ?? 0;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => ouvrir(null, `Atelier · ${g.label}`)}
                        className="min-h-[40px] px-2.5 rounded-lg hover:bg-slate-50 flex items-baseline gap-1.5"
                      >
                        <span className="text-[15px] font-semibold tabular-nums text-slate-900">{n}</span>
                        <span className="text-[12.5px] text-slate-500 whitespace-nowrap">{g.label}</span>
                      </button>
                    );
                  })}
                </div>
              }
            />

            {!scenario.garage.configurationComplete && (
              // Garage déjà actif : la configuration incomplète est une ligne
              // de bas de page, pas une carte de progression en tête d'écran.
              <p className="mt-6 text-[12.5px] text-slate-400">
                Votre configuration n'est pas terminée.{" "}
                <button type="button" onClick={() => ouvrir(null, "Paramètres")} className="underline font-medium text-slate-500">
                  La compléter
                </button>
              </p>
            )}
          </>
        )}

        {/* CE QUI A ÉTÉ RETIRÉ, ET OÙ ÇA VIT MAINTENANT — visible dans le
            prototype seulement, pour la revue. */}
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[12px] text-slate-500">
          <div className="font-semibold text-slate-600 mb-1">Retiré de cet écran — et où le retrouver</div>
          <ul className="space-y-0.5">
            <li>« Bonjour {"{"}garage{"}"} » et les quatre grandes cartes de compteurs → le résumé Atelier ci-dessus.</li>
            <li>Les raccourcis (Agenda, Clients, Facturation…) → la barre latérale, où ils sont déjà.</li>
            <li>Les explications permanentes sur les envois → l'écran d'envoi, au moment où l'on envoie.</li>
            <li>Le montant « à risque » et les indicateurs financiers → Statistiques.</li>
            <li>La carte « Mettez votre garage en route » → une ligne discrète en bas, qui nomme ce qu'elle débloque.</li>
          </ul>
        </div>
      </main>

      {destination && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setDestination(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Destination</div>
            <div className="text-[17px] font-semibold text-slate-900 mt-1">{destination.quoi}</div>
            {destination.d && (
              <div className="text-[13px] text-slate-600 mt-2">
                {nommerVehicule(destination.d).titre} — {nommerVehicule(destination.d).sous}
                <div className="mt-2 text-[12.5px] text-slate-500">
                  {destination.d.fil?.etat} · {libelleQuiAgit(destination.d.fil?.quiAgit)}
                </div>
              </div>
            )}
            <p className="text-[12px] text-slate-400 mt-3">
              Prototype : cet écran montre où mène l'action, il ne l'exécute pas.
            </p>
            <button
              type="button"
              onClick={() => setDestination(null)}
              className="mt-4 w-full min-h-[44px] rounded-xl border border-slate-200 text-[13.5px] font-semibold text-slate-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
