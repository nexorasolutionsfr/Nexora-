import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Mentions légales — Nexora",
  description: "Mentions légales du site Nexora, édité par Nexora Solutions.",
  alternates: { canonical: "/mentions-legales" },
}

export default function MentionsLegalesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Mentions légales
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dernière mise à jour : 5 septembre 2026
          </p>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Éditeur du site</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Le site nexora-garage.vercel.app est édité par :
            </p>
            <p className="text-base leading-relaxed text-foreground">
              Baptiste Papoul, entrepreneur individuel (EI)
              <br />
              Exerçant sous le nom commercial Nexora Solutions
              <br />
              Adresse : 21 rue de l&rsquo;École, 52100 Saint-Dizier
              <br />
              Adresse électronique :{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              <br />
              Téléphone : 06 63 68 55 56
              <br />
              Numéro SIREN : 108 995 788
              <br />
              Immatriculation : non soumis à immatriculation au registre du commerce et des
              sociétés ni au répertoire des métiers (profession libérale non réglementée,
              exercée sous le régime de la micro-entreprise)
              <br />
              TVA : non applicable, article 293 B du Code général des impôts (franchise en
              base)
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Directeur de la publication</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Baptiste Papoul, joignable à l&rsquo;adresse{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Hébergement</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Le site est hébergé par :
              <br />
              Vercel Inc.
              <br />
              440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Objet du site</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              nexora-garage.vercel.app présente Nexora, un logiciel de pilotage destiné aux
              garages automobiles indépendants, et permet de demander une démonstration.
              Aucune vente ni souscription n&rsquo;est possible directement en ligne.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Propriété intellectuelle</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              L&rsquo;ensemble des contenus de ce site (textes, interfaces, captures d&rsquo;écran,
              éléments graphiques et logo) est la propriété de Nexora Solutions, sauf mention
              contraire. Toute reproduction ou représentation, totale ou partielle, sans
              autorisation écrite préalable est interdite.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Données personnelles</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Le traitement des données personnelles est décrit dans la{" "}
              <a href="/confidentialite" className="text-primary hover:underline">
                politique de confidentialité
              </a>
              . Pour toute question ou pour exercer vos droits :{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Conditions applicables aux professionnels
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Les conditions générales applicables aux prestations proposées par Nexora
              Solutions sont communiquées à tout professionnel qui en fait la demande, à
              l&rsquo;adresse{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Signalement d&rsquo;un contenu</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Tout contenu de ce site jugé illicite peut être signalé à{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
