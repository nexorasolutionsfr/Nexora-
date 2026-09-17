"use client";

// Accueil de Nexora Auto. Sans session : ce que fait l'app, et une seule
// action — ajouter sa voiture. Avec session : le garage virtuel.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, CalendarCheck, CalendarClock, Car, ChevronDown, ChevronRight, Gauge, History, Plus, ReceiptText, Star } from "lucide-react";

import { aujourdhuiIso, dernierKilometrage } from "@/lib/auto/echeances";
import { construireAPrevoir, elementControle, elementRevision, pastilleElement } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import {
  Alerte,
  PageAuto,
  Pastille,
  Plaque,
  SqueletteVehicules,
  boutonPrincipal,
  boutonSecondaire,
  carte,
  useSessionAuto,
} from "@/components/auto/elements";
import { ENERGIES, formaterDate, formaterKm, libelleDe } from "@/components/auto/format";

export default function AccueilAuto() {
  const session = useSessionAuto();

  if (session === null) return <Bienvenue />;
  return (
    <PageAuto session={session}>
      {session === undefined ? <SqueletteVehicules /> : <MesVehicules />}
    </PageAuto>
  );
}

function Bienvenue() {
  return (
    <PageAuto session={null}>
      <section className="pt-4">
        <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-tight text-foreground">
          Votre voiture.
          <br />
          <span className="text-primary">Une seule app.</span>
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
          L'historique, le kilométrage et les échéances de votre voiture, au même endroit. Sans rien oublier.
        </p>
        <div className="mt-8 space-y-3">
          <Link href="/auto/connexion?mode=inscription&suite=/auto/vehicules/nouveau" className={boutonPrincipal}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter mon véhicule
          </Link>
          <Link href="/auto/connexion" className={boutonSecondaire}>
            J'ai déjà un compte
          </Link>
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
        <Avantage icone={History} titre="Tout l'historique au même endroit" texte="Révisions, contrôles, pneus, réparations : datés, avec le kilométrage et le montant." />
        <Avantage icone={CalendarClock} titre="Les échéances, sans calcul" texte="Contrôle technique et entretien calculés à partir de ce que vous renseignez, jamais devinés." />
        <Avantage icone={Car} titre="Toutes vos voitures" texte="Ajoutez celles du foyer et retrouvez chacune en un geste." />
      </ul>
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

function MesVehicules() {
  const [etat, setEtat] = useState({ chargement: true, erreur: false, vehicules: [], taches: [], reports: [], horizonJours: 60 });
  const [voirArchives, setVoirArchives] = useState(false);

  const charger = useCallback(async () => {
    setEtat((e) => ({ ...e, chargement: true, erreur: false }));
    const dossiers = await chargerDossiers();
    // Une lecture en échec ne doit jamais ressembler à un garage vide.
    setEtat(dossiers.erreur ? { chargement: false, erreur: true, vehicules: [], taches: [], reports: [], horizonJours: 60 } : { chargement: false, ...dossiers });
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // La voiture principale d'abord, puis l'ordre d'ajout. Les voitures
  // archivées ont leur propre liste, repliée.
  const actives = etat.vehicules.filter((v) => !v.archive_le).sort((a, b) => Number(b.principal) - Number(a.principal));
  const archivees = etat.vehicules.filter((v) => v.archive_le);

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">Mon garage</h1>
        {actives.length > 0 ? (
          <Link href="/auto/vehicules/nouveau" aria-label="Ajouter une voiture" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
            <Plus className="size-4" aria-hidden="true" />
            Voiture
          </Link>
        ) : null}
      </div>

      {!etat.chargement && !etat.erreur && actives.length > 0 ? <ProchainesActions etat={etat} /> : null}

      {etat.chargement ? (
        <SqueletteVehicules />
      ) : etat.erreur ? (
        <Alerte
          action={
            <button type="button" onClick={charger} className="text-sm font-semibold underline underline-offset-2">
              Recharger
            </button>
          }
        >
          Impossible de charger vos véhicules. Vérifiez votre connexion.
        </Alerte>
      ) : actives.length === 0 ? (
        <div className={`${carte} px-5 py-8 text-center`}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Car className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Ajoutez votre voiture</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Kilométrage, historique, contrôle technique : tout sera au même endroit.
          </p>
          <Link href="/auto/vehicules/nouveau" className={`${boutonPrincipal} mt-6`}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter mon véhicule
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {actives.map((v) => (
            <li key={v.id}>
              <CarteVehicule vehicule={v} />
            </li>
          ))}
        </ul>
      )}

      {!etat.chargement && !etat.erreur && actives.length > 0 ? (
        <Link href="/auto/factures/nouvelle" className={`${carte} mt-3 flex items-center gap-3 transition hover:border-primary/40`}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <ReceiptText className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Ajouter une facture</span>
            <span className="block text-sm text-muted-foreground">En PDF, Nexora essaie de préremplir les informations pour vous.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      {!etat.chargement && !etat.erreur && archivees.length > 0 ? (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setVoirArchives((v) => !v)}
            aria-expanded={voirArchives}
            className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <Archive className="size-4" aria-hidden="true" />
            {archivees.length > 1 ? `${archivees.length} voitures archivées` : "1 voiture archivée"}
            <ChevronDown className={`size-4 transition ${voirArchives ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {voirArchives ? (
            <ul className="mt-2 space-y-2">
              {archivees.map((v) => (
                <li key={v.id}>
                  <Link href={`/auto/vehicules/${v.id}`} className={`${carte} flex items-center justify-between gap-3 py-3 opacity-80 transition hover:opacity-100`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">
                        {v.marque} {v.modele}
                      </span>
                      <span className="block text-sm text-muted-foreground">Archivée le {formaterDate(v.archive_le)}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function CarteVehicule({ vehicule }) {
  const km = dernierKilometrage({ releves: vehicule.releves, historique: vehicule.historique });
  const ct = pastilleElement(elementControle(vehicule));
  const revision = pastilleElement(elementRevision(vehicule));
  const details = [libelleDe(ENERGIES, vehicule.energie), vehicule.annee].filter(Boolean).join(" · ");

  return (
    <Link href={`/auto/vehicules/${vehicule.id}`} className={`${carte} block transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {vehicule.principal ? (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Principale
            </p>
          ) : null}
          <p className="font-display text-lg font-semibold leading-snug text-foreground">
            {vehicule.marque} {vehicule.modele}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            <Plaque valeur={vehicule.immatriculation} />
            <span>
              {km ? formaterKm(km.kilometrage) : "Kilométrage à renseigner"}
              {details ? ` · ${details}` : ""}
            </span>
          </div>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pastille ton={ct.ton}>{ct.texte}</Pastille>
        <Pastille ton={revision.ton}>{revision.texte}</Pastille>
      </div>
    </Link>
  );
}

// Le rappel dans l'app : trois prochaines actions au plus, jamais celles que
// la personne a reportées. Le détail est dans « À prévoir ».
function ProchainesActions({ etat }) {
  const { prochaines, groupes } = construireAPrevoir({ vehicules: etat.vehicules, taches: etat.taches, reports: etat.reports, horizonJours: etat.horizonJours, aujourdhui: aujourdhuiIso() });
  const aCompleter = groupes.aCompleter.length;

  return (
    <section className={`${carte} mb-4`} aria-labelledby="titre-prochaines">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titre-prochaines" className="flex items-center gap-2 font-semibold text-foreground">
          <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
          À prévoir
        </h2>
        <Link href="/auto/a-prevoir" className="-my-2 inline-flex min-h-10 items-center gap-0.5 rounded-lg px-1 text-sm font-semibold text-primary hover:underline">
          Tout voir
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {prochaines.length === 0 ? (
        <p className="mt-2 text-[15px] text-muted-foreground">
          Rien d'urgent dans les {etat.horizonJours} prochains jours.
          {aCompleter ? ` ${aCompleter > 1 ? `${aCompleter} informations` : "1 information"} à compléter.` : ""}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {prochaines.map((el) => {
            const pastille = pastilleElement(el, { avecSujet: false });
            return (
              <li key={el.cle}>
                <Link href="/auto/a-prevoir" className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="line-clamp-2 block font-medium text-foreground">{el.titre}</span>
                    <span className="block truncate text-sm text-muted-foreground">{el.vehicule.nom}</span>
                  </span>
                  <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
