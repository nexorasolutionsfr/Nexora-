import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type Article = {
  slug: string
  category: string
  title: string
  readTime: string
  intro: string
  sections: { heading: string; body: string[] }[]
}

const articles: Article[] = [
  {
    slug: "5-taches-automatiser-pme",
    category: "Guide",
    title: "5 tâches que toute PME devrait automatiser en premier",
    readTime: "6 min",
    intro:
      "Automatiser peut sembler compliqué ou réservé aux grandes entreprises. En réalité, quelques automatisations simples suffisent souvent à libérer plusieurs heures par semaine. Voici les 5 tâches les plus courantes à automatiser en premier, avec des exemples concrets.",
    sections: [
      {
        heading: "1. Le tri et la priorisation des emails entrants",
        body: [
          "Chaque email de demande (devis, question, réclamation) doit être lu, compris et classé avant même d'y répondre. Une automatisation peut lire l'email dès son arrivée, identifier de quoi il parle et le classer par urgence, pour que vous traitiez d'abord ce qui compte vraiment.",
        ],
      },
      {
        heading: "2. Les relances clients",
        body: [
          "Relancer un client pour un rendez-vous d'entretien, une facture impayée ou un devis resté sans réponse est une tâche répétitive et facile à oublier. Un système automatique peut envoyer ces relances au bon moment, sans y penser.",
        ],
      },
      {
        heading: "3. La création de rendez-vous",
        body: [
          "Passer d'un message client à un rendez-vous confirmé dans l'agenda demande plusieurs allers-retours manuels. Une automatisation peut proposer des créneaux et les bloquer directement dans le calendrier dès la confirmation du client.",
        ],
      },
      {
        heading: "4. La mise à jour de tableurs ou de bases clients",
        body: [
          "Recopier à la main une information reçue par email ou formulaire dans un tableau de suivi prend du temps et génère des erreurs. Une automatisation transfère l'information directement au bon endroit.",
        ],
      },
      {
        heading: "5. Les réponses aux questions fréquentes",
        body: [
          "Beaucoup de messages clients posent les mêmes questions (horaires, tarifs, disponibilités). Une première réponse automatique, s'appuyant sur une IA, peut répondre instantanément aux questions simples, et transmettre à un humain seulement les cas plus complexes.",
        ],
      },
    ],
  },
  {
    slug: "ne-plus-rater-demande-devis-email",
    category: "Cas pratique",
    title: "Comment ne plus rater aucune demande de devis par email",
    readTime: "5 min",
    intro:
      "Dans un garage ou un atelier, les mails de demande de devis ou de rendez-vous s'accumulent souvent entre deux interventions. Résultat : certains sont traités en retard, voire oubliés. Voici comment une automatisation simple résout ce problème.",
    sections: [
      {
        heading: "Le problème concret",
        body: [
          "Un client envoie un email décrivant une panne. Ce mail arrive dans la même boîte que les factures fournisseurs et les newsletters. Le garagiste, occupé sous un véhicule, ne le voit parfois que le lendemain — le client, lui, a peut-être déjà appelé un concurrent.",
        ],
      },
      {
        heading: "Comment l'automatisation fonctionne",
        body: [
          "Dès qu'un email arrive, une IA lit le message et en extrait les informations utiles : type de véhicule, panne décrite, degré d'urgence. Ces informations sont automatiquement ajoutées à une liste organisée par priorité, et une alerte est envoyée pour les cas urgents (véhicule immobilisé, panne de sécurité).",
        ],
      },
      {
        heading: "Le résultat pour le garage",
        body: [
          "Le garagiste retrouve, en arrivant le matin, une liste déjà triée des demandes à traiter en priorité — sans avoir à ouvrir et lire chaque email un par un.",
        ],
      },
    ],
  },
  {
    slug: "pme-facturation-temps-divise-par-5",
    category: "Cas d'usage",
    title: "Comment une PME peut diviser son temps de facturation par 5",
    readTime: "5 min",
    intro:
      "Cet article présente un exemple type de ce que l'automatisation peut changer pour une petite entreprise sur la gestion de sa facturation — un cas illustratif, pas un témoignage client vérifié, pour montrer concrètement la mécanique.",
    sections: [
      {
        heading: "La situation de départ",
        body: [
          "Une petite entreprise de services facture manuellement chaque mois : récupération des heures ou prestations réalisées, création de la facture, envoi par email, puis suivi des paiements en retard. Pour une dizaine de clients, cela peut représenter plusieurs heures chaque mois.",
        ],
      },
      {
        heading: "Ce que l'automatisation change",
        body: [
          "Un workflow peut générer automatiquement les factures à date fixe à partir d'un tableau de suivi, les envoyer par email, et relancer automatiquement les clients en retard de paiement après un délai défini — sans intervention manuelle à chaque étape.",
        ],
      },
      {
        heading: "L'impact estimé",
        body: [
          "Le temps consacré à la facturation passe d'environ une demi-journée par mois à quelques dizaines de minutes de vérification — le travail répétitif est pris en charge, la décision finale reste humaine.",
        ],
      },
    ],
  },
]

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }))
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = articles.find((a) => a.slug === slug)
  if (!article) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <Link
        href="/#ressources"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux ressources
      </Link>

      <div className="mt-6 flex items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground/80">
          {article.category}
        </span>
        <span className="text-xs text-muted-foreground">{article.readTime} de lecture</span>
      </div>

      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {article.title}
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty">{article.intro}</p>

      <div className="mt-10 flex flex-col gap-8">
        {article.sections.map((s) => (
          <div key={s.heading}>
            <h2 className="font-display text-xl font-semibold">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h3 className="font-display text-lg font-semibold">Un besoin similaire dans votre activité ?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Parlons de ce qu'on peut automatiser chez vous, sans engagement.
        </p>
        <Button asChild size="lg" className="mt-4">
          <Link href="/#contact">
            Demander mon audit gratuit
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  )
}
