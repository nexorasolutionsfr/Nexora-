"use client";

// « Ce que Nexora sait de cette voiture » — la connaissance, pas les échéances.
//
// Les échéances (contrôle technique, révision) restent au-dessus, dans leurs
// cartes : elles répondent « quoi faire, pour quand ». Cette section répond à
// la question d'avant — « qu'est-ce qui s'applique à ma voiture, d'où ça sort,
// et qu'est-ce que Nexora ne sait pas ? ».
//
// Quatre principes d'affichage :
// - ce qui est établi passe devant ; une carte « non publié » ne domine
//   jamais l'écran, elle finit la section ;
// - chaque carte porte un état visible : une information absente se dit, elle
//   ne disparaît pas ;
// - la source se déplie, elle n'envahit pas ;
// - un manque se présente avec le geste qui le comble, jamais tout seul.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  Leaf,
  LoaderCircle,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { connaissancesDe, nombreFichesAVerifier, referenceDe } from "@/lib/auto/connaissance/moteur";
import { SOURCES } from "@/lib/auto/connaissance/sources";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { boutonLien, boutonPrincipal, carte } from "./elements";
import { formaterDate, formaterKm } from "./format";

const ICONES = { securite: ShieldAlert, environnement: Leaf, entretien: Wrench, obligation: CircleCheck };

const ETATS = {
  a_verifier: { libelle: "À vérifier", classe: "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" },
  applicable: { libelle: "Publié par le constructeur", classe: "border-primary/30 bg-secondary/60 text-foreground" },
  a_preciser: { libelle: "Repère de marque", classe: "border-border bg-muted text-foreground" },
  donnees_insuffisantes: { libelle: "À compléter", classe: "border-border bg-muted text-foreground" },
  indisponible: { libelle: "Non trouvé", classe: "border-border bg-muted text-muted-foreground" },
  non_applicable: { libelle: "Aucune fiche", classe: "border-border bg-muted text-muted-foreground" },
  source_a_relire: { libelle: "Source à relire", classe: "border-border bg-muted text-muted-foreground" },
};

// « Publié par le constructeur » convient à un programme d'entretien, pas à
// une classe Crit'Air. Chaque carte dit donc ce que SON état signifie chez elle.
const LIBELLES_PAR_CARTE = {
  critair: { applicable: "Établi" },
  campagnes_rappel: { non_applicable: "Aucune fiche" },
};

