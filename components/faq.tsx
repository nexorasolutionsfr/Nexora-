"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

type QA = { question: string; answer: string }

const faqs: QA[] = [
  {
    question: "Qu'est-ce que n8n exactement ?",
    answer:
      "n8n est une plateforme d'automatisation open-source qui permet de connecter vos applications entre elles et d'automatiser vos tâches. Contrairement à des outils comme Zapier, elle offre plus de flexibilité, un meilleur contrôle sur vos données et des coûts maîtrisés à grande échelle.",
  },
  {
    question: "Faut-il des compétences techniques de notre côté ?",
    answer:
      "Non. C'est tout l'intérêt de notre accompagnement : nous concevons, déployons et maintenons les automatisations pour vous. Vos équipes n'ont qu'à profiter du temps gagné. Nous les formons aussi à l'usage quotidien.",
  },
  {
    question: "Nos données sont-elles en sécurité ?",
    answer:
      "Absolument. n8n peut être hébergé sur une infrastructure privée dédiée, en Europe. Vos données ne transitent que par les outils que vous autorisez, et nous appliquons les bonnes pratiques de sécurité à chaque projet.",
  },
  {
    question: "Combien de temps pour mettre en place une automatisation ?",
    answer:
      "Une première automatisation est généralement opérationnelle en 2 à 3 semaines, audit inclus. Les projets plus complexes sont découpés en lots pour livrer de la valeur rapidement.",
  },
  {
    question: "Que se passe-t-il si un de mes outils change ?",
    answer:
      "Avec les formules incluant la maintenance, nous surveillons vos workflows et les adaptons en cas d'évolution de vos outils. Vous n'avez rien à gérer, tout continue de tourner.",
  },
  {
    question: "Le devis est-il vraiment gratuit ?",
    answer:
      "Oui. L'audit initial et le devis sont offerts et sans engagement. Nous préférons d'abord comprendre vos besoins et vérifier que l'automatisation a un vrai retour sur investissement pour vous.",
  },
]

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Vous vous posez sûrement ces questions
          </h2>
        </div>

        <div className="mt-12 flex flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i
            return (
              <div key={faq.question} className="rounded-2xl border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-base font-semibold">{faq.question}</span>
                  <Plus
                    className={`h-5 w-5 shrink-0 text-primary transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </button>
                <div
                  className="grid transition-all duration-200"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
