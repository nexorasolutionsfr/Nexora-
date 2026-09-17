"use client";

// Briques d'interface partagées par les écrans Nexora Auto : en-tête, cadre de
// page, plaque, pastille d'échéance, alerte, squelette, et les classes des
// champs et boutons. Mobile d'abord : champs en 16 px (pas de zoom forcé sur
// iPhone), cibles tactiles de 48 px.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, Car, CircleAlert, LayoutGrid, LoaderCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { effacerBrouillons, stockageNavigateur } from "@/lib/auto/brouillon";
import { afficherImmatriculation } from "@/lib/auto/immatriculation";

export const champ =
  "block w-full rounded-xl border border-input bg-card px-3.5 py-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-3 focus:ring-primary/15 disabled:opacity-60 aria-invalid:border-destructive";
export const etiquette = "mb-1.5 block text-sm font-medium text-foreground";
export const aide = "mt-1.5 text-[13px] leading-snug text-muted-foreground";
export const boutonPrincipal =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:translate-y-px disabled:pointer-events-none disabled:opacity-60";
export const boutonSecondaire =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-base font-semibold text-foreground transition hover:bg-muted active:translate-y-px disabled:pointer-events-none disabled:opacity-60";
export const boutonLien =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-primary transition hover:bg-secondary disabled:opacity-60";
// Un choix parmi quelques-uns (voiture, période, façon de faire) : 36 px de haut au moins.
export const puce = "inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-left text-sm font-medium transition";
export const puceEtat = (actif) => (actif ? "border-primary bg-secondary text-primary" : "border-border bg-card text-foreground hover:bg-muted");
export const iconeLigne = "@max-[16rem]:hidden";
export const carte = "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,27,51,0.04)]";
// Une carte qui contient une liste : chaque ligne porte sa propre marge.
// (Ajouter « p-0 » à `carte` ne suffit pas : Tailwind range p-0 avant p-4.)
// `@container` : quand le texte est agrandi, la largeur mesurée en rem
// diminue et les icônes décoratives des lignes s'effacent (`iconeLigne`).
export const carteListe = "@container divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,27,51,0.04)]";

// La session Supabase de la personne. `undefined` tant qu'on ne sait pas
// encore, `null` si personne n'est connecté.
// Déconnexion demandée par la personne : les écrans privés ne la renvoient
// pas vers « Connectez-vous pour reprendre là où vous en étiez » ; elle
// revient à l'accueil. Une session expirée, elle, redirige toujours.
let deconnexionDemandee = false;
export const deconnexionVolontaire = () => deconnexionDemandee;

export function useSessionAuto() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    let actif = true;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) deconnexionDemandee = false;
      if (actif) setSession(data.session ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_evenement, s) => {
      if (s) deconnexionDemandee = false;
      if (actif) setSession(s ?? null);
    });
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return session;
}

// Après un envoi refusé : le focus va au premier champ à corriger. Au clavier
// comme au lecteur d'écran, l'erreur est lue avec son champ (aria-describedby).
export function focaliserPremiereErreur(formulaire) {
  requestAnimationFrame(() => formulaire?.querySelector?.('[aria-invalid="true"]')?.focus());
}

// La voiture que la personne consulte, conservée pendant la session du
// navigateur : « Services » et « Ajouter une facture » la reprennent. Une
// voiture archivée ou supprimée est simplement ignorée par ces écrans.
const CLE_VOITURE_COURANTE = "nexora-auto-voiture-courante";

export function memoriserVoitureCourante(id) {
  try {
    if (id) sessionStorage.setItem(CLE_VOITURE_COURANTE, id);
  } catch {
    // Stockage indisponible (navigation privée stricte) : sans conséquence.
  }
}

export function voitureCourante() {
  try {
    return sessionStorage.getItem(CLE_VOITURE_COURANTE);
  } catch {
    return null;
  }
}

// Les trois espaces de la personne connectée.
const ONGLETS = [
  { href: "/auto", libelle: "Mon garage", icone: Car, actif: (chemin) => chemin === "/auto" || chemin.startsWith("/auto/vehicules") },
  { href: "/auto/a-prevoir", libelle: "À prévoir", icone: CalendarCheck, actif: (chemin) => chemin.startsWith("/auto/a-prevoir") },
  { href: "/auto/services", libelle: "Services", icone: LayoutGrid, actif: (chemin) => chemin.startsWith("/auto/services") },
];

