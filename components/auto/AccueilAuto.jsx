"use client";

// Accueil de Nexora Auto. Sans session : ce que fait l'app, et une seule
// action — ajouter sa voiture. Avec session : « Aujourd'hui ».

import Link from "next/link";
import { CalendarClock, Car, History, LayoutGrid, Plus, ReceiptText, Gauge } from "lucide-react";

import Aujourdhui from "@/components/auto/Aujourdhui";
import {
  PageAuto,
  Pastille,
  Plaque,
  boutonPrincipal,
  boutonSecondaire,
  carte,
  useSessionAuto,
} from "@/components/auto/elements";
import { useModeAcces } from "@/components/auto/acces";

export default function AccueilAuto() {
  const session = useSessionAuto();
  if (session === null) return <Bienvenue />;
  return <Aujourdhui session={session} />;
}

function Bienvenue() {
  const beta = useModeAcces() === "beta";
  return (
    <PageAuto session={null}>
      <section className="pt-4">
        {beta ? <p className="mb-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">Bêta privée</p> : null}
        <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-tight text-foreground">
          Votre voiture.
          <br />
          <span className="text-primary">Une seule app.</span>
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
          Vos factures, l'historique, le kilométrage et ce qui est à prévoir pour votre voiture, au même endroit. Sans rien oublier.
        </p>
        <div className="mt-8 space-y-3">
          <Link href="/auto/connexion?mode=inscription&suite=/auto/vehicules/nouveau" className={boutonPrincipal}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter mon véhicule
          </Link>
          <Link href="/auto/connexion" className={boutonSecondaire}>
            J'ai déjà un compte
          </Link>
          {beta ? <p className="text-center text-[13px] text-muted-foreground">Nexora Auto est ouvert pour l'instant aux personnes invitées.</p> : null}
        </div>
      </section>

      <section aria-label="Exemple de fiche" className="mt-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exemple</p>
        <div className={`${carte} p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold text-foreground">Peugeot 308</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Essence · 2019</p>
            </div>
            <Plaque valeur="AB123CD" />
          </div>
          <div className="mt-4 grid gap-2.5 text-sm">
            <LigneExemple icone={Gauge} texte="61 400 km, relevé le 12 sept." />
            <LigneExemple icone={CalendarClock} texte="Contrôle technique avant le 1er mars 2027" pastille={<Pastille ton="ok">dans 6 mois</Pastille>} />
            <LigneExemple icone={History} texte="Révision vers 62 000 km" pastille={<Pastille ton="proche">encore 600 km</Pastille>} />
          </div>
        </div>
      </section>

      <ul className="mt-10 space-y-4">
        <Avantage icone={ReceiptText} titre="Vos factures, rangées et utiles" texte="Ajoutez une facture PDF : Nexora essaie de préremplir l'intervention, le kilométrage et la dépense. Vous confirmez." />
        <Avantage icone={History} titre="Tout l'historique au même endroit" texte="Révisions, contrôles, pneus, réparations : datés, avec le kilométrage et le montant." />
        <Avantage icone={CalendarClock} titre="Ce qui est à prévoir, sans calcul" texte="Contrôle technique et entretien calculés à partir de votre dossier, jamais devinés." />
        <Avantage icone={LayoutGrid} titre="Les services, expliqués" texte="Ce que comprend une prestation et ce qui dépend de votre voiture, avant de la faire réaliser." />
        <Avantage icone={Car} titre="Toutes vos voitures" texte="Ajoutez celles du foyer et retrouvez chacune en un geste." />
      </ul>

      <p className="mt-10 border-t border-border pt-5 text-[13px] leading-relaxed text-muted-foreground">
        Nexora Auto ne vend pas vos données et n'envoie rien à un service d'intelligence
        artificielle.{" "}
        <Link href="/auto/confidentialite" className="font-semibold text-primary hover:underline">
          Ce que nous enregistrons, et vos droits
        </Link>
        .
      </p>
    </PageAuto>
  );
}

function LigneExemple({ icone: Icone, texte, pastille }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="flex min-w-0 items-start gap-2 text-foreground">
        <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">{texte}</span>
      </span>
      {pastille}
    </div>
  );
}

function Avantage({ icone: Icone, titre, texte }) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icone className="size-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block font-semibold text-foreground">{titre}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{texte}</span>
      </span>
    </li>
  );
}
