"use client";

// Accueil de Nexora Auto. Sans session : ce que fait l'app, et une seule
// action — ajouter sa voiture. Avec session : le garage virtuel.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Car, ChevronRight, Gauge, History, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { dernierKilometrage, prochainControleTechnique, prochainEntretien } from "@/lib/auto/echeances";
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
import { ENERGIES, formaterKm, libelleDe, resumeControle, resumeEntretien } from "@/components/auto/format";

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
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-foreground">
        <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{texte}</span>
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
  const [etat, setEtat] = useState({ chargement: true, erreur: false, vehicules: [] });

  const charger = useCallback(async () => {
    setEtat((e) => ({ ...e, chargement: true, erreur: false }));
    const [vehicules, releves, historique] = await Promise.all([
      supabase
        .from("auto_vehicules")
        .select("id, immatriculation, marque, modele, annee, energie, date_mise_en_circulation, intervalle_entretien_km, intervalle_entretien_mois, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("auto_releves_km").select("vehicule_id, kilometrage, releve_le"),
      supabase.from("auto_historique").select("vehicule_id, type, realise_le, kilometrage, resultat_controle, controle_valable_jusqu_au"),
    ]);
    // Une lecture en échec ne doit jamais ressembler à un garage vide.
    if (vehicules.error || releves.error || historique.error) {
      setEtat({ chargement: false, erreur: true, vehicules: [] });
      return;
    }
    const parVehicule = (lignes, id) => lignes.filter((l) => l.vehicule_id === id);
    setEtat({
      chargement: false,
      erreur: false,
      vehicules: vehicules.data.map((v) => ({
        ...v,
        releves: parVehicule(releves.data, v.id),
        historique: parVehicule(historique.data, v.id),
      })),
    });
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">Mon garage</h1>
        {etat.vehicules.length > 0 ? (
          <Link href="/auto/vehicules/nouveau" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
            <Plus className="size-4" aria-hidden="true" />
            Ajouter
          </Link>
        ) : null}
      </div>

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
      ) : etat.vehicules.length === 0 ? (
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
          {etat.vehicules.map((v) => (
            <li key={v.id}>
              <CarteVehicule vehicule={v} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CarteVehicule({ vehicule }) {
  const km = dernierKilometrage({ releves: vehicule.releves, historique: vehicule.historique });
  const ct = prochainControleTechnique({ dateMiseEnCirculation: vehicule.date_mise_en_circulation, historique: vehicule.historique });
  const entretien = prochainEntretien({
    intervalleKm: vehicule.intervalle_entretien_km,
    intervalleMois: vehicule.intervalle_entretien_mois,
    historique: vehicule.historique,
    releves: vehicule.releves,
  });
  const details = [libelleDe(ENERGIES, vehicule.energie), vehicule.annee].filter(Boolean).join(" · ");

  return (
    <Link href={`/auto/vehicules/${vehicule.id}`} className={`${carte} block transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
        <Pastille ton={resumeControle(ct).ton}>{resumeControle(ct).texte}</Pastille>
        <Pastille ton={resumeEntretien(entretien).ton}>{resumeEntretien(entretien).texte}</Pastille>
      </div>
    </Link>
  );
}
