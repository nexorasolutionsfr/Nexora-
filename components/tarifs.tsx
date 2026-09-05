"use client"

import { useState } from "react"
import { ArrowRight, Check } from "lucide-react"
import { track } from "@vercel/analytics"
import { Button } from "@/components/ui/button"
import {
  JOURS_ESSAI,
  OFFRES,
  type Periodicite,
  equivalentMensuel,
  formaterEuros,
  prix,
} from "@/lib/tarifs"

export function Tarifs() {
  const [periodicite, setPeriodicite] = useState<Periodicite>("mensuel")
  const [enCours, setEnCours] = useState<string | null>(null)
  const [erreur, setErreur] = useState("")

  async function demarrer(cle: string) {
    setErreur("")
    setEnCours(cle)
    track("essai_demarre")
    try {
      const reponse = await fetch("/api/abonnement/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre: cle, periodicite }),
      })
      const donnees = await reponse.json()
      if (reponse.ok && donnees.url) {
        window.location.href = donnees.url
        return
      }
      // Le paiement n'est pas encore branché, ou il a refusé. On ne laisse pas
      // le visiteur sur un bouton mort : le formulaire de démo reste ouvert.
      setErreur(
        donnees.erreur === "paiement_indisponible"
          ? "L'abonnement en ligne ouvre très bientôt. Demandez une démo, nous vous ouvrons l'accès nous-mêmes."
          : "La page de paiement n'a pas pu s'ouvrir. Réessayez, ou demandez une démo.",
      )
    } catch {
      setErreur("La page de paiement n'a pas pu s'ouvrir. Réessayez, ou demandez une démo.")
    } finally {
      setEnCours(null)
    }
  }

  return (
    <section id="tarifs" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Tarifs</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Essayez {JOURS_ESSAI} jours. Décidez ensuite.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Le temps de passer une vraie semaine d&apos;atelier avec Nexora. Rien n&apos;est prélevé
            avant le {JOURS_ESSAI + 1}<sup>e</sup> jour, et vous arrêtez quand vous voulez.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            role="group"
            aria-label="Périodicité de facturation"
            className="inline-flex rounded-full border border-border bg-card p-1"
          >
            {(["mensuel", "annuel"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodicite(p)}
                aria-pressed={periodicite === p}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  periodicite === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "mensuel" ? "Mensuel" : "Annuel"}
                {p === "annuel" && (
                  <span className="ml-1.5 text-xs opacity-80">2 mois offerts</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {OFFRES.map((o) => (
            <div
              key={o.cle}
              className={`relative flex flex-col rounded-2xl border bg-card p-6 sm:p-8 ${
                o.recommandee ? "border-primary shadow-lg" : "border-border"
              }`}
            >
              {o.recommandee && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Le plus choisi
                </span>
              )}

              <h3 className="font-display text-xl font-semibold">{o.nom}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{o.accroche}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-bold tabular-nums">
                  {formaterEuros(periodicite === "annuel" ? equivalentMensuel(o) : o.prixMensuel)}
                </span>
                <span className="text-sm text-muted-foreground">/ mois</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {periodicite === "annuel"
                  ? `${formaterEuros(prix(o, "annuel"))} par an, en une fois`
                  : "Sans engagement, résiliable à tout moment"}
              </p>

              <p className="mt-4 text-sm font-medium text-foreground/80">{o.pour}</p>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {o.inclus.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={o.recommandee ? undefined : "outline"}
                className="mt-7 h-11 w-full"
                disabled={enCours !== null}
                onClick={() => demarrer(o.cle)}
              >
                {enCours === o.cle ? "Ouverture…" : `Essayer ${JOURS_ESSAI} jours`}
                {enCours !== o.cle && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>

        {erreur && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {erreur}{" "}
            <a href="#contact" className="font-medium text-primary hover:underline">
              Demander une démo
            </a>
          </p>
        )}

        <div className="mt-10 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
          <h3 className="font-display text-lg font-semibold">Vous êtes parmi les dix premiers ?</h3>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Les dix premiers garages qui rejoignent Nexora bénéficient de{" "}
            <span className="font-medium text-foreground">trois mois offerts</span> et de leur{" "}
            <span className="font-medium text-foreground">tarif bloqué à vie</span>, quelles que
            soient les hausses futures. En échange, on vous demande vos retours — ils orientent
            réellement ce qu&apos;on construit ensuite.
          </p>
          <Button
            render={<a href="#contact" />}
            nativeButton={false}
            size="lg"
            variant="outline"
            className="mt-5 h-11"
          >
            En parler
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
          TVA non applicable, article 293 B du code général des impôts : le montant affiché est
          celui que vous payez, sans supplément. La reprise de votre ancienne base de clients et
          de véhicules est incluse dans toutes les offres.
        </p>
      </div>
    </section>
  )
}
