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
// l'ordre, la raison et la lecture des états d'envoi, `groupes.js` pour le
// résumé de l'atelier. Aucune règle métier n'est réécrite ici : la maquette
// montre ce que le vrai code produit, sans quoi elle ne prouverait rien.
//
// LE CADRE
//
// L'écran est montré DANS le cadre du tableau de bord — barre latérale et
// recherche — parce qu'un écran jugé hors de son cadre se juge mal : la
// largeur disponible, la place de la recherche et le retour à l'Atelier en
// dépendent. Les commandes de scénario et les notes de conception sont
// signalées comme des outils de revue et n'appartiennent pas à l'interface
// destinée au garage.

import { useMemo, useState } from "react";
import {
  ArrowRight, Calendar, ChevronRight, ClipboardCheck, ClipboardList, FlaskConical,
  Home, Inbox, ReceiptText, Search, Settings, TrendingUp, Upload, UserPlus, Users, Wrench,
} from "lucide-react";

import { filVehicule, libelleQuiAgit } from "../atelier/filVehicule";
import { GROUPES_ATELIER, regrouperOperationnel } from "../atelier/groupes";
import {
  arriveesDuJour, classerPriorites, compterLeGarage, decouperPriorites, lireEtatEnvoi, pretesARendre,
} from "./priorites";
import { MAINTENANT_PROTO, SCENARIOS } from "./donneesPrototype";

const ACCENT = "#3D6BE0";
const NAVY = "#0F1B33";
const LIMITE_PRIORITES = 4;

const TONS = {
  attention: "#B45309",
  erreur: "#B91C1C",
  succes: "#15803D",
  neutre: "#64748B",
};

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

// ---------------------------------------------------------------------------

function Section({ titre, compte, action, enfants, classe = "" }) {
  return (
    <section className={`mt-6 first:mt-0 ${classe}`}>
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
      className="w-full text-left flex items-baseline gap-2.5 py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
    >
      <span className={`shrink-0 w-[46px] text-[13px] font-semibold tabular-nums ${d.enRetard ? "text-amber-700" : "text-slate-900"}`}>
        {d.heure}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-900 tabular-nums truncate">{titre}</span>
        <span className="block text-[12px] text-slate-500 truncate">{sous}</span>
      </span>
      {/* « pas arrivée » est un fait d'arrivée. Il ne dit rien des travaux. */}
      {d.enRetard && <span className="shrink-0 text-[11.5px] font-medium text-amber-700">pas arrivée</span>}
    </button>
  );
}

function LignePrete({ d, onOuvrir }) {
  const { titre, sous } = nommerVehicule(d);
  const etat = lireEtatEnvoi(d.etatNotification);
  return (
    <button
      type="button"
      onClick={() => onOuvrir(d, etat.cle === "aucune" || etat.cle === "a_valider" ? "Prévenir le client" : "Ouvrir le dossier")}
      className="w-full text-left flex items-baseline gap-2.5 py-2.5 border-t border-slate-200 first:border-t-0 hover:bg-slate-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-900 tabular-nums truncate">{titre}</span>
        <span className="block text-[12px] text-slate-500 truncate">{sous}</span>
      </span>
      {/* L'état de la notification, tel qu'il est — « inconnu » compris. */}
      <span className="shrink-0 text-[11.5px] font-medium" style={{ color: TONS[etat.ton] || TONS.neutre }}>
        {etat.court}
      </span>
    </button>
  );
}

// --- Le cadre du tableau de bord, reproduit pour juger dans le vrai contexte -

const NAV = [
  { label: "", items: [{ cle: "aujourdhui", nom: "Aujourd'hui", Icone: Home }] },
  { label: "Exploitation", items: [
    { cle: "agenda", nom: "Agenda", Icone: Calendar },
    { cle: "atelier", nom: "Atelier", Icone: Wrench },
    { cle: "ordres", nom: "Fiches atelier (OR)", Icone: ClipboardCheck },
    { cle: "inspections", nom: "Contrôle véhicule", Icone: ClipboardList },
  ] },
  { label: "Commerce", items: [
    { cle: "demandes", nom: "Demandes", Icone: Inbox },
    { cle: "clients", nom: "Clients", Icone: Users },
    { cle: "facturation", nom: "Facturation", Icone: ReceiptText },
  ] },
  { label: "Pilotage", items: [
    { cle: "statistiques", nom: "Statistiques", Icone: TrendingUp },
    { cle: "parametres", nom: "Paramètres", Icone: Settings },
  ] },
];

