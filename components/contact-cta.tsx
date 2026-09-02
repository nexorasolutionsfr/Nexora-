"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { ArrowRight, Mail, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"

const CONTACT_EMAIL = "nexorasolutions.france@gmail.com"

const perks = [
  { icon: Users, text: "Démonstration personnalisée avec vos cas concrets" },
  { icon: ShieldCheck, text: "Aucun engagement avant l'échange" },
  { icon: Mail, text: "Le formulaire ouvre simplement votre messagerie" },
]

export function ContactCta() {
  const [opened, setOpened] = useState(false)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name")
    const garage = formData.get("garage")
    const email = formData.get("email")
    const phone = formData.get("phone")
    const need = formData.get("need")

    const subject = encodeURIComponent(`Demande de démo — ${garage}`)
    const body = encodeURIComponent(
      `Nom : ${name}\nGarage : ${garage}\nEmail : ${email}\nTéléphone : ${phone || "non renseigné"}\n\nPrincipal besoin :\n${need}`,
    )
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`

    setOpened(true)
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
                  Décrivez votre garage en quelques mots. On revient vers vous pour organiser une
                  démonstration personnalisée.
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
              {opened ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
                    <Mail className="h-7 w-7" />
                  </span>
                  <h3 className="font-display text-xl font-semibold">Votre messagerie a dû s'ouvrir</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Envoyez l'email pour finaliser votre demande. Sans envoi de votre part, Nexora ne
                    reçoit rien.
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Si votre messagerie ne s'est pas ouverte, écrivez-nous directement à{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
                      {CONTACT_EMAIL}
                    </a>
                    .
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpened(false)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Revenir au formulaire
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <p className="rounded-lg bg-secondary px-3.5 py-2.5 text-xs leading-relaxed text-secondary-foreground">
                    En validant, votre messagerie habituelle va s'ouvrir avec un email pré-rempli.
                    Il vous suffira de l'envoyer pour finaliser votre demande.
                  </p>
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
                      className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button type="submit" size="lg" className="mt-2 h-11 w-full">
                    Demander une démo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Les informations saisies servent uniquement à préparer votre message. Rien n'est
                    envoyé tant que vous ne confirmez pas l'envoi dans votre messagerie.
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
        className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}
