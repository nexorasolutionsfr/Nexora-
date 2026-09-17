"use client";

// « Aujourd'hui » : la voiture consultée, la prochaine action, et trois gestes
// utiles. Rien d'autre.
//
// Ce que cet écran ne fait jamais : rassurer sur la santé de la voiture.
// Nexora ne connaît que ce qui est enregistré ; l'absence d'alerte ne veut pas
// dire que tout va bien. Quand rien n'est calculable, l'écran dit ce qui
// manque et comment le compléter.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, CircleAlert, FileText, Gauge, Plus, ReceiptText, Wrench } from "lucide-react";

import { aujourdhuiIso, dernierKilometrage } from "@/lib/auto/echeances";
import { choisirVoiture, etatAujourdhui } from "@/lib/auto/aujourdhui";
import { FONDEMENTS, construireAPrevoir, pastilleElement } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import { VoitureAAjouter } from "@/components/auto/MonGarage";
import {
  Alerte,
  Chargement,
  PageAuto,
  Pastille,
  Plaque,
  boutonPrincipal,
  carte,
  carteListe,
  iconeLigne,
  memoriserVoitureCourante,
  puce,
  puceEtat,
  voitureCourante,
} from "@/components/auto/elements";
import { formaterKm } from "@/components/auto/format";

// La session vient de l'accueil, qui l'a déjà lue pour choisir entre la page
// de présentation et cet écran.
export default function Aujourdhui({ session }) {
  return (
    <PageAuto session={session}>
      {session === undefined ? <Chargement /> : <MaJournee />}
    </PageAuto>
  );
}

