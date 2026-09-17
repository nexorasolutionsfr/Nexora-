"use client";

// Connexion et création de compte Nexora Auto.
//
// Un compte Nexora Auto est un compte Supabase ordinaire, marqué
// `espace: "auto"` dans ses métadonnées. Tous les liens envoyés par e-mail
// ramènent dans Nexora Auto, jamais dans le tableau de bord des garages.
// Les décisions sur les liens expirés et le renvoi d'e-mail sont celles,
// déjà testées, de components/connexion/.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LoaderCircle, MailCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { adresseSansErreurAuth, decisionFragment, erreurAuthDansFragment, messageLienEchoue } from "@/components/connexion/lienConfirmation";
import { DELAI_RENVOI_SECONDES, libelleRenvoi, messageRenvoi, secondesAvantRenvoi } from "@/components/connexion/renvoiConfirmation";
import { Alerte, PageAuto, boutonLien, boutonPrincipal, boutonSecondaire, carte, champ, etiquette, useSessionAuto } from "@/components/auto/elements";
import { useModeAcces } from "@/components/auto/acces";
import { cheminSuite, messageConnexion } from "@/components/auto/format";

const MODES = {
  connexion: { titre: "Se connecter", texte: "Retrouvez vos voitures.", bouton: "Se connecter" },
  inscription: { titre: "Créer votre compte", texte: "Gratuit. Il vous permet de retrouver vos voitures sur tous vos appareils.", bouton: "Créer mon compte" },
  oubli: { titre: "Mot de passe oublié", texte: "Indiquez votre adresse : vous recevrez un lien pour en choisir un nouveau.", bouton: "Recevoir le lien" },
  "nouveau-mot-de-passe": { titre: "Nouveau mot de passe", texte: "Choisissez un mot de passe d'au moins 8 caractères.", bouton: "Enregistrer" },
};

