import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

// Confidentialité de Nexora Auto. Ce texte ne décrit que des traitements
// réellement en place, vérifiés dans le code et sur les deux environnements
// (voir docs/architecture/nexora-auto-donnees-personnelles.md). Aucune durée
// de conservation n'y est annoncée tant qu'aucun mécanisme ne l'applique :
// ce qui n'est pas décidé est dit comme tel.

export const metadata: Metadata = {
  title: "Confidentialité — Nexora Auto",
  description: "Ce que Nexora Auto enregistre, où, et vos droits.",
  alternates: { canonical: "/auto/confidentialite" },
}

const CONTACT = "nexorasolutions.france@gmail.com"

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{titre}</h2>
      {children}
    </section>
  )
}

export default function ConfidentialiteAutoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between gap-2 px-4">
          <Link href="/auto" className="flex shrink-0 items-center gap-2 rounded-lg">
            <Image src="/logo-nexora.png" alt="" width={240} height={116} className="h-8 w-8 object-contain" />
            <span className="font-display text-[17px] font-bold tracking-tight text-foreground">Nexora</span>
          </Link>
          <Link href="/auto/compte" className="rounded-lg px-2 py-2 text-sm font-semibold text-primary hover:bg-secondary">
            Mon compte
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-20 pt-8">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-foreground">
          Confidentialité de Nexora Auto
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 17 septembre 2026.</p>

        <div className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Nexora Auto est en bêta. Cette page décrit ce que l&rsquo;application fait
          aujourd&rsquo;hui. Les points encore à arrêter sont écrits comme tels, plutôt
          qu&rsquo;annoncés à la place d&rsquo;une décision.
        </div>

        <Section titre="Qui est responsable">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Baptiste Papoul, entrepreneur individuel, exerçant sous le nom Nexora Solutions,
            21 rue de l&rsquo;École, 52100 Saint-Dizier, SIREN 108 995 788. Pour Nexora Auto,
            vous créez vous-même votre compte et votre dossier : Nexora Solutions est
            responsable du traitement de vos données. Contact :{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold text-primary hover:underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>

        <Section titre="Ce que Nexora Auto enregistre">
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">Votre compte</strong> : votre adresse e-mail et votre
              mot de passe (que nous ne voyons jamais : il est haché par notre prestataire
              d&rsquo;authentification), les dates de création, de confirmation et de dernière
              connexion.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Vos voitures</strong> : marque, modèle, année,
              énergie, motorisation, immatriculation, date de première mise en circulation,
              intervalles d&rsquo;entretien.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Ce que vous enregistrez</strong> : kilométrages,
              interventions (date, compteur, professionnel, montant, détail), tâches,
              rappels reportés, préférences d&rsquo;affichage.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Vos documents</strong> : les fichiers que vous
              déposez (factures, procès-verbaux de contrôle technique…) et ce qu&rsquo;ils
              contiennent.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Pendant la bêta</strong> : la liste des adresses
              invitées, avec une courte note interne, uniquement pour ouvrir l&rsquo;accès.
              Ajouter une adresse n&rsquo;envoie aucun message.
            </li>
          </ul>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Ces informations en disent plus qu&rsquo;il n&rsquo;y paraît : une immatriculation, le nom
            d&rsquo;un garage ou des montants renseignent sur vos habitudes. C&rsquo;est pourquoi
            personne d&rsquo;autre que vous n&rsquo;y accède.
          </p>
        </Section>

        <Section titre="À quoi cela sert">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            À tenir le dossier de vos voitures, calculer ce qui est à prévoir, additionner
            vos dépenses, préparer un export, et — si vous le demandez — préremplir une
            intervention à partir d&rsquo;une facture PDF. La base légale est l&rsquo;exécution du
            service que vous avez demandé. Rien n&rsquo;est enregistré sans votre confirmation :
            aucune décision automatique n&rsquo;est prise à votre sujet.
          </p>
        </Section>

        <Section titre="La lecture de vos factures">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Quand vous ajoutez une facture PDF, le texte du fichier est lu par nos serveurs
            pour vous proposer l&rsquo;intervention, le kilométrage et le montant.{" "}
            <strong className="font-semibold text-foreground">
              Aucun service d&rsquo;intelligence artificielle extérieur n&rsquo;est utilisé
            </strong>{" "}
            : la lecture se fait par extraction du texte, sur nos serveurs, sans intervention
            humaine. Vous vérifiez la proposition avant d&rsquo;enregistrer, et vous pouvez la
            corriger entièrement. Nous conservons un journal technique de ces lectures
            (durée, réussite ou échec, champs corrigés) qui ne contient{" "}
            <strong className="font-semibold text-foreground">aucune information de vos factures</strong>.
          </p>
        </Section>

        <Section titre="Où vos données sont traitées">
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
            <li>Base de données, authentification et fichiers : Supabase, en Irlande.</li>
            <li>Application et lecture des factures : Vercel, en Irlande (région de Dublin).</li>
            <li>E-mails de compte (confirmation, mot de passe) : Brevo.</li>
          </ul>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Ces prestataires agissent pour notre compte. Nous ne vendons ni ne cédons vos
            données, et nous ne les utilisons pas pour de la publicité.
          </p>
        </Section>

        <Section titre="Qui peut voir votre dossier">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Vous seul. La séparation est faite par la base de données elle-même, pas
            seulement par l&rsquo;application : un autre compte connecté ne peut lire ni modifier
            votre dossier. Vos fichiers sont dans un espace privé et ne s&rsquo;ouvrent que par
            une adresse temporaire, valable cinq minutes, délivrée à votre session.
          </p>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Nous n&rsquo;ouvrons pas votre dossier pour l&rsquo;exploitation courante. Un accès
            technique reste possible pour répondre à votre demande ou réparer un incident ;
            en dehors de ces deux cas, nous n&rsquo;y allons pas.
          </p>
        </Section>

        <Section titre="Combien de temps">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Vos données restent tant que votre compte existe : un carnet d&rsquo;entretien n&rsquo;a
            d&rsquo;intérêt que dans la durée. Vous pouvez à tout moment supprimer un document,
            une intervention, un relevé ou une voiture : la suppression est immédiate.
          </p>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Aucune suppression automatique n&rsquo;est en place aujourd&rsquo;hui : nous ne supprimons
            donc rien de votre dossier sans que vous le demandiez. Les durées applicables aux
            comptes restés longtemps sans connexion ne sont pas encore arrêtées ; elles
            seront écrites ici lorsqu&rsquo;elles le seront, et le mécanisme qui les applique
            existera avant l&rsquo;annonce. Les journaux techniques de nos prestataires suivent
            leurs propres durées, que nous ne réglons pas.
          </p>
        </Section>

        <Section titre="Sur votre appareil">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Nexora Auto garde sur votre navigateur ce qui est strictement nécessaire : votre
            session, la voiture que vous consultez, et le brouillon d&rsquo;une facture en cours
            de vérification (sept jours au plus, effacé à l&rsquo;enregistrement et à la
            déconnexion). Aucun traceur publicitaire. Un export est préparé sur votre
            appareil : rien n&rsquo;est envoyé.
          </p>
        </Section>

        <Section titre="Vos droits">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Vous pouvez consulter et corriger votre dossier à tout moment dans
            l&rsquo;application, supprimer ce que vous voulez, et exporter le dossier d&rsquo;une
            voiture. La suppression du compte lui-même n&rsquo;est pas encore possible depuis
            l&rsquo;application : écrivez à{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold text-primary hover:underline">
              {CONTACT}
            </a>{" "}
            depuis l&rsquo;adresse de votre compte, et elle sera faite à la main. Vous disposez
            aussi des droits d&rsquo;accès, de rectification, d&rsquo;effacement, de limitation,
            d&rsquo;opposition et de portabilité, et pouvez saisir la CNIL.
          </p>
        </Section>

        <Section titre="Ce que Nexora Auto ne fait pas">
          <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
            <li>Aucun rappel n&rsquo;est envoyé hors de l&rsquo;application : ni e-mail, ni SMS.</li>
            <li>Aucune réservation, aucun paiement, aucune mise en relation avec un garage.</li>
            <li>Aucune donnée n&rsquo;est transmise à un service d&rsquo;intelligence artificielle.</li>
            <li>Aucune identification par plaque auprès d&rsquo;un service extérieur.</li>
          </ul>
        </Section>

        <Section titre="Une précaution">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Pendant la bêta, nous vous conseillons de ne pas déposer de pièce d&rsquo;identité.
            Une facture, un procès-verbal de contrôle technique ou un carnet d&rsquo;entretien
            suffisent à tenir le dossier.
          </p>
        </Section>

        <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
          Pour Nexora Pro, le logiciel des garages, le rôle de Nexora Solutions est
          différent : voir la{" "}
          <Link href="/confidentialite" className="font-semibold text-primary hover:underline">
            politique de confidentialité du site
          </Link>
          .
        </p>

        <Link href="/auto" className="mt-8 inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-primary hover:bg-secondary">
          Retour à Nexora Auto
        </Link>
      </main>
    </div>
  )
}
