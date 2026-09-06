"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { ArrowRight, Mail, ShieldCheck, Users } from "lucide-react"
import { track } from "@vercel/analytics"
import { Button } from "@/components/ui/button"

const CONTACT_EMAIL = "nexorasolutions.france@gmail.com"

const perks = [
  { icon: Users, text: "Démonstration personnalisée avec vos cas concrets" },
  { icon: ShieldCheck, text: "Aucun engagement avant l'échange" },
  { icon: Mail, text: "Réponse sous 24 h ouvrées, par e-mail ou par téléphone" },
]

export function ContactCta() {
  // "pret" -> "envoi" -> "envoye" | "echec". L'état d'échec n'est pas un
  // détail : c'est lui qui rend au visiteur le lien direct plutôt que de le
  // laisser croire que sa demande est partie.
  const [etat, setEtat] = useState<"pret" | "envoi" | "envoye" | "echec">("pret")

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const donnees = {
      name: formData.get("name"),
      garage: formData.get("garage"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      need: formData.get("need"),
      website: formData.get("website"),
    }

    // Événement sans aucune propriété : rien du formulaire ne part avec.
    track("demo_form_submit")
    setEtat("envoi")

    try {
      const reponse = await fetch("/api/demande-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(donnees),
      })
      setEtat(reponse.ok ? "envoye" : "echec")
    } catch {
      setEtat("echec")
    }
  }

  return (
    <section id="contact" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">
                  Démo
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  Découvrez Nexora sur votre propre activité
                </h2>
                <p className="mt-4 text-lg text-muted-foreground text-pretty">
                  Décrivez votre garage en quelques mots. Nous revenons vers vous pour organiser
                  une démonstration sur vos propres cas.
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {perks.map((p) => (
                  <li key={p.text} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                      <p.icon className="h-4 w-4" />
                    </span>
                    <span className="text-foreground/90">{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
              {etat === "envoye" || etat === "echec" ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
                    <Mail className="h-7 w-7" />
                  </span>
                  {etat === "envoye" ? (
                    <>
                      <h3 className="font-display text-xl font-semibold">Demande bien reçue</h3>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Nous revenons vers vous sous 24 h ouvrées pour convenir d&apos;un créneau.
                        Vous n&apos;avez rien d&apos;autre à faire.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display text-xl font-semibold">L&apos;envoi n&apos;a pas abouti</h3>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Votre demande n&apos;est pas partie. Écrivez-nous directement à{" "}
                        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
                          {CONTACT_EMAIL}
                        </a>{" "}
                        : nous répondrons aussi vite.
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setEtat("pret")}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Revenir au formulaire
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <p className="rounded-lg bg-secondary px-3.5 py-2.5 text-xs leading-relaxed text-secondary-foreground">
                    Votre demande nous parvient directement. Nous revenons vers vous sous 24 h
                    ouvrées.
                  </p>
                  {/* Piège à robots : masqué à l'œil et retiré du parcours clavier
                      et des lecteurs d'écran, donc jamais rempli par un humain. */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="hidden"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nom" id="name" name="name" placeholder="Jean Dupont" required />
                    <Field
                      label="Garage"
                      id="garage"
                      name="garage"
                      placeholder="Garage Dupont"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Email"
                      id="email"
                      name="email"
                      type="email"
                      placeholder="jean@garage-dupont.fr"
                      required
                    />
                    <Field
                      label="Téléphone (facultatif)"
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="06 12 34 56 78"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="need" className="text-sm font-medium">
                      Quel est votre principal besoin ?
                    </label>
                    <textarea
                      id="need"
                      name="need"
                      rows={3}
                      placeholder="Ex : mieux suivre les véhicules en atelier, ne plus perdre de devis…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={etat === "envoi"}>
                    {etat === "envoi" ? "Envoi en cours…" : "Demander une démo"}
                    {etat !== "envoi" && <ArrowRight className="h-4 w-4" />}
                  </Button>
                  <p className="text-center text-xs leading-relaxed text-muted-foreground">
                    Les informations saisies servent uniquement à traiter votre demande de
                    démonstration. Vous préférez écrire directement ?{" "}
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {CONTACT_EMAIL}
                    </a>
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
        className="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}
