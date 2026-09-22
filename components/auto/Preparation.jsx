"use client";

// Ce qu'on emporte chez un professionnel — l'écran.
//
// Il répond au reproche le plus net de la recette réelle : une voiture non
// couverte ne recevait qu'une liste de ce qui lui manque, et les trois sorties
// proposées réclamaient toutes une information que son propriétaire n'a pas.
//
// Ici, rien n'est demandé. Tout est repris : la voiture est résumée avec ce
// que Nexora sait déjà, et ce qu'elle ignore devient la liste des questions à
// poser. Le résumé se copie — c'est la façon dont il sert vraiment, mesurée
// sur le parcours « J'ai un problème » depuis le 18 septembre.
//
// Aucun diagnostic, aucune pièce nommée, aucun prix, aucun créneau : la
// logique vit dans lib/auto/preparation.js, qui ne produit que des questions.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, HelpCircle } from "lucide-react";

import { aujourdhuiIso, prochainControleTechnique } from "@/lib/auto/echeances";
import { estimerKilometrage } from "@/lib/auto/kilometrage";
import { preparerLaVisite } from "@/lib/auto/preparation";
import { programmePour } from "@/lib/auto/connaissance/moteur";
import { MANQUES } from "@/lib/auto/entretien";
import { BoutonCopier, boutonPrincipal, boutonSecondaire, carte, puce, puceEtat } from "@/components/auto/elements";
import { ENERGIES, formaterDate, formaterKm, libelleDe } from "@/components/auto/format";

// Les motifs d'une visite, dits comme on les dit. Aucun n'est une panne
// nommée ni une pièce : ce sont des raisons de prendre rendez-vous.
const MOTIFS = [
  { code: "revision", libelle: "Une révision", phrase: "Je viens pour une révision." },
  { code: "controle", libelle: "Préparer le contrôle technique", phrase: "Je viens préparer le contrôle technique." },
  { code: "bruit", libelle: "Quelque chose d'inhabituel", phrase: "Je viens faire regarder quelque chose d'inhabituel." },
  { code: "devis", libelle: "Un devis", phrase: "Je viens pour un devis." },
];

const formateurs = {
  date: (d) => formaterDate(d),
  km: (n) => formaterKm(n),
  energie: (e) => libelleDe(ENERGIES, e),
};

