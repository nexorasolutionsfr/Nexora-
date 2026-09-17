"use client";

// « Compte » : qui est connecté, ce que Nexora affiche, ce qu'il conserve, et
// la sortie. Aucun réglage qui n'agit sur rien : les envois hors de
// l'application n'existent pas, ils ne sont donc pas proposés.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { HORIZONS_JOURS, HORIZON_PAR_DEFAUT } from "@/components/auto/aPrevoir";
import { useModeAcces } from "@/components/auto/acces";
import {
  Alerte,
  Chargement,
  PageAuto,
  boutonSecondaire,
  carte,
  carteListe,
  deconnecterAuto,
  iconeLigne,
  puce,
  puceEtat,
  useSessionAuto,
} from "@/components/auto/elements";

export const ADRESSE_CONTACT = "nexorasolutions.france@gmail.com";

export default function Compte() {
  const session = useSessionAuto();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/auto/connexion?suite=/auto/compte");
  }, [session, router]);

  return (
    <PageAuto session={session}>
      {session ? <MonCompte session={session} /> : <Chargement />}
    </PageAuto>
  );
}

function MonCompte({ session }) {
  const router = useRouter();
  const mode = useModeAcces();
  const [horizon, setHorizon] = useState(null);
  const [erreur, setErreur] = useState("");
  const [sortie, setSortie] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from("auto_preferences").select("horizon_jours").maybeSingle();
    if (error) {
      setErreur("Impossible de lire vos préférences.");
      return;
    }
    setHorizon(data?.horizon_jours ?? HORIZON_PAR_DEFAUT);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture des préférences au montage, puis réponse Supabase.
    charger();
  }, [charger]);

  async function changerHorizon(jours) {
    const precedent = horizon;
    setHorizon(jours);
    const { error } = await supabase
      .from("auto_preferences")
      .upsert({ proprietaire_id: session.user.id, horizon_jours: jours }, { onConflict: "proprietaire_id" });
    if (error) {
      setHorizon(precedent);
      setErreur("Ce réglage n'a pas pu être enregistré.");
    } else setErreur("");
  }

  async function sortir() {
    setSortie(true);
    await deconnecterAuto();
    router.replace("/auto");
  }

  return (
    <>
      <h1 className="mb-5 font-display text-[28px] font-bold tracking-tight text-foreground">Mon compte</h1>

      {erreur ? (
        <div className="mb-3">
          <Alerte>{erreur}</Alerte>
        </div>
      ) : null}

      <section aria-labelledby="titre-identite" className={carte}>
        <h2 id="titre-identite" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Votre compte
        </h2>
        <p className="mt-1.5 break-words font-semibold text-foreground">{session.user?.email}</p>
        {mode === "beta" ? (
          <p className="mt-1 text-sm text-muted-foreground">Nexora Auto est en bêta : l'accès est ouvert aux personnes invitées.</p>
        ) : null}
      </section>

      <section aria-labelledby="titre-affichage" className={`${carte} mt-3`}>
        <h2 id="titre-affichage" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ce que vous voyez dans « À prévoir »
        </h2>
        <p className="mt-1.5 text-[15px] text-foreground">Les échéances des prochains jours.</p>
        {horizon === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Nombre de jours affichés">
            {HORIZONS_JOURS.map((jours) => (
              <button
                key={jours}
                type="button"
                onClick={() => jours !== horizon && changerHorizon(jours)}
                aria-pressed={jours === horizon}
                className={`${puce} ${puceEtat(jours === horizon)}`}
              >
                {jours} jours
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
          Les échéances plus lointaines restent visibles dans « À prévoir » : ce réglage ne change que ce qui est mis en avant.
        </p>
      </section>

      <section aria-labelledby="titre-donnees" className="mt-6">
        <h2 id="titre-donnees" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vos données
        </h2>
        <ul className={carteListe}>
          <li>
            <Link href="/auto/confidentialite" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
              <ShieldCheck className={`${iconeLigne} size-5 shrink-0 text-primary`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">Confidentialité</span>
                <span className="block text-sm leading-snug text-muted-foreground">Ce que Nexora enregistre, où, et vos droits.</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link href="/auto/garage" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
              <Download className={`${iconeLigne} size-5 shrink-0 text-primary`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">Exporter un dossier</span>
                <span className="block text-sm leading-snug text-muted-foreground">Depuis le dossier d'une voiture. Rien n'est envoyé : le fichier est préparé sur votre appareil.</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        </ul>

        <div className={`${carte} mt-3`}>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
            Supprimer
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Vous pouvez supprimer vous-même, à tout moment, un document, une intervention, un relevé ou une voiture : depuis son dossier, la suppression est immédiate.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            La suppression du compte lui-même n'est pas encore possible depuis l'application. Écrivez à{" "}
            <a href={`mailto:${ADRESSE_CONTACT}`} className="font-semibold break-words text-primary hover:underline">
              {ADRESSE_CONTACT}
            </a>{" "}
            depuis l'adresse de votre compte, et elle sera faite à la main.
          </p>
        </div>
      </section>

      <div className="mt-6">
        <button type="button" onClick={sortir} disabled={sortie} className={boutonSecondaire}>
          <LogOut className="size-4" aria-hidden="true" />
          {sortie ? "Déconnexion…" : "Se déconnecter"}
        </button>
        <p className="mt-2 text-center text-[13px] text-muted-foreground">
          Vos brouillons de facture en cours sur cet appareil sont effacés en même temps.
        </p>
      </div>
    </>
  );
}