function CadreDashboard({ garage, onAller, children }) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F7F8FA" }}>
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col py-5 px-3" style={{ backgroundColor: NAVY }}>
        <div className="px-2 text-white">
          <div className="text-[15px] font-semibold leading-tight">Nexora</div>
          <div className="text-[11.5px]" style={{ color: "#8CA0C9" }}>Solutions</div>
        </div>
        <nav className="mt-7 flex flex-col gap-4">
          {NAV.map((g) => (
            <div key={g.label || "principal"}>
              {g.label && <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "#5C7099" }}>{g.label}</div>}
              {g.items.map(({ cle, nom, Icone }) => (
                <button
                  key={cle}
                  type="button"
                  onClick={() => cle !== "aujourdhui" && onAller(nom)}
                  className="w-full flex items-center gap-2.5 px-2.5 min-h-[38px] rounded-lg text-[13px] text-left"
                  style={cle === "aujourdhui" ? { backgroundColor: "rgba(255,255,255,0.12)", color: "white", fontWeight: 600 } : { color: "#B7C4DC" }}
                >
                  <Icone size={16} /> {nom}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-4 text-[12px] truncate" style={{ color: "#8CA0C9" }}>{garage.nom}</div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AujourdhuiPrototype() {
  const [scenarioCle, setScenarioCle] = useState("habituelle");
  const [toutesLesPriorites, setToutesLesPriorites] = useState(false);
  const [destination, setDestination] = useState(null);
  const [notesOuvertes, setNotesOuvertes] = useState(false);

  const scenario = SCENARIOS.find((s) => s.cle === scenarioCle) || SCENARIOS[2];
  const maintenant = MAINTENANT_PROTO;

  const dossiers = useMemo(
    () => scenario.dossiers.map((d) => ({
      ...d,
      fil: filVehicule({
        rdv: d.rdv, devis: d.devis, ordre: d.ordre, facture: d.facture,
        etatEnvoiDevis: d.etatEnvoiDevis, etatEnvoiFacture: d.etatEnvoiFacture,
      }),
    })),
    [scenario],
  );

  const lignes = useMemo(() => classerPriorites(dossiers, maintenant), [dossiers, maintenant]);
  const { visibles, total, masquees } = decouperPriorites(lignes, toutesLesPriorites ? lignes.length : LIMITE_PRIORITES);
  const arrivees = useMemo(() => arriveesDuJour(dossiers, maintenant), [dossiers, maintenant]);
  const pretes = useMemo(() => pretesARendre(dossiers), [dossiers]);
  const groupes = useMemo(() => regrouperOperationnel(dossiers.map((d) => d.rdv), maintenant), [dossiers, maintenant]);
  const { presentes, attendues } = useMemo(() => compterLeGarage(dossiers, maintenant), [dossiers, maintenant]);

  const journeeVide = presentes === 0 && attendues === 0;
  const nouveauGarage = journeeVide && !scenario.garage.aDesClients;

  // La phrase de situation : des faits, deux ou trois chiffres, pas un
  // paragraphe. « Au garage » ne compte QUE les voitures réellement présentes.
  const phrase = nouveauGarage
    ? "Votre garage est prêt. Il n'y a encore aucun client ni véhicule enregistré."
    : journeeVide
      ? "Rien de prévu aujourd'hui."
      : [
          presentes > 0 ? `${presentes} voiture${presentes > 1 ? "s" : ""} au garage` : null,
          attendues > 0 ? `${attendues} attendue${attendues > 1 ? "s" : ""}` : null,
        ].filter(Boolean).join(", ") + ". " + (
          total === 0
            ? "Rien n'attend de décision de votre part."
            : `${total} demande${total > 1 ? "nt" : ""} une décision de votre part.`
        );

  const ouvrir = (d, quoi) => setDestination({ d, quoi });

  const zonePriorites = (
    <Section
      titre="À faire maintenant"
      compte={total || null}
      action={masquees > 0 || toutesLesPriorites ? (
        <button type="button" onClick={() => setToutesLesPriorites((v) => !v)} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
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
  );

  const zoneSecondaire = (
    <>
      <Section
        titre="Arrivées attendues"
        compte={arrivees.length || null}
        enfants={
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1">
            {arrivees.length === 0 ? (
              <div className="py-3 text-[13px] text-slate-400">Aucune arrivée prévue aujourd'hui.</div>
            ) : (
              arrivees.map((d) => <LigneArrivee key={d.id} d={d} onOuvrir={(x) => ouvrir(x, "Ouvrir le dossier")} />)
            )}
          </div>
        }
      />
      <Section
        titre="Voitures prêtes"
        compte={pretes.length || null}
        enfants={
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1">
            {/* LA DISTINCTION QUI COMPTE : une arrivée a une heure, une
                restitution n'en a pas. Nexora ne porte aucune heure de
                restitution — on le dit, plutôt que d'afficher celle du matin
                en laissant croire à un rendez-vous. */}
            <div className="pt-2 pb-1 text-[11.5px] text-slate-400">
              Aucune heure de restitution n'est prévue dans Nexora.
            </div>
            {pretes.length === 0 ? (
              <div className="pb-3 text-[13px] text-slate-400">Aucune voiture prête.</div>
            ) : (
              <div className="pb-1">{pretes.map((d) => <LignePrete key={d.id} d={d} onOuvrir={ouvrir} />)}</div>
            )}
          </div>
        }
      />
      {/* ARGENT À RISQUE — une ligne, parce qu'il n'a nulle part où aller
          VÉRIFIÉ dans le code : cette zone est bâtie sur `travaux_differes` et
          sur les clients fidèles dormants, et AUCUN autre écran ne les montre.
          `onOuvrirTravailDiffereModal` n'est passé qu'à l'écran Aujourd'hui.
          La retirer d'ici ne la déplacerait pas : elle la supprimerait. Elle
          reste donc, réduite à une ligne — le montant sans le pavé. */}
      <Section
        titre="Argent à risque"
        enfants={
          <button
            type="button"
            onClick={() => ouvrir(null, "Argent à risque · travaux différés")}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 min-h-[44px] flex items-center justify-between hover:bg-slate-50"
          >
            <span className="text-[13px] text-slate-600">Travaux différés à relancer</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[14px] font-semibold tabular-nums text-slate-900">{scenario.garage.aDesClients ? "2" : "0"}</span>
              <ChevronRight size={14} className="text-slate-300" />
            </span>
          </button>
        }
      />

      <Section
        titre="Atelier"
        action={
          <button type="button" onClick={() => ouvrir(null, "Atelier")} className="text-[12.5px] font-semibold" style={{ color: ACCENT }}>
            Ouvrir
          </button>
        }
        enfants={
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {GROUPES_ATELIER.map((g) => {
              const n = groupes.find((x) => x.key === g.key)?.rendezVous.length ?? 0;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => ouvrir(null, `Atelier · ${g.label}`)}
                  className="w-full min-h-[40px] px-3.5 flex items-center justify-between hover:bg-slate-50"
                >
                  <span className="text-[13px] text-slate-600">{g.label}</span>
                  <span className="text-[14px] font-semibold tabular-nums text-slate-900">{n}</span>
                </button>
              );
            })}
          </div>
        }
      />
    </>
  );

  return (
    <CadreDashboard garage={scenario.garage} onAller={(nom) => ouvrir(null, nom)}>
      {/* ─── OUTIL DE REVUE — n'appartient pas à l'interface du garage ─── */}
      <div className="px-4 sm:px-6 py-2 text-white text-[12px] flex items-center gap-2 flex-wrap" style={{ backgroundColor: "#3B0764" }}>
        <FlaskConical size={14} />
        <span className="font-semibold">Outil de revue</span>
        <span className="opacity-70 hidden sm:inline">prototype, données fictives — cette barre n'existe pas dans le produit</span>
        <span className="ml-auto flex items-center gap-1 flex-wrap">
          {SCENARIOS.map((s) => (
            <button
              key={s.cle}
              type="button"
              onClick={() => { setScenarioCle(s.cle); setToutesLesPriorites(false); setDestination(null); }}
              className="min-h-[32px] px-2.5 rounded-md text-[12px] font-medium"
              style={s.cle === scenarioCle ? { backgroundColor: "white", color: "#3B0764" } : { backgroundColor: "rgba(255,255,255,0.14)" }}
            >
              {s.titre}
            </button>
          ))}
        </span>
      </div>

      {/* ─── À partir d'ici : l'écran tel que le garage le verrait ─── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold text-slate-900 leading-tight">Aujourd'hui</h1>
            <div className="text-[12.5px] text-slate-500 capitalize">{dateLongue(maintenant)}</div>
          </div>
          <div className="order-last w-full sm:order-none sm:w-auto sm:ml-auto sm:max-w-[400px] sm:flex-1">
            <button
              type="button"
              onClick={() => ouvrir(null, "Recherche globale")}
              className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 h-10 text-left"
            >
              <Search size={16} className="shrink-0 text-slate-400" />
              <span className="text-[13.5px] text-slate-400 truncate">Plaque, client, téléphone, n° de facture…</span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-4">
        <p className="text-[14px] text-slate-700 max-w-[70ch]">{phrase}</p>

        {nouveauGarage ? (
          // NOUVEAU GARAGE — il n'a rien. On l'aide à entrer ses clients, par
          // les deux chemins qui existent déjà.
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-8 max-w-[640px]">
            <div className="text-[15px] font-semibold text-slate-900">Commencez par vos clients</div>
            <p className="mt-1 text-[13px] text-slate-500">
              Ajoutez-les un par un, ou importez votre fichier existant. Les rendez-vous du jour
              apparaîtront ensuite ici avec ce qu'il y a à faire.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => ouvrir(null, "Clients · nouveau client")}
                className="min-h-[44px] px-4 rounded-lg text-[13.5px] font-semibold text-white inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: ACCENT }}
              >
                <UserPlus size={15} /> Ajouter un client
              </button>
              <button
                type="button"
                onClick={() => ouvrir(null, "Paramètres · import de clients")}
                className="min-h-[44px] px-4 rounded-lg border border-slate-200 text-[13.5px] font-semibold text-slate-700 inline-flex items-center justify-center gap-2"
              >
                <Upload size={15} /> Importer mon fichier
              </button>
            </div>
            {!scenario.garage.horairesRenseignes && (
              <p className="mt-5 text-[12.5px] text-slate-400">
                Vos horaires ne sont pas renseignés : l'agenda proposera des créneaux les jours de fermeture.{" "}
                <button type="button" onClick={() => ouvrir(null, "Paramètres · horaires")} className="underline font-medium text-slate-500">
                  Les renseigner
                </button>
              </p>
            )}
          </div>
        ) : journeeVide ? (
          // GARAGE ACTIF, JOURNÉE VIDE — il a une histoire. Lui parler de sa
          // « première voiture » serait absurde.
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-5 py-8 max-w-[640px]">
            <Calendar size={22} className="text-slate-300" />
            <div className="mt-2 text-[15px] font-semibold text-slate-900">Rien de prévu aujourd'hui</div>
            <p className="mt-1 text-[13px] text-slate-500">
              Aucune voiture attendue, aucune à l'atelier. Les rendez-vous des prochains jours sont dans l'Agenda.
            </p>
            <button
              type="button"
              onClick={() => ouvrir(null, "Agenda")}
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] rounded-lg px-4 text-[13.5px] font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Ouvrir l'agenda <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          // DEUX COLONNES sur grand écran : les décisions à gauche, sur la
          // largeur utile ; le contexte à droite, plus étroit. Une seule
          // colonne sur téléphone, les priorités d'abord.
          <div className="mt-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-x-6">
            <div className="min-w-0">{zonePriorites}</div>
            <div className="min-w-0">{zoneSecondaire}</div>
          </div>
        )}

        {!nouveauGarage && !journeeVide && !scenario.garage.configurationComplete && (
          // Garage déjà actif : la configuration incomplète est une ligne de
          // bas de page, pas une carte de progression en tête d'écran.
          <p className="mt-6 text-[12.5px] text-slate-400">
            Votre configuration n'est pas terminée.{" "}
            <button type="button" onClick={() => ouvrir(null, "Paramètres")} className="underline font-medium text-slate-500">
              La compléter
            </button>
          </p>
        )}

        {/* ─── OUTIL DE REVUE — replié par défaut ─── */}
        <div className="mt-10 rounded-xl border border-dashed px-4 py-3 text-[12px]" style={{ borderColor: "#C4B5FD", color: "#5B21B6" }}>
          <button type="button" onClick={() => setNotesOuvertes((v) => !v)} className="font-semibold flex items-center gap-1.5">
            <FlaskConical size={13} /> Notes de conception {notesOuvertes ? "▾" : "▸"}
          </button>
          {notesOuvertes && (
            <ul className="mt-2 space-y-1 text-slate-600">
              <li><b>« Bonjour {"{"}garage{"}"} » et les quatre cartes de compteurs</b> → le résumé Atelier, colonne de droite.</li>
              <li><b>Les raccourcis</b> (Agenda, Clients, Facturation…) → la barre latérale, à gauche. Vérifié : les neuf entrées de <code>navGroups</code> y sont déjà, toutes cliquables.</li>
              <li><b>Les explications sur les envois</b> → l'écran d'envoi. Vérifié : <code>EnvoiDocument</code> affiche <code>etat.titre</code> et <code>etat.detail</code> au moment où l'on envoie. Ici ne reste que l'état réel de chaque notification, en un mot.</li>
              <li><b>Les indicateurs financiers</b> (chiffre d'affaires du mois, évolution, panier moyen, CA par prestation) → <b>Statistiques</b>. Vérifié dans le code : <code>StatistiquesView</code> les calcule bien.</li>
              <li><b>« Argent à risque »</b> → <b>reste ici</b>, réduit à une ligne. Vérifié : il est bâti sur <code>travaux_differes</code> et les clients dormants, et <b>aucun autre écran ne les montre</b>. Le retirer ne le déplacerait pas, il le supprimerait. <b>Décision à prendre</b> : lui faire un écran, ou le garder ici.</li>
              <li><b>La carte « Mettez votre garage en route »</b> → une ligne discrète en bas, qui nomme ce qu'elle débloque.</li>
            </ul>
          )}
        </div>
      </div>

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
    </CadreDashboard>
  );
}
