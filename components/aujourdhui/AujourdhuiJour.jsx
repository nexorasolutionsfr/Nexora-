"use client";

// Aujourd'hui — une seule question : qu'est-ce que je dois traiter maintenant ?
//
// CE QUI A ÉTÉ SUPPRIMÉ, ET POURQUOI
//
// L'écran portait deux listes de priorités qui ne se connaissaient pas : celle
// des interventions et celle du Cockpit. Plus, en permanence, les arrivées, les
// voitures prêtes, quatre compteurs d'atelier, des pastilles « Nexora a
// repéré » qui répétaient une action déjà listée, et deux blocs pédagogiques.
// Le garagiste ne comparait plus des voitures : il comparait des blocs.
//
// Il reste : la liste, une ligne d'activité, et des accès discrets. Tout ce qui
// a quitté l'affichage permanent reste joignable — la correspondance est dans
// `docs/architecture/aujourdhui-a-traiter.md`, vérifiée ligne par ligne.
//
// CE QUE CET ÉCRAN NE DÉCIDE PAS
//
// Rien. `classerPriorites` juge l'intervention, `deriveOpportunites` juge les
// autres sources et porte le journal traité/reporté, `filVehicule` reste seul
// juge de l'état d'une voiture. Ce fichier affiche.

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Calendar, ChevronDown, ChevronRight, Clock, HelpCircle, Phone, Upload, UserPlus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { filVehicule } from "../atelier/filVehicule";
import { devisDeLaVisite } from "../vehicle-case-file/calculs";
import { classerPriorites, compterLeGarage } from "./priorites";
import { compterATraiter, construireATraiter, decouper } from "./aTraiter";
import RelanceTravailModal, { useRelancesTravaux } from "./RelanceTravail";
import { decorerLigneRelance, ouvreLaRelance } from "./relanceLigne";
import { CAPACITES } from "../parametres/capacites";

const RELANCES_DISPONIBLES = CAPACITES.relanceTravauxDifferes.disponible;

const ACCENT = "#3D6BE0";
const LIMITE = 6;
const TONS = { erreur: "#B91C1C", attention: "#B45309" };

/** Le nom d'une voiture quand il manque une moitié — jamais un blanc. */
function nommerVehicule(d) {
  const modele = (d.vehicule || "").trim();
  if (modele && d.immatriculation) return { titre: d.immatriculation, sous: `${modele} · ${d.client}` };
  if (d.immatriculation) return { titre: d.immatriculation, sous: `Modèle non renseigné · ${d.client}` };
  if (modele) return { titre: modele, sous: `Sans plaque · ${d.client}` };
  return { titre: "Sans plaque", sous: `Véhicule non renseigné · ${d.client || "client inconnu"}` };
}

/**
 * L'action nommée.
 *
 * « Vérifier le message » et non « Revalider l'envoi » : le geste ouvre
 * l'aperçu, avec la date, le motif, le destinataire et le texte. Rien ne part
 * avant une confirmation explicite, et le mot ne doit pas laisser croire le
 * contraire.
 */
function actionDe(ligne) {
  switch (ligne.raisonCle) {
    case "notification_non_envoyee":
    case "notification_bloquee":
    case "notification_incertaine": return "Vérifier le message";
    case "attendue_en_retard": return "Appeler le client";
    case "contradiction": return "Mettre l'atelier à jour";
    default: return ligne.fil?.libelleAction || "Ouvrir le dossier";
  }
}

