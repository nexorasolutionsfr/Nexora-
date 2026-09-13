"use client";

// La journée, en haut d'Aujourd'hui — version intégrée au tableau de bord.
//
// C'est le prototype validé, branché aux vraies données et aux vrais
// parcours. Ce qui disparaît par rapport à l'ancien haut d'écran : le grand
// « Bonjour », les quatre cartes de compteurs et les raccourcis déjà présents
// dans la barre latérale. Ce qui reste en dessous, inchangé : les demandes et
// devis à traiter, le prêt à valider, et l'argent à risque — aucun de ces
// trois n'a d'autre écran où vivre.
//
// CE QU'IL NE CALCULE PAS
//
// Rien. `filVehicule` décide de l'état et de la prochaine action, `priorites`
// classe et nomme la raison, `regrouperOperationnel` compte les files. Une
// seconde lecture des mêmes données, c'est la contradiction que ce produit
// passe son temps à supprimer.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Calendar, ChevronRight, Upload, UserPlus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { filVehicule } from "../atelier/filVehicule";
import { GROUPES_ATELIER, regrouperOperationnel } from "../atelier/groupes";
import {
  arriveesDuJour, classerPriorites, compterLeGarage, compterPriorites, decouperPriorites, lireEtatEnvoi, pretesARendre,
} from "./priorites";

const ACCENT = "#3D6BE0";
const LIMITE_PRIORITES = 4;

const TONS = { attention: "#B45309", erreur: "#B91C1C", succes: "#15803D", neutre: "#64748B" };

const dateCourte = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);
};

/** Le nom d'une voiture quand il manque une moitié — jamais un blanc. */
function nommerVehicule(d) {
  const modele = (d.vehicule || "").trim();
  if (modele && d.immatriculation) return { titre: d.immatriculation, sous: `${modele} · ${d.client}` };
  if (d.immatriculation) return { titre: d.immatriculation, sous: `Modèle non renseigné · ${d.client}` };
  if (modele) return { titre: modele, sous: `Sans plaque · ${d.client}` };
  return { titre: "Sans plaque", sous: `Véhicule non renseigné · ${d.client || "client inconnu"}` };
}

/** L'action nommée. Les cas d'envoi ont la leur ; le reste vient du fil. */
function actionDe(ligne) {
  switch (ligne.raisonCle) {
    case "notification_non_envoyee": return "Prévenir le client";
    case "notification_bloquee": return "Revalider l'envoi";
    case "notification_incertaine": return "Vérifier l'envoi";
    case "attendue_en_retard": return "Appeler le client";
    case "contradiction": return "Mettre l'atelier à jour";
    default: return ligne.fil?.libelleAction || "Ouvrir le dossier";
  }
}

function Section({ titre, compte, action, children }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {titre}
          {compte != null && <span className="ml-2 text-slate-400 tabular-nums">{compte}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Une priorité : une ligne, pas une carte.
 *
 * Sur téléphone, l'action passe SOUS le texte. Côte à côte, la plaque tombait
 * seule sur sa ligne et la raison s'étalait sur trois lignes contre un bouton.
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
        <div className={`text-[13px] mt-0.5 ${ligne.urgent ? "font-medium" : ""}`} style={{ color: ligne.urgent ? "#B45309" : "#334155" }}>
          {ligne.raison}
          {/* Deux interventions de la même voiture peuvent porter le même
              libellé — deux factures à établir, par exemple. Ce sont deux
              tâches : elles restent toutes les deux, et la date de la visite
              les distingue sans ouvrir les dossiers. Le module ne la pose que
              sur les lignes réellement jumelles. */}
          {ligne.precision ? <span className="text-slate-400"> · {ligne.precision}</span> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAction(ligne)}
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
      className="w-full text-left flex items-baseline gap-2.5 py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
    >
      <span className={`shrink-0 w-[46px] text-[13px] font-semibold tabular-nums ${d.enRetard ? "text-amber-700" : "text-slate-900"}`}>
        {d.heure}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-900 tabular-nums truncate">{titre}</span>
        <span className="block text-[12px] text-slate-500 truncate">{sous}</span>
      </span>
      {/* Fait d'arrivée. Ne dit rien des travaux. */}
      {d.enRetard && <span className="shrink-0 text-[11.5px] font-medium text-amber-700">pas arrivée</span>}
    </button>
  );
}

