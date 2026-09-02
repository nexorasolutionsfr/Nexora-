import { PhoneMissed, HelpCircle, FileQuestion, PhoneCall, FolderKanban } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Problem = {
  icon: LucideIcon
  title: string
  description: string
}

const problems: Problem[] = [
  {
    icon: PhoneMissed,
    title: "Des demandes dispersées",
    description:
      "Appels, SMS, emails, passages au comptoir : les demandes de rendez-vous arrivent par plusieurs canaux et se perdent facilement dans le rush du quotidien.",
  },
  {
    icon: HelpCircle,
    title: "Difficile de savoir où en est un véhicule",
    description:
      "Diagnostic, attente de pièce, intervention en cours : sans vue centralisée, il faut demander au mécanicien concerné pour savoir où en est chaque dossier.",
  },
  {
    icon: FileQuestion,
    title: "Des devis oubliés ou sans réponse",
    description:
      "Un devis envoyé et jamais relancé, c'est une intervention qui ne se fera jamais — sans que personne ne s'en rende vraiment compte sur le moment.",
  },
  {
    icon: PhoneCall,
    title: "Le client qui rappelle pour un point",
    description:
      "\"Vous en êtes où avec ma voiture ?\" — une question légitime, mais qui interrompt l'atelier si la réponse n'est pas immédiatement disponible.",
  },
  {
    icon: FolderKanban,
    title: "Informations éclatées",
    description:
      "Carnet papier, téléphone, tableur, logiciel de caisse : les mêmes informations sont ressaisies à plusieurs endroits, avec le risque d'erreur que ça implique.",
  },
]

export function Problems() {
  return (
    <section className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">Le quotidien d'un garage</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Des situations que tout garage indépendant connaît
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Rien d'exceptionnel — juste le quotidien d'un atelier qui tourne, sans outil pour tout
            relier.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((p) => (
            <article
              key={p.title}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <p.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