function Etiquette({ carteCle, etat, estimation = false }) {
  const e = ETATS[etat] ?? ETATS.non_applicable;
  // Une estimation ne porte jamais l'étiquette d'un fait établi.
  const libelle = estimation ? "Estimation" : (LIBELLES_PAR_CARTE[carteCle]?.[etat] ?? e.libelle);
  const classe = estimation ? ETATS.donnees_insuffisantes.classe : e.classe;
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-medium ${classe}`}>{libelle}</span>;
}

function Provenance({ connaissance }) {
  const reference = referenceDe(connaissance);
  const limites = connaissance.limites ?? [];
  if (!reference && limites.length === 0) return null;
  return (
    <details className="mt-3 border-t border-border pt-2.5">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground underline underline-offset-2">D'où vient cette information ?</summary>
      <div className="mt-2 space-y-2 text-[13px] leading-snug text-muted-foreground">
        {reference ? (
          <p>
            {reference.titre} — {reference.editeur}
            {reference.version ? ` (${reference.version})` : ""}.{" "}
            <a href={reference.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
              Consulter la source
            </a>
            . Relue le {formaterDate(reference.verifieLe)}.
          </p>
        ) : null}
        {limites.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4">
            {limites.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

// Un manque empêche de répondre, et se comble par un geste. Une réserve dit
// ce qui pourrait fausser une réponse déjà donnée, et n'appelle aucun geste
// dans Nexora — elle renvoie ailleurs. Les deux se ressemblent à l'écran,
// mais ne demandent pas la même chose à la personne.
function Demandes({ items, onAction, ton = "manque" }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-2">
      {items.map((m) => (
        <li key={m.cle} className={`rounded-xl border px-3 py-2.5 ${ton === "reserve" ? "border-dashed border-border" : "border-border bg-muted/60"}`}>
          <p className="text-[15px] font-medium text-foreground">{m.libelle}</p>
          {m.pourquoi ? <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{m.pourquoi}</p> : null}
          {m.geste && m.action && onAction ? (
            <button type="button" onClick={() => onAction(m.action)} className={`${boutonLien} -ml-2 mt-1`}>
              {m.geste}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Alternatives({ alternatives }) {
  if (!alternatives || alternatives.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-1.5">
      {alternatives.map((a) => (
        <li key={a.carburant} className="flex items-baseline gap-2 text-[15px] text-foreground">
          <span className="text-muted-foreground">{a.carburant === "essence" ? "Si essence :" : "Si gazole :"}</span>
          <span className="font-semibold">{a.libelle}</span>
        </li>
      ))}
    </ul>
  );
}

const FONDEMENTS_CRITAIR = {
  norme_euro: "d'après la norme Euro de votre carte grise",
  date_premiere_immatriculation: "d'après la date de première immatriculation, faute de connaître la norme Euro",
  energie: "d'après son énergie",
};

function ClasseCritair({ valeur }) {
  if (!valeur) return null;
  return (
    <div className="mt-2">
      <p className="text-[15px] text-foreground">
        <span className="font-display text-xl font-bold">{valeur.libelle}</span>
        {valeur.couleur ? <span className="text-muted-foreground"> · vignette {valeur.couleur}</span> : null}
      </p>
      {valeur.fondement ? <p className="text-[13px] text-muted-foreground">Classée {FONDEMENTS_CRITAIR[valeur.fondement]}.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

function intervalleLisible({ mois, km } = {}) {
  const parts = [];
  if (mois) parts.push(mois % 12 === 0 ? `${mois / 12} an${mois > 12 ? "s" : ""}` : `${mois} mois`);
  if (km) parts.push(formaterKm(km));
  return parts.join(" ou ");
}

// Une opération publiée pour un modèle n'est pas forcément applicable à CETTE
// voiture. Celles dont la condition porte sur l'applicabilité le disent en
// toutes lettres, à leur ligne — une réserve générale en bas de carte ne
// suffirait pas à les couvrir.
const DEPARTS_COURTS = {
  derniere_operation: "à partir de la dernière fois",
  derniere_operation_ou_controle: "à partir de la dernière fois, ou d'un contrôle d'usure",
};

function Operation({ operation }) {
  const aVerifier = operation.condition?.nature === "applicabilite";
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[15px] text-foreground">{operation.libelle}</span>
        <span className="shrink-0 text-[14px] font-semibold text-foreground">{intervalleLisible(operation.intervalle)}</span>
      </div>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {DEPARTS_COURTS[operation.depuis] ?? "point de départ non précisé"}
        {aVerifier ? (
          <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            à vérifier pour votre voiture
          </span>
        ) : null}
      </p>
      {operation.condition ? <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{operation.condition.texte}</p> : null}
    </li>
  );
}

function Programme({ valeur }) {
  if (valeur?.niveau !== "programme") return null;
  return (
    <>
      <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {valeur.operations.map((o) => (
          <Operation key={o.libelle} operation={o} />
        ))}
      </ul>
      {valeur.portee ? <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{valeur.portee}</p> : null}
    </>
  );
}

// La phrase qui sépare un programme publié d'un calendrier personnel. Elle
// reste visible : repliée, elle ne protégerait personne.
function Avertissement({ texte }) {
  if (!texte) return null;
  return <p className="mt-2.5 rounded-xl border border-dashed border-border px-3 py-2 text-[14px] leading-snug text-foreground">{texte}</p>;
}

// ---------------------------------------------------------------------------
// Campagnes de rappel
// ---------------------------------------------------------------------------

// Une fiche officielle nomme souvent une dizaine de modèles d'un coup et
// décrit le défaut en un paragraphe. Tout afficher ferait un mur de texte là
// où l'on cherche une réponse : on montre de quoi reconnaître sa voiture et
// juger de la gravité, le reste est sur la fiche officielle.
const LONGUEUR_MODELES = 90;
const LONGUEUR_MOTIF = 150;

// Les fiches officielles sont publiées tout en minuscules dans ce jeu de
// données. On remet la majuscule initiale — c'est de la typographie, pas une
// réécriture : aucun mot n'est changé, et le lien mène à l'original.
function majusculeInitiale(texte) {
  return typeof texte === "string" && texte.length > 0 ? texte[0].toUpperCase() + texte.slice(1) : "";
}

function couper(texte, longueur) {
  if (typeof texte !== "string") return "";
  const propre = texte.trim();
  if (propre.length <= longueur) return propre;
  const coupe = propre.slice(0, longueur);
  return `${coupe.slice(0, coupe.lastIndexOf(" ") > 40 ? coupe.lastIndexOf(" ") : longueur)}…`;
}

const MARQUEURS = {
  generation: (f) => `nomme la génération ${f.generation ?? "indiquée"}`,
  voisine: () => "nomme une version voisine",
};

function Campagne({ fiche }) {
  const marqueur = MARQUEURS[fiche.correspondance]?.(fiche) ?? null;
  return (
    <li className="rounded-xl border border-border bg-muted/50 px-3 py-2.5">
      <p className="text-[13px] text-muted-foreground">
        {fiche.publiee_le ? formaterDate(fiche.publiee_le) : "Date de publication inconnue"}
        {fiche.periode ? ` · fabriquées ${formaterDate(fiche.periode.debut)} → ${formaterDate(fiche.periode.fin)}` : " · période non précisée"}
        {marqueur ? ` · ${marqueur}` : ""}
      </p>
      {fiche.modeles ? <p className="mt-1 text-[15px] font-medium leading-snug text-foreground">{majusculeInitiale(couper(fiche.modeles, LONGUEUR_MODELES))}</p> : null}
      {fiche.motif ? <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{majusculeInitiale(couper(fiche.motif, LONGUEUR_MOTIF))}</p> : null}
      {fiche.lien ? (
        <a href={fiche.lien} target="_blank" rel="noreferrer noopener" className={`${boutonLien} -ml-2 mt-1`}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Lire la fiche officielle
        </a>
      ) : null}
    </li>
  );
}

// Trois fiches visibles : de quoi voir qu'il y a quelque chose sans noyer
// l'écran. Les autres sont à un clic, et rien n'est supprimé.
const VISIBLES = 3;

function Liste({ fiches, libelleDeplier }) {
  const [tout, setTout] = useState(false);
  if (fiches.length === 0) return null;
  const montrees = tout ? fiches : fiches.slice(0, VISIBLES);
  const reste = fiches.length - montrees.length;
  return (
    <>
      <ul className="mt-2.5 space-y-2">
        {montrees.map((f) => (
          <Campagne key={f.id} fiche={f} />
        ))}
      </ul>
      {reste > 0 || tout ? (
        <button type="button" onClick={() => setTout((v) => !v)} className={`${boutonLien} -ml-2 mt-1`}>
          {tout ? "Réduire la liste" : `${libelleDeplier} (${reste})`}
        </button>
      ) : null}
    </>
  );
}

// Trois groupes, et un seul au premier plan.
//
// Les fiches qui nomment le modèle passent devant ; celles qui nomment une
// version voisine, et celles dont la période de fabrication exclut la voiture,
// se déplient. Trier par date seule mettait une « Corsa F, Corsa E » devant
// deux fiches nommant « Corsa », et laissait le tri au conducteur.
function Campagnes({ valeur }) {
  const [voirVoisines, setVoirVoisines] = useState(false);
  const [voirEcartees, setVoirEcartees] = useState(false);
  if (!valeur) return null;

  return (
    <>
      {valeur.principales.length > 0 ? (
        <>
          <p className="mt-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fiches qui nomment votre modèle</p>
          <Liste fiches={valeur.principales} libelleDeplier="Voir les autres fiches" />
        </>
      ) : null}

      {valeur.voisines.length > 0 ? (
        <>
          <button type="button" onClick={() => setVoirVoisines((v) => !v)} className={`${boutonLien} -ml-2 mt-2`}>
            {voirVoisines
              ? "Masquer les versions voisines"
              : `Voir ${valeur.voisines.length} fiche${valeur.voisines.length > 1 ? "s" : ""} qui nomme${valeur.voisines.length > 1 ? "nt" : ""} une version voisine`}
          </button>
          {voirVoisines ? <Liste fiches={valeur.voisines} libelleDeplier="Voir les autres" /> : null}
        </>
      ) : null}

      {valeur.ecartees.length > 0 ? (
        <>
          <button type="button" onClick={() => setVoirEcartees((v) => !v)} className={`${boutonLien} -ml-2 mt-2`}>
            {voirEcartees
              ? "Masquer les fiches hors période de fabrication"
              : `Voir ${valeur.ecartees.length} fiche${valeur.ecartees.length > 1 ? "s" : ""} dont la période de fabrication exclut votre voiture`}
          </button>
          {voirEcartees ? <Liste fiches={valeur.ecartees} libelleDeplier="Voir les autres" /> : null}
        </>
      ) : null}
    </>
  );
}

// Le geste qui tranche vraiment. Il vaut autant quand des fiches existent que
// quand il n'y en a aucune : dans les deux cas, Nexora ne peut pas répondre
// pour CETTE voiture.
function Verification({ verification }) {
  if (!verification) return null;
  const { lien } = verification;
  return (
    <div className="mt-3 rounded-xl border border-border px-3 py-3">
      <p className="text-[15px] font-semibold text-foreground">{verification.titre}</p>
      <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{verification.texte}</p>
      {lien?.principal ? (
        <a href={lien.url} target="_blank" rel="noreferrer noopener" className={`${boutonPrincipal} mt-2.5`}>
          <ExternalLink className="size-5" aria-hidden="true" />
          {lien.libelle}
        </a>
      ) : lien ? (
        <a href={lien.url} target="_blank" rel="noreferrer noopener" className={`${boutonLien} -ml-2 mt-1`}>
          <ExternalLink className="size-4" aria-hidden="true" />
          {lien.libelle}
        </a>
      ) : null}
      {verification.note ? <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{verification.note}</p> : null}
    </div>
  );
}

// Les campagnes de rappel : lues par le serveur, qui n'envoie à la base
// officielle qu'une marque et un modèle. Aucune plaque, aucune date.
//
// L'état de chargement se DÉDUIT de la réponse reçue plutôt que d'être posé
// dans l'effet : une voiture dont la marque change repasse en recherche sans
// qu'un `setState` synchrone ne relance un rendu.
const VIDE = { etat: "lues", fiches: [], total: 0, tronque: false };

function useCampagnes(marque, modele) {
  const [reponse, setReponse] = useState(null);
  const cle = marque && modele ? `${marque}|${modele}` : "";

  useEffect(() => {
    if (!cle) return undefined;
    let vivant = true;
    const parametres = new URLSearchParams({ marque, modele });
    fetch(`/api/auto/campagnes?${parametres}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { etat: "indisponible", raison: `statut_${r.status}` }))
      .catch(() => ({ etat: "indisponible", raison: "injoignable" }))
      .then((campagnes) => {
        if (vivant) setReponse({ cle, campagnes });
      });
    return () => {
      vivant = false;
    };
  }, [cle, marque, modele]);

  if (!cle) return { chargement: false, campagnes: VIDE };
  if (reponse?.cle === cle) return { chargement: false, campagnes: reponse.campagnes };
  return { chargement: true, campagnes: null };
}