export function EnteteAuto({ session }) {
  const router = useRouter();
  const chemin = usePathname() ?? "";
  const [sortie, setSortie] = useState(false);

  async function seDeconnecter() {
    setSortie(true);
    deconnexionDemandee = true;
    // Aucun brouillon de facture ne reste sur l'appareil après la sortie.
    effacerBrouillons({ stockage: stockageNavigateur() });
    await supabase.auth.signOut();
    router.replace("/auto");
    setSortie(false);
  }

  return (
    <header className="@container sticky top-0 z-20 print:hidden border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 w-full max-w-xl flex-wrap items-center justify-between gap-x-2 px-4">
        <Link href="/auto" className="flex shrink-0 items-center gap-2 rounded-lg">
          <Image src="/logo-nexora.png" alt="" width={240} height={116} className="h-8 w-8 object-contain" priority />
          <span className="font-display text-[17px] font-bold tracking-tight text-foreground">Nexora</span>
        </Link>
        {session ? (
          <button type="button" onClick={seDeconnecter} disabled={sortie} className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
            Se déconnecter
          </button>
        ) : session === null ? (
          <Link href="/auto/connexion" className={boutonLien}>
            Se connecter
          </Link>
        ) : null}
      </div>
      {session ? (
        // Texte agrandi : les onglets passent à la ligne plutôt que de sortir de l'écran.
        <nav aria-label="Espaces" className="mx-auto flex w-full max-w-xl flex-wrap gap-1 px-2 pb-2 min-[360px]:px-3">
          {ONGLETS.map(({ href, libelle, icone: Icone, actif }) => {
            const courant = actif(chemin);
            return (
              <Link
                key={href}
                href={href}
                aria-current={courant ? "page" : undefined}
                className={`inline-flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-2 text-sm font-semibold transition min-[360px]:px-2 ${courant ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {/* Trois onglets sur un écran de 320 px : les icônes cèdent la place. */}
                <Icone className="hidden size-4 min-[360px]:block @max-[22rem]:hidden" aria-hidden="true" />
                {libelle}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

export function PageAuto({ session, children, large = false }) {
  return (
    <>
      <a href="#contenu" className="sr-only rounded-lg bg-card text-sm font-semibold text-primary shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <EnteteAuto session={session} />
      <main id="contenu" tabIndex={-1} className={`mx-auto w-full ${large ? "max-w-2xl" : "max-w-xl"} px-4 pb-24 pt-6 outline-none`}>
        {children}
      </main>
    </>
  );
}

// Plaque française : bandeau bleu à gauche, caractères espacés.
export function Plaque({ valeur, taille = "normale" }) {
  if (!valeur) return null;
  const grand = taille === "grande";
  return (
    <span className={`inline-flex shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-md border border-slate-300 bg-white font-mono font-semibold tracking-wider text-slate-900 shadow-[0_1px_0_rgba(15,27,51,0.06)] ${grand ? "text-[15px]" : "text-[12px]"}`}>
      <span aria-hidden="true" className={`flex items-end justify-center bg-[#1E4FD8] font-sans font-bold text-white ${grand ? "w-4 pb-0.5 text-[10px]" : "w-3.5 pb-px text-[8px]"}`}>
        F
      </span>
      <span className={grand ? "px-2 py-1" : "px-1.5 py-0.5"}>{afficherImmatriculation(valeur)}</span>
    </span>
  );
}

const TONS = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  proche: "bg-amber-50 text-amber-900 ring-amber-600/25",
  depasse: "bg-red-50 text-red-800 ring-red-600/20",
  neutre: "bg-slate-100 text-slate-700 ring-slate-500/15",
};

export function Pastille({ ton = "neutre", children }) {
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONS[ton] ?? TONS.neutre}`}>
      {children}
    </span>
  );
}

export function Alerte({ children, ton = "erreur", action }) {
  const couleurs = ton === "erreur" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <div role={ton === "erreur" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${couleurs}`}>
      {ton === "erreur" ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{children}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function Chargement({ texte = "Chargement…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {texte}
    </div>
  );
}

// Un squelette qui a la forme de ce qu'il annonce : des cartes de voiture.
export function SqueletteVehicules() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className={`${carte} animate-pulse`}>
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-3 h-4 w-24 rounded bg-muted" />
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-28 rounded-full bg-muted" />
            <div className="h-6 w-24 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