/**
 * Une voiture prête, avec l'état réel de sa notification.
 *
 * Quand elle est BLOQUÉE, on montre depuis quand et pourquoi — avant toute
 * revalidation. Trois voitures de la Production sont dans ce cas depuis fin
 * août : les revalider à l'aveugle enverrait « venez la chercher » pour un
 * rendez-vous vieux de trois semaines.
 */
function LignePrete({ d, onOuvrir }) {
  const { titre, sous } = nommerVehicule(d);
  const etat = lireEtatEnvoi(d.etatNotification);
  const bloquee = etat.cle === "bloque";
  const depuis = dateCourte(d.notificationDepuis) || dateCourte(d.rdv?.date_debut);
  return (
    <button
      type="button"
      onClick={() => onOuvrir(d)}
      className="w-full text-left py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
    >
      <span className="flex items-baseline gap-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-slate-900 tabular-nums truncate">{titre}</span>
          <span className="block text-[12px] text-slate-500 truncate">{sous}</span>
        </span>
        <span className="shrink-0 text-[11.5px] font-medium" style={{ color: TONS[etat.ton] || TONS.neutre }}>
          {etat.court}
        </span>
      </span>
      {bloquee && (
        <span className="block mt-1 text-[11.5px]" style={{ color: TONS.erreur }}>
          {depuis ? `Bloquée depuis le ${depuis} — ` : "Bloquée — "}
          {d.notificationMotif || "motif non enregistré."}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------

export default function AujourdhuiJour({
  rendezVous = [],
  devisList = [],
  ordresReparation = [],
  factures = [],
  clients = [],
  garageData = {},
  chargement = false,
  erreurChargement = false,
  peutVoirLesEnvois = false,
  onOuvrirDossierVehicule,
  onOuvrirAgenda,
  onOuvrirClients,
  onOuvrirImport,
  onOuvrirAtelier,
  onOuvrirParametres,
  onPrevenirClient,
  onAgirSurPriorite,
  zonesTravail = null,
}) {
  const maintenant = new Date();

  // Le fil de chaque rendez-vous, produit par le module métier. Les documents
  // sont rattachés comme le dossier véhicule le fait : par l'intervention.
  const dossiers = useMemo(() => rendezVous.map((r) => {
    const devis = devisList.find((d) => d.vehicule_id === r.vehicule_id && d.statut !== "refuse") || null;
    const ordre = ordresReparation.find((o) => o.rendez_vous_id === r.id) || null;
    const facture = factures.find((f) => f.rendez_vous_id === r.id) || null;
    return {
      id: r.id,
      rdv: r,
      vehicule: r.vehicule,
      immatriculation: r.immatriculation,
      client: r.client,
      devis, ordre, facture,
      fil: filVehicule({ rdv: r, devis, ordre, facture }),
    };
  }), [rendezVous, devisList, ordresReparation, factures]);

  // L'ÉTAT DES NOTIFICATIONS SE DEMANDE, IL NE SE DEVINE PAS
  //
  // `notifications_atelier` n'est lisible par aucun rôle applicatif : seule
  // `etat_envoi_atelier` y donne accès. On l'interroge pour les voitures
  // prêtes, et pour elles seules. Tant qu'elle n'a pas répondu, l'état reste
  // `null` — c'est-à-dire INCONNU, jamais « non envoyée ».
  const [etatsEnvoi, setEtatsEnvoi] = useState({});
  const pretsIds = useMemo(
    () => dossiers.filter((d) => (d.rdv?.statut_atelier || "a_venir") === "pret").map((d) => d.id).sort().join(","),
    [dossiers],
  );

  useEffect(() => {
    if (!peutVoirLesEnvois) { setEtatsEnvoi({}); return; }
    const ids = pretsIds ? pretsIds.split(",") : [];
    if (ids.length === 0) { setEtatsEnvoi({}); return; }
    let annule = false;
    (async () => {
      const paires = await Promise.all(ids.map(async (id) => {
        const { data, error } = await supabase.rpc("etat_envoi_atelier", { p_rendez_vous_id: id });
        return [id, error || !data?.ok ? null : data];
      }));
      if (!annule) setEtatsEnvoi(Object.fromEntries(paires));
    })();
    return () => { annule = true; };
  }, [pretsIds, peutVoirLesEnvois]);

  const dossiersAvecEnvoi = useMemo(() => dossiers.map((d) => {
    const e = etatsEnvoi[d.id];
    return e ? { ...d, etatNotification: e.etat, notificationMotif: e.motif, notificationDepuis: e.depuis } : d;
  }), [dossiers, etatsEnvoi]);

  const lignes = useMemo(() => classerPriorites(dossiersAvecEnvoi, maintenant), [dossiersAvecEnvoi]);
  const [toutes, setToutes] = useState(false);
  const { visibles, total, masquees } = decouperPriorites(lignes, toutes ? lignes.length : LIMITE_PRIORITES);
  const { actions, vehicules: vehiculesConcernes } = compterPriorites(lignes);
  const arrivees = useMemo(() => arriveesDuJour(dossiersAvecEnvoi, maintenant), [dossiersAvecEnvoi]);
  const pretes = useMemo(() => pretesARendre(dossiersAvecEnvoi), [dossiersAvecEnvoi]);
  const groupes = useMemo(() => regrouperOperationnel(dossiers.map((d) => d.rdv), maintenant), [dossiers]);
  const { presentes, attendues } = useMemo(() => compterLeGarage(dossiersAvecEnvoi, maintenant), [dossiersAvecEnvoi]);

  // UNE ERREUR N'EST PAS UNE JOURNÉE VIDE
  //
  // Sans cette distinction, un garage plein à qui la base répond mal lit
  // « Rien de prévu aujourd'hui », range son atelier et rentre chez lui.
  if (erreurChargement) {
    return (
      <div className="rounded-xl border px-5 py-6" style={{ borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: TONS.erreur }} />
          <div>
            <div className="text-[15px] font-semibold" style={{ color: "#991B1B" }}>Impossible de charger votre journée</div>
            <p className="mt-1 text-[13px]" style={{ color: "#991B1B" }}>
              Ce n'est pas une journée vide : les données n'ont pas pu être lues. Rechargez la page dans un instant.
              Si cela persiste, ne vous fiez pas à cet écran pour savoir ce qu'il y a à faire.
            </p>
            <button
              type="button"
              onClick={() => typeof window !== "undefined" && window.location.reload()}
              className="mt-3 min-h-[44px] px-4 rounded-lg text-[13.5px] font-semibold text-white"
              style={{ backgroundColor: "#B91C1C" }}
            >
              Recharger
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (chargement) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-[13px] text-slate-500">
        Chargement de votre journée…
      </div>
    );
  }

  const journeeVide = presentes === 0 && attendues === 0;
  // Un garage sans aucun client n'a jamais rien fait : on l'aide à démarrer.
  // Un garage qui a des clients et rien aujourd'hui a simplement une journée
  // creuse — lui parler de « première voiture » serait absurde.
  const nouveauGarage = journeeVide && clients.length === 0;

  const phrase = nouveauGarage
    ? "Votre garage est prêt. Il n'y a encore aucun client ni véhicule enregistré."
    : journeeVide
      ? "Rien de prévu aujourd'hui."
      : [
          presentes > 0 ? `${presentes} voiture${presentes > 1 ? "s" : ""} au garage` : null,
          attendues > 0 ? `${attendues} attendue${attendues > 1 ? "s" : ""}` : null,
        ].filter(Boolean).join(", ") + ". " + (
          // « 11 demandent une décision » se lisait comme onze VOITURES. Il y
          // en avait neuf : deux portaient deux gestes chacune. On nomme donc
          // ce qu'on compte — des actions — et on dit sur combien de voitures
          // elles portent quand les deux chiffres diffèrent.
          actions === 0 ? "Rien n'attend de décision de votre part."
            : actions === vehiculesConcernes
              ? `${actions} action${actions > 1 ? "s" : ""} vous attend${actions > 1 ? "ent" : ""}.`
              : `${actions} actions vous attendent, sur ${vehiculesConcernes} voitures.`
        );

  if (nouveauGarage) {
    return (
      <div>
        <p className="text-[14px] text-slate-700">{phrase}</p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 max-w-[640px]">
          <div className="text-[15px] font-semibold text-slate-900">Commencez par vos clients</div>
          <p className="mt-1 text-[13px] text-slate-500">
            Ajoutez-les un par un, ou importez votre fichier existant. Les rendez-vous du jour
            apparaîtront ensuite ici avec ce qu'il y a à faire.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={onOuvrirClients}
              className="min-h-[44px] px-4 rounded-lg text-[13.5px] font-semibold text-white inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: ACCENT }}>
              <UserPlus size={15} /> Ajouter un client
            </button>
            {onOuvrirImport && (
              <button type="button" onClick={onOuvrirImport}
                className="min-h-[44px] px-4 rounded-lg border border-slate-200 text-[13.5px] font-semibold text-slate-700 inline-flex items-center justify-center gap-2">
                <Upload size={15} /> Importer mon fichier
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (journeeVide) {
    return (
      <div>
        <p className="text-[14px] text-slate-700">{phrase}</p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-8 max-w-[640px]">
          <Calendar size={22} className="text-slate-300" />
          <div className="mt-2 text-[15px] font-semibold text-slate-900">Rien de prévu aujourd'hui</div>
          <p className="mt-1 text-[13px] text-slate-500">
            Aucune voiture attendue, aucune à l'atelier. Les rendez-vous des prochains jours sont dans l'Agenda.
          </p>
          <button type="button" onClick={onOuvrirAgenda}
            className="mt-4 inline-flex items-center gap-2 min-h-[44px] rounded-lg px-4 text-[13.5px] font-semibold text-white"
            style={{ backgroundColor: ACCENT }}>
            Ouvrir l'agenda <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[14px] text-slate-700 max-w-[70ch]">{phrase}</p>

      {/* DEUX COLONNES sur grand écran : les décisions à gauche, sur la
          largeur utile ; le contexte à droite, plus étroit. Une seule colonne
          sur téléphone, les priorités d'abord. */}
      <div className="mt-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-x-6">
        <div className="min-w-0">
          <Section
            titre="À faire maintenant"
            compte={total || null}
            action={masquees > 0 || toutes ? (
              <button type="button" onClick={() => setToutes((v) => !v)} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
                {toutes ? "Réduire" : `Voir toutes (${total})`}
              </button>
            ) : null}
          >
            {total === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[13px] text-slate-500">
                Rien n'attend de décision. Les voitures en cours sont dans l'Atelier.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white px-4">
                {visibles.map((l) => <LignePriorite key={l.id} ligne={l} onAction={onAgirSurPriorite} />)}
              </div>
            )}
          </Section>

          {/* CE QUI VIENT DES CLIENTS ET CE QUI ATTEND VALIDATION, ICI
              Ces deux blocs vivaient tout en bas, sous un résumé d'atelier qui
              disait autre chose que celui d'en haut. Leur place est dans la
              zone de travail : sous les priorités, là où l'écran large laissait
              du vide. Ils ne sont pas recalculés — c'est le même contenu, au
              bon endroit. */}
          {zonesTravail ? <div className="mt-5">{zonesTravail}</div> : null}
        </div>

        <div className="min-w-0">
          <Section titre="Arrivées attendues" compte={arrivees.length || null}>
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1">
              {arrivees.length === 0 ? (
                <div className="py-3 text-[13px] text-slate-400">Aucune arrivée prévue aujourd'hui.</div>
              ) : (
                arrivees.map((d) => <LigneArrivee key={d.id} d={d} onOuvrir={(x) => onOuvrirDossierVehicule?.(x.rdv?.vehicule_id)} />)
              )}
            </div>
          </Section>

          <Section titre="Voitures prêtes" compte={pretes.length || null}>
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1">
              {/* Une arrivée a une heure, une restitution n'en a pas : Nexora
                  n'en porte aucune. On le dit plutôt que d'afficher celle du
                  matin en laissant croire à un rendez-vous. */}
              <div className="pt-2 pb-1 text-[11.5px] text-slate-400">
                Aucune heure de restitution n'est prévue dans Nexora.
              </div>
              {pretes.length === 0 ? (
                <div className="pb-3 text-[13px] text-slate-400">Aucune voiture prête.</div>
              ) : (
                <div className="pb-1">
                  {pretes.map((d) => <LignePrete key={d.id} d={d} onOuvrir={onPrevenirClient} />)}
                </div>
              )}
            </div>
          </Section>

          <Section
            titre="Atelier"
            action={
              <button type="button" onClick={() => onOuvrirAtelier?.()} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
                Ouvrir
              </button>
            }
          >
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {GROUPES_ATELIER.map((g) => {
                const n = groupes.find((x) => x.key === g.key)?.rendezVous.length ?? 0;
                return (
                  <button key={g.key} type="button" onClick={() => onOuvrirAtelier?.(g.key)}
                    className="w-full min-h-[40px] px-3.5 flex items-center justify-between hover:bg-slate-50">
                    <span className="text-[13px] text-slate-600">{g.label}</span>
                    <span className="text-[14px] font-semibold tabular-nums text-slate-900">{n}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
