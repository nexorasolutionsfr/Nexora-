"use client";

// « Mon garage » : les voitures de la personne et l'entrée de leur dossier.
// Une seule action principale ici — ajouter une voiture. Ce qu'il y a à faire
// se lit dans « Aujourd'hui ».

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Car, ChevronDown, ChevronRight, Plus, Star } from "lucide-react";

import { dernierKilometrage } from "@/lib/auto/echeances";
import { elementControle, elementRevision, pastilleElement } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import {
  Alerte,
  PageAuto,
  Pastille,
  Plaque,
  SqueletteVehicules,
  boutonPrincipal,
  carte,
  memoriserVoitureCourante,
  useSessionAuto,
} from "@/components/auto/elements";
import { ENERGIES, TYPES_INTERVENTION, formaterDate, formaterKm, libelleDe } from "@/components/auto/format";

export default function MonGarage() {
  const session = useSessionAuto();
  return (
    <PageAuto session={session}>
      {session === undefined ? <SqueletteVehicules /> : session === null ? <ARejoindre /> : <MesVehicules />}
    </PageAuto>
  );
}

// Écran privé atteint sans session (lien partagé, session expirée).
function ARejoindre() {
  return (
    <div className={`${carte} px-5 py-8 text-center`}>
      <h1 className="font-display text-xl font-semibold text-foreground">Votre garage vous attend</h1>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Connectez-vous pour retrouver vos voitures et leurs dossiers.
      </p>
      <Link href="/auto/connexion?suite=/auto/garage" className={`${boutonPrincipal} mt-6`}>
        Se connecter
      </Link>
    </div>
  );
}

function MesVehicules() {
  const [etat, setEtat] = useState({ chargement: true, erreur: false, vehicules: [] });
  const [voirArchives, setVoirArchives] = useState(false);

  const charger = useCallback(async () => {
    setEtat((e) => ({ ...e, chargement: true, erreur: false }));
    const dossiers = await chargerDossiers();
    // Une lecture en échec ne doit jamais ressembler à un garage vide.
    setEtat(dossiers.erreur ? { chargement: false, erreur: true, vehicules: [] } : { chargement: false, erreur: false, vehicules: dossiers.vehicules });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rechargement du garage (indicateur, puis réponse Supabase) ; `charger` sert aussi au bouton « Recharger ».
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
        <VoitureAAjouter />
      ) : (
        <ul className="space-y-3">
          {actives.map((v) => (
            <li key={v.id}>
              <CarteVehicule vehicule={v} />
            </li>
          ))}
        </ul>
      )}

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
                      <span className="block break-words font-semibold text-foreground">
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

// Premier geste, et le seul : ajouter sa voiture. La marque et le modèle
// suffisent ; le reste se complète quand il sert.
export function VoitureAAjouter() {
  return (
    <div className={`${carte} px-5 py-8 text-center`}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Car className="size-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Ajouter ma voiture</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        La marque et le modèle suffisent pour commencer. Le reste se complète quand il devient utile.
      </p>
      <Link href="/auto/vehicules/nouveau" className={`${boutonPrincipal} mt-6`}>
        <Plus className="size-5" aria-hidden="true" />
        Ajouter ma voiture
      </Link>
    </div>
  );
}

export function CarteVehicule({ vehicule }) {
  const km = dernierKilometrage({ releves: vehicule.releves, historique: vehicule.historique });
  const ct = pastilleElement(elementControle(vehicule));
  const revision = pastilleElement(elementRevision(vehicule));
  const details = [libelleDe(ENERGIES, vehicule.energie), vehicule.annee].filter(Boolean).join(" · ");
  const derniere = [...(vehicule.historique ?? [])].sort((a, b) => (a.realise_le < b.realise_le ? 1 : a.realise_le > b.realise_le ? -1 : 0))[0];

  return (
    <Link
      href={`/auto/vehicules/${vehicule.id}`}
      onClick={() => memoriserVoitureCourante(vehicule.id)}
      className={`${carte} block transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/25`}
    >
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
          {derniere ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Dernière intervention : {libelleDe(TYPES_INTERVENTION, derniere.type)}, {formaterDate(derniere.realise_le)}
            </p>
          ) : null}
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
