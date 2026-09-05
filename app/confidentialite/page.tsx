import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Politique de confidentialité — Nexora",
  description: "Comment Nexora Solutions traite les données personnelles.",
  alternates: { canonical: "/confidentialite" },
}

export default function ConfidentialitePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Politique de confidentialité
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dernière mise à jour : 5 septembre 2026
          </p>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Qui traite vos données</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Baptiste Papoul, entrepreneur individuel, exerçant sous le nom Nexora Solutions,
              21 rue de l&rsquo;École, 52100 Saint-Dizier, SIREN 108 995 788. Contact pour toute
              question relative aux données personnelles :{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              1. Demande de démonstration depuis le site
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Données traitées : nom du garage, nom de la personne qui écrit, adresse
              électronique, téléphone si vous le communiquez, et le contenu de votre message.
              <br />
              Finalité : répondre à votre demande et organiser une démonstration.
              <br />
              Base légale : votre démarche, qui constitue une mesure précontractuelle prise à
              votre demande.
              <br />
              Durée de conservation : trois ans à compter de notre dernier échange, sauf si
              vous demandez la suppression avant.
              <br />
              Destinataires : Baptiste Papoul uniquement, ainsi que les prestataires techniques
              mentionnés au point 5.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              2. Prospection commerciale par courrier électronique
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Données traitées : nom de l&rsquo;entreprise, commune, adresse électronique
              professionnelle générique, adresse du site internet, et le suivi de nos
              échanges.
              <br />
              Origine des données : sources publiques officielles, en particulier l&rsquo;annuaire
              des entreprises de l&rsquo;État alimenté par la base Sirene de l&rsquo;INSEE, ainsi que
              les coordonnées publiées par l&rsquo;entreprise elle-même sur son propre site
              internet.
              <br />
              Finalité : proposer une démonstration de Nexora à des entreprises dont
              l&rsquo;activité correspond à l&rsquo;usage du logiciel.
              <br />
              Base légale : notre intérêt légitime à faire connaître notre activité auprès de
              professionnels du même secteur.
              <br />
              Durée de conservation : trois ans à compter du dernier contact. Les demandes
              d&rsquo;opposition sont conservées au-delà, dans le seul but de ne plus vous
              contacter.
              <br />
              Vos droits : vous pouvez vous opposer à tout moment à cette prospection, en
              répondant « stop » à l&rsquo;un de nos messages ou en écrivant à{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>
              . Votre opposition est appliquée sans condition et sans délai.
              <br />
              Aucun dispositif de suivi d&rsquo;ouverture ou de clic n&rsquo;est utilisé dans nos
              courriers électroniques de prospection.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              3. Données saisies dans le logiciel par les garages utilisateurs
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Lorsqu&rsquo;un garage utilise Nexora, il saisit des informations concernant ses
              propres clients et véhicules. Pour ces données, le garage est responsable de
              traitement et Nexora Solutions agit uniquement comme sous-traitant, sur
              instruction du garage, dans le cadre du contrat conclu avec lui. Nous
              n&rsquo;utilisons jamais ces données à nos propres fins, et notamment jamais à des
              fins de prospection.
              <br />
              Les personnes concernées par ces données exercent leurs droits auprès du garage
              qui les a saisies.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              4. Mesure d&rsquo;audience et traceurs
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Ce site ne dépose aucun cookie ni traceur autre que ceux strictement nécessaires
              à son fonctionnement. La mesure d&rsquo;audience utilisée ne pose aucun identifiant
              persistant chez le visiteur et ne permet pas de le suivre d&rsquo;une visite à
              l&rsquo;autre. Aucun profilage n&rsquo;est réalisé et aucune donnée n&rsquo;est transmise à
              un service tiers à des fins publicitaires.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Prestataires techniques</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Nous faisons appel aux prestataires suivants, qui peuvent héberger ou traiter des
              données pour notre compte :
            </p>
            <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed text-muted-foreground">
              <li>
                <span className="text-foreground">Vercel Inc.</span> (États-Unis) — hébergement
                du site et de l&rsquo;application.
              </li>
              <li>
                <span className="text-foreground">Supabase</span> (hébergé dans l&rsquo;Union
                européenne) — base de données.
              </li>
              <li>
                <span className="text-foreground">Brevo</span> — envoi des e-mails liés à la
                connexion (lien de connexion, réinitialisation).
              </li>
            </ul>
            <p className="text-base leading-relaxed text-muted-foreground">
              Lorsque des données sont hébergées hors de l&rsquo;Union européenne, le transfert
              est encadré par les garanties prévues par le règlement général sur la protection
              des données.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Sécurité</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Les accès au logiciel sont protégés par authentification. Les données de chaque
              garage sont isolées de celles des autres garages au niveau de la base de
              données. Les liens transmis aux clients d&rsquo;un garage reposent sur des jetons
              aléatoires, expirent et peuvent être révoqués par le garage ; ils ne contiennent
              aucune donnée identifiante dans leur adresse.
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Vos droits</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Vous disposez d&rsquo;un droit d&rsquo;accès, de rectification, d&rsquo;effacement, de
              limitation et d&rsquo;opposition, ainsi que d&rsquo;un droit à la portabilité de vos
              données. Écrivez à{" "}
              <a href="mailto:nexorasolutions.france@gmail.com" className="text-primary hover:underline">
                nexorasolutions.france@gmail.com
              </a>{" "}
              : nous répondons dans un délai d&rsquo;un mois.
              <br />
              Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
              réclamation auprès de la Commission nationale de l&rsquo;informatique et des
              libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07,{" "}
              <a href="https://www.cnil.fr" className="text-primary hover:underline">
                www.cnil.fr
              </a>
              .
            </p>
          </section>

          <section className="mt-10 space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Modification</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Cette politique peut être mise à jour. La date figurant en tête indique la
              dernière version.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