export default function ConnaissanceVoiture({ vehicule, onAction = null }) {
  const { chargement, campagnes } = useCampagnes(vehicule?.marque, vehicule?.modele);
  if (!vehicule) return null;

  const { connaissances } = connaissancesDe({ vehicule, campagnes, aujourdhui: aujourdhuiIso() });

  return (
    <section id="connaissance" className="mt-7 scroll-mt-28">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ce que Nexora sait de cette voiture</h2>
      <div className="space-y-3">
        {connaissances.map((c) => {
          const Icone = ICONES[c.categorie] ?? CircleHelp;
          const enRecherche = chargement && c.cle === "campagnes_rappel";
          return (
            <article key={c.cle} className={carte}>
              <div className="flex items-start gap-2.5">
                <Icone
                  className={`mt-0.5 size-5 shrink-0 ${c.etat === "a_verifier" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <h3 className="font-semibold text-foreground">{c.titre}</h3>
                    {enRecherche ? null : <Etiquette carteCle={c.cle} etat={c.etat} estimation={Boolean(c.valeur?.estimation)} />}
                  </div>

                  {enRecherche ? (
                    <p className="mt-1 flex items-center gap-2 text-[15px] text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Recherche dans la base officielle…
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-[15px] leading-snug text-foreground">{c.resume}</p>
                      {c.cle === "critair" ? <ClasseCritair valeur={c.valeur} /> : null}
                      {c.cle === "critair" ? <Alternatives alternatives={c.alternatives} /> : null}
                      {c.cle === "programme_entretien" ? <Programme valeur={c.valeur} /> : null}
                      <Avertissement texte={c.avertissement} />
                      {c.cle === "campagnes_rappel" ? <Campagnes valeur={c.valeur} /> : null}
                      <Demandes items={c.manques} onAction={onAction} />
                      <Verification verification={c.verification} />
                      {(c.liens ?? []).map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className={`${boutonLien} -ml-2 mr-3 mt-1`}>
                          <ExternalLink className="size-4" aria-hidden="true" />
                          {l.libelle}
                        </a>
                      ))}
                      <Provenance connaissance={c} />
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        {SOURCES["rappelconso-v2"].mention}. Nexora n'invente aucune préconisation : ce qu'elle ne peut pas établir, elle le dit.
      </p>
    </section>
  );
}

// Une ligne sur l'accueil, et seulement quand il y a vraiment quelque chose.
//
// Elle ne prend jamais la place de l'action principale, qui est réservée à ce
// qui a une date. Un rappel de sécurité n'a pas de date : il a une urgence.
// Pendant la recherche, en cas de panne de la base ou quand rien ne nomme la
// voiture, cette ligne n'existe pas — un accueil ne se remplit pas pour se
// remplir.
export function SignalCampagnes({ vehicule }) {
  const { chargement, campagnes } = useCampagnes(vehicule?.marque, vehicule?.modele);
  if (!vehicule || chargement) return null;

  const { connaissances } = connaissancesDe({ vehicule, campagnes, aujourdhui: aujourdhuiIso() });
  const nombre = nombreFichesAVerifier(connaissances);
  if (nombre === 0) return null;

  return (
    <Link href={`/auto/vehicules/${vehicule.id}#connaissance`} className={`${carte} mb-3 flex items-start gap-2.5 transition hover:border-amber-500/50`}>
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">
          {nombre} fiche{nombre > 1 ? "s" : ""} de rappel nomme{nombre > 1 ? "nt" : ""} votre modèle
        </span>
        <span className="block text-sm text-muted-foreground">Publiées par la DGCCRF. Se vérifie avec le numéro de série de votre voiture.</span>
      </span>
      <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