function Bloc({ children, className = "" }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

/**
 * Une tâche.
 *
 * Un seul bouton par ligne. L'urgence se lit à la barre de gauche ET au mot,
 * jamais à la seule couleur. Les gestes secondaires — marquer traité, reporter
 * — s'ouvrent en dépliant la ligne : ils ne concurrencent pas l'action
 * principale.
 */
function LigneATraiter({ ligne, onAction, onTraiter, onReporter, journalDisponible }) {
  const [ouvert, setOuvert] = useState(false);
  const idDetails = useId();
  // Le suivi suit la SOURCE, pas l'origine de la ligne : une ligne
  // d'intervention qui a absorbé une opportunité en garde l'identité, donc
  // « Marquer traité » et « Reporter » restent offerts pour ce devis.
  const suivi = Boolean(ligne.sourceType && ligne.sourceId) && journalDisponible;
  // Ne se déplie que ce qui a quelque chose à montrer : les gestes de suivi.
  // Un chevron sur une ligne qui ne s'ouvre sur rien serait une promesse vide.
  const depliable = suivi;

  const contenu = (
    <span className="block min-w-0">
      <span className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap min-w-0">
        {ligne.urgent && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: TONS.attention }}>À faire d'abord</span>}
        <span className="text-[14.5px] font-semibold text-slate-900 break-words min-w-0">{ligne.titre}</span>
        {ligne.sujet && <span className="text-[12.5px] text-slate-500 break-words min-w-0">{ligne.sujet}</span>}
      </span>
      <span className="block text-[13px] text-slate-600 mt-0.5 break-words">
        {ligne.probleme}
        {ligne.precision ? <span className="text-slate-400"> · {ligne.precision}</span> : null}
      </span>
    </span>
  );

  return (
    <div className="border-t border-slate-100 first:border-t-0" style={ligne.urgent ? { boxShadow: "inset 3px 0 0 #B45309" } : undefined}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-3 px-4">
        {depliable ? (
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            aria-controls={idDetails}
            className="min-w-0 flex-1 text-left flex items-start gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <span className="min-w-0 flex-1">{contenu}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 mt-1 text-slate-400 transition-transform ${ouvert ? "rotate-180" : ""}`}
            />
          </button>
        ) : (
          <div className="min-w-0 flex-1">{contenu}</div>
        )}
        <button
          type="button"
          onClick={() => onAction(ligne)}
          className="shrink-0 w-full sm:w-auto min-h-[40px] px-3.5 rounded-lg text-[13px] font-semibold border flex items-center justify-center gap-1.5"
          style={{ color: ACCENT, borderColor: "#C7D6F7", backgroundColor: "#F5F8FF" }}
        >
          {ligne.actionLibelle} <ArrowRight size={14} />
        </button>
      </div>

      {depliable && ouvert && (
        <div id={idDetails} className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-3 text-[12.5px]">
          <button type="button" onClick={() => onTraiter(ligne)} className="font-semibold text-slate-500 hover:text-slate-800">
            Marquer traité
          </button>
          <button type="button" onClick={() => onReporter(ligne)} className="font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <Clock size={12} /> Reporter
          </button>
          <span className="text-slate-400">Marquer traité n'envoie rien et ne facture rien.</span>
          {ligne.fusionne?.length > 0 && (
            <span className="text-slate-400">« Marquer traité » ne masque que la réponse du client, pas le travail sur la voiture.</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function AujourdhuiJour({
  rendezVous = [],
  devisList = [],
  ordresReparation = [],
  factures = [],
  clients = [],
  chargement = false,
  erreurChargement = false,
  peutVoirLesEnvois = false,
  // Les états relus par le module « Prévenir le client » après une
  // autorisation. Cet écran fait sa propre lecture au chargement, mais elle ne
  // se rejoue qu'au changement de la liste des voitures prêtes : sans ce
  // relais, la ligne restait affichée « non envoyé » après une autorisation,
  // jusqu'à un rechargement à la main.
  etatsEnvoiFrais = null,
  onOuvrirDossierVehicule,
  onOuvrirAgenda,
  onOuvrirClients,
  onOuvrirImport,
  onOuvrirAtelier,
  onPrevenirClient,
  onAgirSurPriorite,
  // Le moteur du Cockpit, sans son écran.
  opportunites = null,
  journalDisponible = false,
  chargementOpportunites = false,
  erreurOpportunites = null,
  onTraiter,
  onReporter,
  onReactiver,
  onAjouterRappel,
  onOuvrirTravailDiffereModal,
  onOuvrirAide,
  // Les relances encore à venir : pas des tâches du jour, mais elles ne
  // doivent pas être invisibles pour autant.
  travauxDifferes = [],
  // Lues pour rattacher chaque tâche à son véhicule par identifiant.
  demandes = [],
  propositions = [],
  inspections = [],
  // Le badge « Aujourd'hui » reçoit le nombre d'actions de CETTE liste.
  onCompte,
  // Les relances préparées pour les travaux différés (20260919000400).
  garageId = null,
  onToast,
}) {
  const maintenant = new Date();
  // Une relance préparée ne crée pas de ligne de plus : elle devient le GESTE
  // de la ligne « travail différé » qui existe déjà. Même source, même
  // identité, une seule tâche.
  const { parTravail: relancesParTravail, recharger: rechargerRelances } = useRelancesTravaux(garageId, Boolean(garageId && journalDisponible));
  const [relanceOuverte, setRelanceOuverte] = useState(null);

  // LE DEVIS D'UNE VISITE NE SE DEVINE PAS
  // La première version prenait « le premier devis non refusé du véhicule » :
  // faux dès la deuxième visite, et une relance de devis se collait à un
  // rendez-vous qui n'avait rien à voir. Depuis le 2026-09-19, seules deux
  // relations explicites comptent — l'ordre (`ordre.devis_id`) et la
  // préparation (`devis.rendez_vous_id`) — et `devisDeLaVisite` ne choisit
  // rien quand plusieurs devis sont préparés pour la même visite.
  const dossiers = useMemo(() => rendezVous.map((r) => {
    const ordre = ordresReparation.find((o) => o.rendez_vous_id === r.id) || null;
    const { devis } = devisDeLaVisite({ rdv: r, ordre, devis: devisList });
    const facture = factures.find((f) => f.rendez_vous_id === r.id) || null;
    return {
      id: r.id, rdv: r, vehicule: r.vehicule, immatriculation: r.immatriculation, client: r.client,
      devis, ordre, facture,
      fil: filVehicule({ rdv: r, devis, ordre, facture }),
    };
  }), [rendezVous, devisList, ordresReparation, factures]);

  // L'ÉTAT DES MESSAGES SE DEMANDE, IL NE SE DEVINE PAS
  // `notifications_atelier` n'est lisible par aucun rôle applicatif : seule
  // `etat_envoi_atelier` y donne accès. Tant qu'elle n'a pas répondu, l'état
  // est INCONNU — jamais « non envoyé ».
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

  // Le plus frais gagne, et c'est toujours une réponse de la base : ni l'un ni
  // l'autre n'est déduit. `etat` est recopié tel quel — « en_attente_envoi »
  // reste « autorisée, départ en attente », jamais « envoyée ».
  const dossiersAvecEnvoi = useMemo(() => dossiers.map((d) => {
    const e = (etatsEnvoiFrais && etatsEnvoiFrais[d.id]) || etatsEnvoi[d.id];
    return e ? { ...d, etatNotification: e.etat, notificationMotif: e.motif, notificationDepuis: e.depuis } : d;
  }), [dossiers, etatsEnvoi, etatsEnvoiFrais]);

  const priorites = useMemo(() => classerPriorites(dossiersAvecEnvoi, maintenant), [dossiersAvecEnvoi]);
  // UNE LIGNE DE DEVIS DOIT MENER À SA VOITURE
  // Le Cockpit envoyait « Voir la réponse » vers l'écran Devis — une liste
  // générique, sans le véhicule ni l'intervention. On retrouve la voiture par
  // le devis, et on ouvre le dossier. Le repli reste l'écran Devis.
  // LE VÉHICULE D'UNE TÂCHE, PAR IDENTIFIANT
  // Chaque source qui porte `vehicule_id` est rattachée à sa voiture ; le
  // libellé vient de la fiche du véhicule, pas du texte de la tâche. Un rappel
  // n'a pas de colonne véhicule : il reste une action sans voiture. Une ligne
  // introuvable rend `null` — et le compteur de voitures cesse d'être affiché.
  const indexVehicules = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      const vs = Array.isArray(c.vehicules) ? c.vehicules : c.vehicules ? [c.vehicules] : [];
      for (const v of vs) {
        if (!v?.id) continue;
        m.set(v.id, {
          plaque: v.immatriculation || null,
          modele: `${v.marque || ""} ${v.modele || ""}`.trim() || null,
          client: c.nom || null,
        });
      }
    }
    return m;
  }, [clients]);

  const lignesParSource = useMemo(() => {
    const parId = (liste) => new Map((liste || []).filter((x) => x?.id).map((x) => [x.id, x]));
    const devis = parId(devisList);
    return {
      devis,
      reponse_devis: devis,
      inspection: parId(inspections),
      demande: parId(demandes),
      proposition: parId(propositions),
      travail_differe: parId(travauxDifferes),
      rdv_confirmation: parId(rendezVous),
    };
  }, [devisList, inspections, demandes, propositions, travauxDifferes, rendezVous]);

  const resoudreVehicule = (o) => {
    if (o.sourceType === "rappel") return { id: null };
    const ligneSource = lignesParSource[o.sourceType]?.get(o.sourceId);
    if (!ligneSource) return null;
    if (!ligneSource.vehicule_id) return { id: null };
    const v = indexVehicules.get(ligneSource.vehicule_id);
    return { id: ligneSource.vehicule_id, plaque: v?.plaque || null, modele: v?.modele || null, client: v?.client || null };
  };

  const aTraiter = useMemo(
    () => construireATraiter({ opportunites, priorites, nommer: nommerVehicule, action: actionDe, resoudreVehicule }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opportunites, priorites, indexVehicules, lignesParSource],
  );

  const [toutes, setToutes] = useState(false);
  const { visibles, total, masquees } = decouper(aTraiter, toutes ? aTraiter.length : LIMITE);
  const compte = compterATraiter(aTraiter);

  useEffect(() => {
    onCompte?.(erreurChargement || chargement || chargementOpportunites ? null : aTraiter.length);
  }, [onCompte, erreurChargement, chargement, chargementOpportunites, aTraiter.length]);
  const { presentes, attendues } = useMemo(() => compterLeGarage(dossiersAvecEnvoi, maintenant), [dossiersAvecEnvoi]);
  // `regrouperOperationnel` rend un TABLEAU de groupes, pas un objet indexé :
  // `groupes.pretes` valait `undefined`, et la ligne d'activité annonçait
  // « 0 prête » à côté de deux voitures prêtes listées juste au-dessus.
  // Trouvé à la première capture. On compte l'étape, directement.
  const pretes = dossiers.filter((d) => (d.rdv?.statut_atelier || "a_venir") === "pret").length;
  // UNE RELANCE FUTURE N'EST PAS UNE TÂCHE, MAIS ELLE RESTE VISIBLE
  // `deriveOpportunites` ne la produit pas tant que sa date n'est pas venue —
  // c'est juste. Elle se lit donc ici, avec sa date, et rejoint « À traiter »
  // le jour dit, sans que personne n'ait rien à faire.
  const relancesAVenir = useMemo(() => (travauxDifferes || [])
    .filter((t) => t.statut !== "recupere" && t.statut !== "refus_definitif" && t.date_relance && new Date(t.date_relance) > maintenant)
    .map((t) => ({
      key: `futur:${t.id}`,
      titre: t.intervention || "Travail à relancer",
      detail: `${t.clientNom || ""} · à relancer le ${new Date(t.date_relance).toLocaleDateString("fr-FR")}`.replace(/^ · /, ""),
    })), [travauxDifferes]);

  const agir = (l) => {
    // Un travail différé dont la relance est prête à relire : on ouvre la
    // relance, avec la voiture et le client. Sans relance, ou tant que l'envoi
    // des relances n'est pas disponible, rien ne change : suivi manuel.
    const relance = l.sourceType === "travail_differe" ? relancesParTravail.get(l.sourceId) : null;
    if (ouvreLaRelance(relance, RELANCES_DISPONIBLES)) {
      setRelanceOuverte({ relance, travail: lignesParSource.travail_differe.get(l.sourceId) || null });
      return;
    }
    if (l.origine === "cockpit") {
      // Seules les lignes de devis mènent au dossier du véhicule, comme avant :
      // connaître la voiture d'une inspection ou d'une demande ne change pas
      // sa destination.
      if ((l.sourceType === "devis" || l.sourceType === "reponse_devis") && l.vehiculeId) {
        onOuvrirDossierVehicule?.(l.vehiculeId);
        return;
      }
      l.onAction?.();
      return;
    }
    if (["notification_non_envoyee", "notification_bloquee", "notification_incertaine"].includes(l.raisonCle)) {
      onPrevenirClient?.(l.rdv); return;
    }
    onAgirSurPriorite?.(l);
  };

  // UNE ERREUR N'EST PAS UNE JOURNÉE VIDE
  // Sans cette distinction, un garage plein à qui la base répond mal lit
  // « rien à traiter », range son atelier et rentre chez lui.
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

  if (chargement || chargementOpportunites) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-[13px] text-slate-500">
        Chargement de votre journée…
      </div>
    );
  }

  const journeeVide = presentes === 0 && attendues === 0;
  const nouveauGarage = journeeVide && clients.length === 0 && total === 0;

  if (nouveauGarage) {
    return (
      <div>
        <p className="text-[14px] text-slate-700">Votre garage est prêt. Il n'y a encore aucun client ni véhicule enregistré.</p>
        <Bloc className="mt-4 px-5 py-8 max-w-[640px]">
          <div className="text-[15px] font-semibold text-slate-900">Commencez par vos clients</div>
          <p className="mt-1 text-[13px] text-slate-600 max-w-[52ch]">
            Ajoutez-les un par un, ou importez votre fichier existant. Ce qu'il y aura à traiter apparaîtra ensuite ici.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onOuvrirClients?.()} className="min-h-[44px] px-4 rounded-lg text-[13.5px] font-semibold text-white inline-flex items-center gap-2" style={{ backgroundColor: ACCENT }}>
              <UserPlus size={15} /> Ajouter un client
            </button>
            {onOuvrirImport && (
              <button type="button" onClick={() => onOuvrirImport()} className="min-h-[44px] px-4 rounded-lg text-[13.5px] font-semibold border border-slate-200 text-slate-700 inline-flex items-center gap-2">
                <Upload size={15} /> Importer mon fichier
              </button>
            )}
          </div>
        </Bloc>
      </div>
    );
  }

  // Le nombre de voitures n'apparaît que s'il est fiable ; sinon « N actions »,
  // plutôt qu'un chiffre qui laisserait croire à moins de voitures qu'il n'y en a.
  // Ce n'est pas le nombre de voitures présentes au garage : celui-là est sur
  // la ligne d'activité.
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const phrase = total === 0
    ? "Rien n'attend de décision de votre part."
    : !compte.fiable || compte.vehicules === 0 || (compte.vehicules === compte.actions && compte.sansVehicule === 0)
      ? `${pluriel(compte.actions, "action")} à traiter.`
      : `${pluriel(compte.actions, "action")} à traiter, dont ${pluriel(compte.vehicules, "voiture")} concernée${compte.vehicules > 1 ? "s" : ""}.`;

  return (
    <div className="space-y-4">
      {/* UNE SOURCE ILLISIBLE N'EST PAS UNE SOURCE VIDE */}
      {erreurOpportunites && (
        <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB", color: "#92400E" }}>
          Une partie de vos tâches n'a pas pu être lue ({erreurOpportunites}). La liste ci-dessous est donc incomplète — ne la lisez pas comme « tout est traité ».
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[14px] text-slate-700">{phrase}</p>
        {(masquees > 0 || toutes) && (
          <button type="button" onClick={() => setToutes((v) => !v)} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
            {toutes ? "Réduire" : `Voir toutes (${total})`}
          </button>
        )}
      </div>

      {total === 0 ? (
        <Bloc className="px-5 py-8 text-center">
          <div className="text-[15px] font-semibold text-slate-900">Rien à traiter pour l'instant</div>
          <p className="mt-1 text-[13px] text-slate-600">
            {journeeVide
              ? "Aucune voiture attendue, aucune à l'atelier. Les rendez-vous des prochains jours sont dans l'Agenda."
              : "Le travail en cours est dans l'Atelier."}
          </p>
          <button type="button" onClick={() => (journeeVide ? onOuvrirAgenda?.() : onOuvrirAtelier?.())} className="mt-3 min-h-[40px] px-4 rounded-lg text-[13px] font-semibold border inline-flex items-center gap-1.5" style={{ color: ACCENT, borderColor: "#C7D6F7", backgroundColor: "#F5F8FF" }}>
            {journeeVide ? "Ouvrir l'agenda" : "Ouvrir l'Atelier"} <ArrowRight size={14} />
          </button>
        </Bloc>
      ) : (
        <Bloc>
          {visibles.map((l) => (
            <LigneATraiter
              key={l.cle}
              ligne={decorerLigneRelance(l, l.sourceType === "travail_differe" ? relancesParTravail.get(l.sourceId) : null, RELANCES_DISPONIBLES)}
              onAction={agir}
              onTraiter={onTraiter}
              onReporter={onReporter}
              journalDisponible={journalDisponible}
            />
          ))}
        </Bloc>
      )}

      {/* L'ACTIVITÉ, EN UNE LIGNE
          Les listes complètes des arrivées et des voitures prêtes ont quitté
          l'affichage permanent : ce qui y demandait un geste est dans la liste
          ci-dessus, le reste se regarde dans l'Agenda et l'Atelier. */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-slate-500">
          <b className="text-slate-900 font-semibold tabular-nums">{presentes}</b> voiture{presentes > 1 ? "s" : ""} au garage
          {" · "}<b className="text-slate-900 font-semibold tabular-nums">{attendues}</b> attendue{attendues > 1 ? "s" : ""}
          {" · "}<b className="text-slate-900 font-semibold tabular-nums">{pretes}</b> prête{pretes > 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => onOuvrirAgenda?.()} className="text-[12.5px] font-semibold inline-flex items-center gap-1" style={{ color: ACCENT }}>
            Agenda <ChevronRight size={13} />
          </button>
          <button type="button" onClick={() => onOuvrirAtelier?.()} className="text-[12.5px] font-semibold inline-flex items-center gap-1" style={{ color: ACCENT }}>
            Atelier <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* LES ACCÈS DISCRETS — rien n'a disparu, tout est à un clic. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px]">
        <button type="button" onClick={() => onAjouterRappel?.()} className="font-semibold inline-flex items-center gap-1.5" style={{ color: ACCENT }}>
          <Phone size={12} /> Ajouter un rappel
        </button>
        <button type="button" onClick={() => onOuvrirTravailDiffereModal?.()} className="font-semibold inline-flex items-center gap-1.5" style={{ color: ACCENT }}>
          <Calendar size={12} /> Ajouter un travail à relancer
        </button>
        <SuiviReporte
          masquees={journalDisponible ? (opportunites?.masquees || []) : []}
          relancesAVenir={relancesAVenir}
          onReactiver={onReactiver}
          journalDisponible={journalDisponible}
        />
        {onOuvrirAide && (
          <button type="button" onClick={() => onOuvrirAide()} className="text-slate-500 font-medium inline-flex items-center gap-1.5 hover:text-slate-800">
            <HelpCircle size={12} /> Comprendre Nexora
          </button>
        )}
      </div>

      {relanceOuverte && (
        <RelanceTravailModal
          relance={relanceOuverte.relance}
          travail={relanceOuverte.travail}
          onToast={onToast}
          onChange={rechargerRelances}
          onFermer={() => setRelanceOuverte(null)}
        />
      )}
    </div>
  );
}

/**
 * Le suivi : ce qui a été traité ou reporté, et qui peut revenir.
 *
 * Replié par défaut, jamais supprimé. Une relance reportée au 30 du mois n'est
 * pas perdue : elle est ici, et elle revient dans la liste à son échéance.
 */
function SuiviReporte({ masquees, relancesAVenir = [], onReactiver, journalDisponible }) {
  const [ouvert, setOuvert] = useState(false);
  const total = masquees.length + relancesAVenir.length;
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => setOuvert((v) => !v)} className="text-slate-500 font-medium inline-flex items-center gap-1.5 hover:text-slate-800">
        <Clock size={12} /> Suivi et reports ({total})
      </button>
      {ouvert && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 min-w-[280px]">
          {relancesAVenir.map((r) => (
            <div key={r.key} className="px-3 py-2.5">
              <div className="text-[12.5px] font-medium text-slate-800">{r.titre}</div>
              <div className="text-[11.5px] text-slate-500">{r.detail}</div>
            </div>
          ))}
          {!journalDisponible && (
            <div className="px-3 py-2.5 text-[11.5px] text-slate-500">
              Le suivi traité/reporté est réservé au dirigeant et à l'accueil.
            </div>
          )}
          {total === 0 ? (
            <div className="px-3 py-3 text-[12.5px] text-slate-500">Rien de reporté ni de programmé pour l'instant.</div>
          ) : masquees.map((m) => (
            <div key={m.key} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-slate-800 truncate">{m.titre}</div>
                <div className="text-[11.5px] text-slate-500">
                  {m.masquageAction?.action === "reporte"
                    ? `reporté${m.masquageAction.masquer_jusqu_au ? ` jusqu'au ${new Date(m.masquageAction.masquer_jusqu_au).toLocaleDateString("fr-FR")}` : ""}`
                    : "marqué traité"}
                </div>
              </div>
              <button type="button" onClick={() => onReactiver?.(m)} className="text-[12px] font-semibold shrink-0" style={{ color: ACCENT }}>
                Remettre
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