export default function ConnexionAuto() {
  const params = useSearchParams();
  const router = useRouter();
  const suite = cheminSuite(params.get("suite"));
  const session = useSessionAuto();
  // Bêta privée : la création de compte passe par le serveur, qui n'inscrit
  // que les adresses invitées sans jamais dire lesquelles le sont.
  const beta = useModeAcces() === "beta";
  const [demandeBeta, setDemandeBeta] = useState(false);

  const [mode, setMode] = useState(MODES[params.get("mode")] ? params.get("mode") : "connexion");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState(null);
  const [aVerifier, setAVerifier] = useState("");
  const [prochainRenvoiA, setProchainRenvoiA] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [erreurLien, setErreurLien] = useState(null);

  // Un lien expiré ou déjà servi : l'expliquer, ou l'effacer si la session est là.
  useEffect(() => {
    if (session === undefined) return;
    const decision = decisionFragment({ fragment: window.location.hash, session });
    if (decision === "nettoyer") {
      window.history.replaceState(window.history.state, "", adresseSansErreurAuth(window.location.href));
    } else if (decision === "expliquer") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du fragment d'adresse (lien d'e-mail expiré), système extérieur à React.
      setErreurLien(erreurAuthDansFragment(window.location.hash));
    }
  }, [session]);

  // Déjà connecté : on continue, sauf pour choisir un nouveau mot de passe.
  useEffect(() => {
    if (session && mode !== "nouveau-mot-de-passe") router.replace(suite);
  }, [session, mode, router, suite]);

  useEffect(() => {
    if (!aVerifier) return undefined;
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuterie);
  }, [aVerifier]);

  function origine() {
    return window.location.origin;
  }

  function changerMode(nouveau) {
    setMode(nouveau);
    setErreur("");
    setInfo(null);
    setErreurLien(null);
  }

  async function soumettre(evenement) {
    evenement.preventDefault();
    setErreur("");
    setInfo(null);
    const adresse = email.trim();
    if (mode !== "nouveau-mot-de-passe" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
      setErreur("Indiquez une adresse e-mail valide.");
      return;
    }
    if ((mode === "inscription" || mode === "nouveau-mot-de-passe") && motDePasse.length < 8) {
      setErreur("Choisissez un mot de passe d'au moins 8 caractères.");
      return;
    }
    if (mode === "connexion" && !motDePasse) {
      setErreur("Indiquez votre mot de passe.");
      return;
    }

    setEnCours(true);
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({ email: adresse, password: motDePasse });
        if (error) {
          setErreur(messageConnexion(error));
          if (error.code === "email_not_confirmed") setAVerifier(adresse);
        }
      } else if (mode === "inscription" && beta) {
        const reponse = await fetch("/api/auto/inscription", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: adresse, motDePasse, suite }),
        });
        const corps = await reponse.json().catch(() => ({}));
        if (corps.etat === "demande_recue") {
          setDemandeBeta(true);
          setAVerifier(adresse);
        } else if (corps.etat === "ferme") setErreur("Nexora Auto n'est pas encore ouvert.");
        else if (corps.champ === "mot_de_passe") setErreur("Choisissez un mot de passe de 8 à 72 caractères.");
        else if (corps.champ === "email") setErreur("Indiquez une adresse e-mail valide.");
        else setErreur("La demande n'a pas abouti. Vérifiez votre connexion et réessayez.");
      } else if (mode === "inscription") {
        const { data, error } = await supabase.auth.signUp({
          email: adresse,
          password: motDePasse,
          options: { emailRedirectTo: `${origine()}${suite}`, data: { espace: "auto" } },
        });
        if (error) setErreur(messageConnexion(error));
        else if (!data.session) {
          setAVerifier(adresse);
          setProchainRenvoiA(Date.now() + DELAI_RENVOI_SECONDES * 1000);
        }
      } else if (mode === "oubli") {
        const { error } = await supabase.auth.resetPasswordForEmail(adresse, {
          redirectTo: `${origine()}/auto/connexion?mode=nouveau-mot-de-passe`,
        });
        if (error) setErreur(messageConnexion(error));
        else setInfo({ ton: "succes", texte: `Si un compte existe pour ${adresse}, un e-mail vient d'être demandé. Ouvrez le lien qu'il contient.` });
      } else {
        const { error } = await supabase.auth.updateUser({ password: motDePasse });
        if (error) setErreur(messageConnexion(error));
        else router.replace("/auto");
      }
    } catch {
      setErreur("La demande n'a pas abouti. Vérifiez votre connexion et réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  async function renvoyer() {
    setEnCours(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: aVerifier,
      options: { emailRedirectTo: `${origine()}${suite}` },
    });
    setEnCours(false);
    setProchainRenvoiA(Date.now() + DELAI_RENVOI_SECONDES * 1000);
    setInfo(messageRenvoi(error, aVerifier));
  }

  const libelles = MODES[mode];
  const secondes = secondesAvantRenvoi(prochainRenvoiA, maintenant);
  const lienMotDePasseMort = mode === "nouveau-mot-de-passe" && session === null;

  return (
    <PageAuto session={undefined}>
      <Link href="/auto" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Accueil
      </Link>

      {aVerifier ? (
        <section className={`${carte} mt-4 px-5 py-7`}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">Vérifiez vos e-mails</h1>
          {demandeBeta ? (
            <p className="mt-2 break-words text-[15px] leading-relaxed text-muted-foreground">
              Si <strong className="font-semibold text-foreground">{aVerifier}</strong> est invitée à la bêta privée, un lien d'activation vient de lui être envoyé. Ouvrez-le : vous
              reviendrez ici, connecté.
            </p>
          ) : (
            <p className="mt-2 break-words text-[15px] leading-relaxed text-muted-foreground">
              Un lien d'activation a été demandé pour <strong className="font-semibold text-foreground">{aVerifier}</strong>. Ouvrez-le : vous reviendrez ici, connecté.
            </p>
          )}

          {/* Le cas qui bloque vraiment les gens, et que la protection contre
              l'énumération d'adresses nous interdit de leur dire nommément :
              cette adresse a déjà un compte, donc aucun e-mail n'est parti.
              On l'énonce pour tout le monde — cela ne révèle rien — avec le
              bouton qui débloque. Constaté sur la première inscription réelle,
              le 18 septembre 2026. */}
          <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="text-[15px] font-semibold text-foreground">Aucun e-mail au bout de quelques minutes ?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Le plus souvent, c'est que cette adresse a <strong className="font-semibold text-foreground">déjà un compte</strong> : dans ce cas rien n'est envoyé, et il faut se
              connecter. Sinon, vérifiez les indésirables, puis l'orthographe de l'adresse.
            </p>
            <button
              type="button"
              onClick={() => {
                setAVerifier("");
                setDemandeBeta(false);
                setEmail(aVerifier);
                changerMode("connexion");
              }}
              className={`${boutonSecondaire} mt-3`}
            >
              Se connecter avec cette adresse
            </button>
            <button type="button" onClick={() => changerMode("oubli")} className={`${boutonLien} mt-1`}>
              J'ai oublié mon mot de passe
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {info ? <Alerte ton={info.ton === "erreur" ? "erreur" : "succes"}>{info.texte}</Alerte> : null}
            {demandeBeta ? null : (
              <button type="button" onClick={renvoyer} disabled={enCours || secondes > 0} className={boutonSecondaire}>
                {libelleRenvoi({ enCours, secondesRestantes: secondes })}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAVerifier("");
                setDemandeBeta(false);
                changerMode(mode === "inscription" ? "inscription" : "connexion");
              }}
              className={boutonLien}
            >
              Modifier l'adresse
            </button>
          </div>
        </section>
      ) : (
        <section className="mt-4">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">{libelles.titre}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {mode === "connexion" && suite !== "/auto"
              ? "Connectez-vous pour reprendre là où vous en étiez."
              : mode === "inscription" && beta
                ? "Nexora Auto est en bêta privée : la création de compte est réservée aux adresses invitées."
                : libelles.texte}
          </p>

          <div className="mt-5 space-y-3">
            {erreurLien ? <Alerte>{messageLienEchoue(erreurLien)}</Alerte> : null}
            {lienMotDePasseMort ? (
              <Alerte action={<button type="button" onClick={() => changerMode("oubli")} className="text-sm font-semibold underline underline-offset-2">Demander un nouveau lien</button>}>
                Ce lien de changement de mot de passe n'est plus valable.
              </Alerte>
            ) : null}
            {info ? <Alerte ton={info.ton === "erreur" ? "erreur" : "succes"}>{info.texte}</Alerte> : null}
          </div>

          {lienMotDePasseMort ? null : (
            <form onSubmit={soumettre} noValidate className="mt-5 space-y-4">
              {mode !== "nouveau-mot-de-passe" ? (
                <div>
                  <label htmlFor="auto-email" className={etiquette}>
                    Adresse e-mail
                  </label>
                  <input
                    id="auto-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={champ}
                    placeholder="prenom.nom@exemple.fr"
                  />
                </div>
              ) : null}

              {mode !== "oubli" ? (
                <div>
                  <label htmlFor="auto-mot-de-passe" className={etiquette}>
                    {mode === "connexion" ? "Mot de passe" : "Nouveau mot de passe"}
                  </label>
                  <div className="relative">
                    <input
                      id="auto-mot-de-passe"
                      type={voirMotDePasse ? "text" : "password"}
                      autoComplete={mode === "connexion" ? "current-password" : "new-password"}
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      className={`${champ} pr-12`}
                      minLength={mode === "connexion" ? undefined : 8}
                      aria-describedby={mode === "connexion" ? undefined : "auto-mot-de-passe-aide"}
                    />
                    <button
                      type="button"
                      onClick={() => setVoirMotDePasse((v) => !v)}
                      className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
                      aria-label={voirMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {voirMotDePasse ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                    </button>
                  </div>
                  {mode !== "connexion" ? (
                    <p id="auto-mot-de-passe-aide" className="mt-1.5 text-[13px] text-muted-foreground">
                      Au moins 8 caractères.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {erreur ? <Alerte>{erreur}</Alerte> : null}

              <button type="submit" disabled={enCours} className={boutonPrincipal}>
                {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
                {libelles.bouton}
              </button>

              {/* À la création du compte : ce que devient ce qu'on enregistre,
                  lisible avant de s'inscrire. */}
              {mode === "inscription" ? (
                <p className="text-[13px] leading-snug text-muted-foreground">
                  En créant votre compte, vos données sont traitées comme décrit dans la{" "}
                  <Link href="/auto/confidentialite" className="font-semibold text-primary hover:underline">
                    politique de confidentialité de Nexora Auto
                  </Link>
                  .
                </p>
              ) : null}
            </form>
          )}

          <div className="mt-6 flex flex-col items-start gap-1 border-t border-border pt-4">
            {mode === "connexion" ? (
              <>
                <button type="button" onClick={() => changerMode("inscription")} className={boutonLien}>
                  {beta ? "Invité à la bêta ? Créer votre compte" : "Pas encore de compte ? Créer un compte"}
                </button>
                <button type="button" onClick={() => changerMode("oubli")} className={boutonLien}>
                  Mot de passe oublié ?
                </button>
              </>
            ) : (
              <button type="button" onClick={() => changerMode("connexion")} className={boutonLien}>
                {mode === "inscription" ? "Déjà un compte ? Se connecter" : "Revenir à la connexion"}
              </button>
            )}
          </div>
        </section>
      )}
    </PageAuto>
  );
}
