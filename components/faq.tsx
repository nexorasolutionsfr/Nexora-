"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

type QA = { question: string; answer: string }

const faqs: QA[] = [
  {
    question: "Nexora remplace-t-il tous les logiciels du garage ?",
    answer:
      "Non, pas encore. Nexora réunit aujourd'hui l'agenda, l'atelier en direct, le contrôle véhicule, le dossier véhicule, les clients, les devis et les factures. Il ne gère pas la comptabilité, le stock de pièces ni l'encaissement en carte.",
  },
  {
    question: "Est-ce adapté à un petit garage indépendant ?",
    answer:
      "Oui, c'est exactement le public visé. Nexora est pensé pour un garage indépendant qui veut une vue claire de sa journée, sans devenir gestionnaire de logiciels.",
  },
  {
    question: "Les clients doivent-ils installer une application ?",
    answer:
      "Non. Le client ouvre son contrôle véhicule, son devis ou sa facture via un lien sécurisé transmis par le garage, dans un simple navigateur — aucune application ni compte à créer.",
  },
  {
    question: "Peut-on suivre un véhicule depuis une tablette ?",
    answer:
      "Oui. L'interface atelier est pensée pour rester lisible et utilisable sur tablette, pour un mécanicien qui consulte ou met à jour un dossier en direct.",
  },
  {
    question: "Comment les liens devis, contrôle et facture sont-ils protégés ?",
    answer:
      "Chaque lien repose sur un jeton aléatoire de 256 bits, sans rapport avec vos données. Le garage peut le révoquer à tout moment, et aucune donnée métier n'apparaît dans l'URL.",
  },
  {
    question: "Nexora est-il déjà disponible ?",
    answer:
      "Nexora est une version pilote fonctionnelle : les fonctions décrites sur cette page sont opérationnelles, mais le produit n'est pas encore déployé à grande échelle. Nous constituons actuellement notre premier cercle de garages pilotes, et leurs retours orienteront directement la suite.",
  },
]

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#2748A6]">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Les questions qu'on nous pose le plus
          </h2>
        </div>

        <div className="mt-12 flex flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i
            return (
              <div key={faq.question} className="rounded-2xl border border-border bg-card">
                <button
                  type="button"
                  id={`faq-question-${i}`}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span className="font-display text-base font-semibold">{faq.question}</span>
                  <Plus
                    className={`h-5 w-5 shrink-0 text-primary transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </button>
                <div
                  id={`faq-answer-${i}`}
                  role="region"
                  aria-labelledby={`faq-question-${i}`}
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