export default function Preparation({ vehicule, intention = "entretenir", demandeInitiale = null }) {
  const [motif, setMotif] = useState("");
  const [voirPourquoi, setVoirPourquoi] = useState(false);
  const texteRef = useRef(null);

  const demandeChoisie = demandeInitiale ?? MOTIFS.find((m) => m.code === motif)?.phrase ?? null;

  // Tout se recalcule depuis le dossier : rien n'est stocké, rien n'est
  // redemandé. Changer une information ailleurs suffit à mettre ceci à jour.
  const preparation = useMemo(() => {
    if (!vehicule) return null;
    const jour = aujourdhuiIso();
    return preparerLaVisite({
      vehicule,
      intention,
      demande: demandeChoisie,
      programmeConnu: Boolean(programmePour(vehicule)),
      kilometrage: estimerKilometrage({ releves: vehicule.releves ?? [], historique: vehicule.historique ?? [], aujourdhui: jour }),
      controle: prochainControleTechnique({ dateMiseEnCirculation: vehicule.date_mise_en_circulation, historique: vehicule.historique ?? [], aujourdhui: jour }),
      formateurs,
    });
  }, [vehicule, intention, demandeChoisie]);

  if (!preparation || preparation.etat !== "prete") return null;
  const { identite, points, texte, explication } = preparation;

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[15px] leading-snug text-foreground">{explication}</p>

      {/* La seule question posée, et seulement quand elle change le texte. */}
      {intention === "rendez_vous" && !demandeInitiale ? (
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-foreground">Pour quoi venez-vous ? (facultatif)</legend>
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => setMotif((v) => (v === m.code ? "" : m.code))}
                aria-pressed={motif === m.code}
                className={`${puce} ${puceEtat(motif === m.code)}`}
              >
                {m.libelle}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <section aria-labelledby="titre-a-emporter" className={`${carte} bg-muted/40`}>
        <h2 id="titre-a-emporter" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />À emporter
        </h2>

        {/* Le même nœud que celui qu'on copie : si le presse-papiers est
            refusé, c'est exactement ce texte qui est sélectionné. */}
        <div ref={texteRef} className="mt-2 space-y-3">
          <dl className="space-y-0.5">
            {identite.map((l) => (
              <div key={l.cle} className="flex flex-wrap gap-x-1.5 text-[15px] leading-snug">
                <dt className="text-muted-foreground">{l.libelle} :</dt>
                <dd className="font-medium text-foreground">
                  {l.valeur}
                  {l.precision ? <span className="font-normal text-muted-foreground"> ({l.precision})</span> : null}
                </dd>
              </div>
            ))}
          </dl>

          {demandeChoisie ? <p className="text-[15px] leading-snug text-foreground">{demandeChoisie}</p> : null}

          {points.length > 0 ? (
            <div>
              <p className="text-[15px] font-medium text-foreground">Ce que je voudrais savoir :</p>
              <ul className="mt-1 space-y-1.5">
                {points.map((p) => (
                  <li key={p.cle} className="flex items-start gap-2 text-[15px] leading-snug text-foreground">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <span className="min-w-0">{p.texte}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-3">
          <BoutonCopier texte={texte} cibleRef={texteRef} libelle="Copier pour l'emporter" />
        </div>
      </section>

      {/* Pourquoi ces questions-là : utile une fois, encombrant ensuite. */}
      {points.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setVoirPourquoi((v) => !v)}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:underline"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
            {voirPourquoi ? "Masquer" : "Pourquoi ces questions ?"}
          </button>
          {voirPourquoi ? (
            <ul className="mt-1 space-y-2">
              {points.map((p) => (
                <li key={p.cle} className="text-[13px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">{p.texte}</span> {p.pourquoi}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Retour vehicule={vehicule} aRapporter={preparation.aRapporter} voirProgramme={preparation.voirProgramme} />
    </div>
  );
}

// La suite disponible, et le retour à la voiture. Deux choses, pas dix.
//
// « Ce que je rapporte » n'est pas décoratif : sans ce geste, la visite
// servirait une fois et Nexora resterait aussi ignorante qu'avant.
function Retour({ vehicule, aRapporter = [], voirProgramme = false }) {
  const premier = aRapporter[0];
  const geste = premier ? Object.values(MANQUES).find((m) => m.action === premier) : null;

  return (
    <div className="space-y-2">
      {/* Annoncer qu'un programme est publié sans y mener, ce serait promettre
          une aide et la garder. Quand il existe, il passe devant le reste. */}
      {voirProgramme ? (
        <Link href={`/auto/vehicules/${vehicule.id}#connaissance`} className={boutonPrincipal}>
          <BookOpen className="size-5" aria-hidden="true" />
          Voir le programme publié pour ce modèle
        </Link>
      ) : null}
      {geste ? (
        <Link href={`/auto/vehicules/${vehicule.id}?action=${premier}`} className={voirProgramme ? boutonSecondaire : boutonPrincipal}>
          {geste.geste}
        </Link>
      ) : null}
      <Link href={`/auto/vehicules/${vehicule.id}`} className={geste || voirProgramme ? boutonSecondaire : boutonPrincipal}>
        <ArrowRight className="size-5" aria-hidden="true" />
        Revenir à {vehicule.marque} {vehicule.modele}
      </Link>
      {geste ? (
        <>
          {/* Le justificatif reste offert, en dessous et en petit : c'est un
              raccourci quand on l'a sous la main, jamais le péage d'entrée. */}
          <Link
            href={`/auto/factures/nouvelle?vehicule=${vehicule.id}`}
            className="flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            Ou ajouter une facture, si vous en avez une
          </Link>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Quand vous aurez la réponse, enregistrez-la : Nexora calculera vos échéances toute seule ensuite.
          </p>
        </>
      ) : null}
    </div>
  );
}
