"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const perks = [
  { icon: Clock, text: "Réponse sous 24 h ouvrées" },
  { icon: ShieldCheck, text: "Audit gratuit et sans engagement" },
  { icon: Zap, text: "Premières pistes concrètes dès l'appel" },
]

export function ContactCta() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <section id="contact" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full opacity-50 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, oklch(0.7 0.17 18 / 45%), transparent)",
            }}
          />

          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                  Démo & devis
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  Découvrez ce que Nexora peut automatiser chez vous
                </h2>
                <p className="mt-4 text-lg text-muted-foreground text-pretty">
                  Décrivez-nous votre besoin en quelques mots. On vous rappelle pour une démo
                  personnalisée et un devis adapté à votre PME.
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {perks.map((p) => {
                  const Icon = p.icon
                  return (
                    <li key={p.text} className="flex items-center gap-3 text-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-foreground/90">{p.text}</span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
              {submitted ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <CheckCircle2 className="h-7 w-7" />
                  </span>
                  <h3 className="font-display text-xl font-semibold">Demande bien reçue !</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Merci. Notre équipe vous recontacte sous 24 h ouvrées pour organiser votre démo
                    personnalisée.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nom" id="name" name="name" placeholder="Jean Dupont" required />
                    <Field
                      label="Entreprise"
                      id="company"
                      name="company"
                      placeholder="Votre PME"
                      required
                    />
                  </div>
                  <Field
                    label="Email professionnel"
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jean@entreprise.fr"
                    required
                  />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="need" className="text-sm font-medium">
                      Que souhaitez-vous automatiser ?
                    </label>
                    <textarea
                      id="need"
                      name="need"
                      rows={3}
                      placeholder="Ex : le suivi de nos factures et les relances clients…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button type="submit" size="lg" className="mt-2 w-full">
                    Demander ma démo gratuite
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    En envoyant ce formulaire, vous acceptez d'être recontacté par Nexora.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

type FieldProps = {
  label: string
  id: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
}

function Field({ label, id, name, type = "text", placeholder, required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}