function MaJournee() {
  const [dossiers, setDossiers] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [choisie, setChoisie] = useState(null);

  const charger = useCallback(async () => {
    setErreur(false);
    const lu = await chargerDossiers();
    if (lu.erreur) {
      setErreur(true);
      return;
    }
    setDossiers(lu);
    // La voiture consultée la dernière fois, sinon la principale.
    setChoisie((actuelle) => actuelle ?? choisirVoiture(lu.vehicules, voitureCourante())?.id ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du dossier au montage, puis réponse Supabase ; `charger` sert aussi au bouton « Recharger ».
    charger();
  }, [charger]);

  if (erreur)
    return (
      <Alerte
        action={
          <button type="button" onClick={charger} className="text-sm font-semibold underline underline-offset-2">
            Recharger
          </button>
        }
      >
        Impossible de charger votre dossier. Vérifiez votre connexion.
      </Alerte>
    );
  if (!dossiers) return <Chargement />;

  const actives = dossiers.vehicules.filter((v) => !v.archive_le);
  if (actives.length === 0)
    return (
      <>
        <h1 className="mb-5 font-display text-[28px] font-bold tracking-tight text-foreground">Bienvenue</h1>
        <VoitureAAjouter />
      </>
    );

  const vehicule = actives.find((v) => v.id === choisie) ?? choisirVoiture(actives, voitureCourante()) ?? actives[0];
  const aujourdhui = aujourdhuiIso();
  const { elements } = construireAPrevoir({
    vehicules: dossiers.vehicules,
    taches: dossiers.taches,
    reports: dossiers.reports,
    horizonJours: dossiers.horizonJours,
    aujourdhui,
  });
  const etat = etatAujourdhui({ elements, vehiculeId: vehicule.id, horizonJours: dossiers.horizonJours });
  const km = dernierKilometrage({ releves: vehicule.releves, historique: vehicule.historique });

  function changerVoiture(id) {
    memoriserVoitureCourante(id);
    setChoisie(id);
  }

  return (
    <>
      <h1 className="mb-4 font-display text-[28px] font-bold tracking-tight text-foreground">Aujourd'hui</h1>

      <MaVoiture vehicule={vehicule} km={km} actives={actives} onChoisir={changerVoiture} />

      {etat.principale ? <ActionPrincipale etat={etat} vehicule={vehicule} /> : null}

      {etat.autres.length > 0 ? (
        <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}`} className={`${carte} mt-3 flex items-center gap-3 transition hover:border-primary/40`}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">
              {etat.autres.length > 1 ? `${etat.autres.length} autres échéances` : "1 autre échéance"}
            </span>
            <span className="block text-sm text-muted-foreground">Tout ce qui est à prévoir pour cette voiture.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <Raccourcis vehicule={vehicule} />
    </>
  );
}

// La voiture dont on parle, nommée en haut de l'écran. Une seule voiture : pas
// de choix à faire. Plusieurs : des pastilles, et celle qu'on choisit est
// gardée sur l'appareil.
function MaVoiture({ vehicule, km, actives, onChoisir }) {
  return (
    <section aria-labelledby="titre-voiture" className={`${carte} mb-3`}>
      <Link
        href={`/auto/vehicules/${vehicule.id}`}
        onClick={() => onChoisir(vehicule.id)}
        className="-m-1 flex items-start justify-between gap-3 rounded-xl p-1 transition hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span id="titre-voiture" className="block font-display text-lg font-semibold leading-snug text-foreground">
            {vehicule.marque} {vehicule.modele}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            <Plaque valeur={vehicule.immatriculation} />
            <span>{km ? formaterKm(km.kilometrage) : "Kilométrage à renseigner"}</span>
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {actives.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3" role="group" aria-label="Choisir la voiture">
          {actives.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => v.id !== vehicule.id && onChoisir(v.id)}
              aria-pressed={v.id === vehicule.id}
              className={`${puce} ${puceEtat(v.id === vehicule.id)}`}
            >
              {v.marque} {v.modele}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// Les phrases d'en-tête, une par raison d'être en premier. Aucune ne porte de
// jugement sur l'état de la voiture.
const ENTETES = {
  depasse: { titre: "À faire sans attendre", ton: "depasse" },
  proche: { titre: "À faire bientôt", ton: "proche" },
  horizon: { titre: "À prévoir", ton: "ok" },
  plus_tard: { titre: "Prochaine échéance connue", ton: "ok" },
  a_completer: { titre: "À compléter pour que Nexora calcule", ton: "neutre" },
};

function ActionPrincipale({ etat, vehicule }) {
  const { element, urgence } = etat.principale;
  const entete = ENTETES[urgence] ?? ENTETES.horizon;
  const pastille = pastilleElement(element, { avecSujet: false });
  const estTache = element.genre === "tache";
  // Une tâche se termine ou se reporte dans « À prévoir » : l'écran y renvoie
  // plutôt que de dupliquer ces gestes.
  const premiere = estTache ? null : element.actions?.[0] ?? null;

  return (
    <section aria-labelledby="titre-action" className={`${carte} border-l-4 ${urgence === "depasse" ? "border-l-red-500" : urgence === "proche" ? "border-l-amber-500" : "border-l-primary/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="titre-action" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {entete.titre}
        </p>
        <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
      </div>

      <h2 className="mt-1.5 font-display text-xl font-semibold leading-snug text-foreground">{element.titre}</h2>
      <p className="mt-1 text-[15px] leading-snug text-foreground">{element.quand}</p>

      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground/80">{FONDEMENTS[element.fondement]}.</span>
        {element.explication ? ` ${element.explication}` : ""}
      </p>

      {element.alerte ? (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-red-800">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {element.alerte}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {premiere ? (
          <Link href={`/auto/vehicules/${vehicule.id}?action=${premiere.code}`} className={boutonPrincipal}>
            {premiere.libelle}
          </Link>
        ) : (
          <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}&element=${encodeURIComponent(element.cle)}`} className={boutonPrincipal}>
            Ouvrir cette échéance
          </Link>
        )}
        {element.serviceCode ? (
          <Link
            href={`/auto/services/${element.serviceCode}?vehicule=${vehicule.id}`}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary transition hover:bg-secondary"
          >
            Ce que comprend cette prestation
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {/* Dire ce que Nexora ne sait pas, même quand une autre échéance est
          calculée : sans cela, un écran calme laisserait croire à un bilan. */}
      {etat.aCompleter.length > 0 && urgence !== "a_completer" ? (
        <p className="mt-3 border-t border-border pt-3 text-[13px] leading-snug text-muted-foreground">
          {etat.aCompleter.length > 1
            ? `${etat.aCompleter.length} échéances ne sont pas encore calculées faute d'informations.`
            : "Une échéance n'est pas encore calculée faute d'informations."}{" "}
          <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}`} className="font-semibold text-primary hover:underline">
            Voir lesquelles
          </Link>
        </p>
      ) : null}
    </section>
  );
}

// Trois gestes, dits en toutes lettres.
function Raccourcis({ vehicule }) {
  const gestes = [
    { href: "/auto/factures/nouvelle", icone: ReceiptText, titre: "Ajouter une facture", texte: "En PDF : Nexora propose l'intervention, vous vérifiez." },
    { href: `/auto/vehicules/${vehicule.id}?action=releve`, icone: Gauge, titre: "Mettre à jour le kilométrage", texte: "Ce qui rend les échéances au compteur justes." },
    { href: `/auto/vehicules/${vehicule.id}?action=intervention`, icone: Wrench, titre: "Enregistrer une révision", texte: "Ou toute autre intervention déjà réalisée." },
    { href: `/auto/vehicules/${vehicule.id}/dossier`, icone: FileText, titre: "Le dossier de ma voiture", texte: "Historique, documents et dépenses." },
  ];
  return (
    <section aria-labelledby="titre-gestes" className="mt-6">
      <h2 id="titre-gestes" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Enregistrer ou consulter
      </h2>
      <ul className={carteListe}>
        {gestes.map(({ href, icone: Icone, titre, texte }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
              <span className={`${iconeLigne} flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary`}>
                <Icone className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{titre}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{texte}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/auto/vehicules/nouveau" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary transition hover:bg-secondary">
        <Plus className="size-4" aria-hidden="true" />
        Ajouter une autre voiture
      </Link>
    </section>
  );
}
