"use client";

// « Aujourd'hui » : la voiture consultée, la prochaine action **si elle existe**,
// et quelques gestes utiles. Rien d'autre.
//
// Deux choses que cet écran ne fait jamais :
//
// - **rassurer sur ce qu'il ne sait pas.** Nexora ne connaît que ce qui est
//   enregistré ; l'absence d'alerte n'est pas un bilan de santé ;
// - **mettre une échéance lointaine en action du jour.** Un contrôle technique
//   dans 21 mois se résume plus bas ; la place revient à ce qui aide
//   maintenant. Quand rien ne presse, l'écran reste calme.
//
// Les règles de choix sont pures et testées : lib/auto/aujourdhui.js.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, CircleAlert, FileText, Gauge, Plus, ReceiptText, Wrench } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { ajouterJours, aujourdhuiIso, dernierKilometrage, joursEntre } from "@/lib/auto/echeances";
import { estimerKilometrage } from "@/lib/auto/kilometrage";
import { choisirVoiture, etatAujourdhui, sollicitationKilometrage } from "@/lib/auto/aujourdhui";
import { construireAPrevoir, libelleFondement, pastilleElement } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import { VoitureAAjouter } from "@/components/auto/MonGarage";
import {
  Alerte,
  Chargement,
  PageAuto,
  Pastille,
  Plaque,
  boutonPrincipal,
  carte,
  carteListe,
  iconeLigne,
  memoriserVoitureCourante,
  puce,
  puceEtat,
  voitureCourante,
} from "@/components/auto/elements";
import { formaterDate, formaterKm } from "@/components/auto/format";

// La session vient de l'accueil, qui l'a déjà lue pour choisir entre la page
// de présentation et cet écran.
export default function Aujourdhui({ session }) {
  return (
    <PageAuto session={session}>
      {session === undefined ? <Chargement /> : <MaJournee session={session} />}
    </PageAuto>
  );
}

// « renseigné aujourd'hui », « il y a 3 jours », « le 12 juin 2026 » : la
// fraîcheur d'un relevé se lit d'un coup d'œil, et sert à ne pas le redemander.
function fraicheur(date, aujourdhui) {
  const jours = joursEntre(date, aujourdhui);
  if (!Number.isFinite(jours) || jours < 0) return `le ${formaterDate(date)}`;
  if (jours === 0) return "renseigné aujourd'hui";
  if (jours === 1) return "renseigné hier";
  if (jours <= 30) return `renseigné il y a ${jours} jours`;
  return `renseigné le ${formaterDate(date)}`;
}

function MaJournee({ session }) {
  const [dossiers, setDossiers] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [choisie, setChoisie] = useState(null);
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    setErreur(false);
    const lu = await chargerDossiers();
    if (lu.erreur) {
      setErreur(true);
      return;
    }
    setDossiers(lu);
    // La voiture consultée la dernière fois, sinon la principale.
    setChoisie((actuelle) => actuelle ?? choisirVoiture(lu.vehicules, voitureCourante())?.id ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du dossier au montage, puis réponse Supabase ; `charger` sert aussi au bouton « Recharger ».
    charger();
  }, [charger]);

  if (erreur)
    return (
      <Alerte
        action={
          <button type="button" onClick={charger} className="text-sm font-semibold underline underline-offset-2">
            Recharger
          </button>
        }
      >
        Impossible de charger votre dossier. Vérifiez votre connexion.
      </Alerte>
    );
  if (!dossiers) return <Chargement />;

  const actives = dossiers.vehicules.filter((v) => !v.archive_le);
  if (actives.length === 0)
    return (
      <>
        <h1 className="mb-5 font-display text-[28px] font-bold tracking-tight text-foreground">Bienvenue</h1>
        <VoitureAAjouter />
      </>
    );

  const vehicule = actives.find((v) => v.id === choisie) ?? choisirVoiture(actives, voitureCourante()) ?? actives[0];
  const aujourdhui = aujourdhuiIso();
  const { elements } = construireAPrevoir({
    vehicules: dossiers.vehicules,
    taches: dossiers.taches,
    reports: dossiers.reports,
    horizonJours: dossiers.horizonJours,
    aujourdhui,
  });
  const etat = etatAujourdhui({ elements, vehiculeId: vehicule.id, horizonJours: dossiers.horizonJours });
  const km = dernierKilometrage({ releves: vehicule.releves, historique: vehicule.historique });
  const estimation = estimerKilometrage({ releves: vehicule.releves, historique: vehicule.historique, aujourdhui });
  const compteur = sollicitationKilometrage({ elements, vehiculeId: vehicule.id, estimation });

  function changerVoiture(id) {
    memoriserVoitureCourante(id);
    setChoisie(id);
    setMessage("");
  }

  // « Plus tard » : le report vit en base, il tient d'un appareil à l'autre et
  // d'une session à l'autre.
  async function plusTard(element) {
    const { error } = await supabase
      .from("auto_rappels_reports")
      .upsert({ proprietaire_id: session.user.id, cle: element.cle, reporte_jusqu_au: ajouterJours(aujourdhui, 30) }, { onConflict: "proprietaire_id,cle" });
    if (error) return setMessage("Ce report n'a pas pu être enregistré.");
    setMessage("Entendu. Nexora n'y reviendra pas avant un mois.");
    await charger();
  }

  return (
    <>
      <h1 className="mb-4 font-display text-[28px] font-bold tracking-tight text-foreground">Aujourd'hui</h1>

      <MaVoiture vehicule={vehicule} km={km} aujourdhui={aujourdhui} actives={actives} onChoisir={changerVoiture} />

      {message ? (
        <div className="mb-3">
          <Alerte ton="succes">{message}</Alerte>
        </div>
      ) : null}

      {etat.principale?.urgence === "a_completer" ? (
        <Preparer etat={etat} vehicule={vehicule} onPlusTard={plusTard} />
      ) : etat.principale ? (
        <ActionPrincipale etat={etat} vehicule={vehicule} />
      ) : null}

      {etat.lointaines.length > 0 || (!etat.principale && etat.aCompleter.length > 0) ? (
        <Resume elements={etat.lointaines} aCompleter={etat.aCompleter} vehicule={vehicule} avecAction={Boolean(etat.principale)} />
      ) : null}

      <Acces etat={etat} vehicule={vehicule} compteur={compteur} />

      {etat.ailleurs.length > 0 ? <AilleursDansLeGarage elements={etat.ailleurs} onChoisir={changerVoiture} /> : null}
    </>
  );
}

// La voiture dont on parle, nommée en haut de l'écran, avec la fraîcheur de son
// compteur. Une seule voiture : pas de choix à faire.
function MaVoiture({ vehicule, km, aujourdhui, actives, onChoisir }) {
  return (
    <section aria-labelledby="titre-voiture" className={`${carte} mb-3`}>
      <Link
        href={`/auto/vehicules/${vehicule.id}`}
        onClick={() => onChoisir(vehicule.id)}
        className="-m-1 flex items-start justify-between gap-3 rounded-xl p-1 transition hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span id="titre-voiture" className="block font-display text-lg font-semibold leading-snug text-foreground">
            {vehicule.marque} {vehicule.modele}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            <Plaque valeur={vehicule.immatriculation} />
            <span>{km ? `${formaterKm(km.kilometrage)} · ${fraicheur(km.date, aujourdhui)}` : "Kilométrage à renseigner"}</span>
          </span>
        </span>
        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {actives.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3" role="group" aria-label="Choisir la voiture">
          {actives.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => v.id !== vehicule.id && onChoisir(v.id)}
              aria-pressed={v.id === vehicule.id}
              className={`${puce} ${puceEtat(v.id === vehicule.id)}`}
            >
              {v.marque} {v.modele}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// Une information manque. Par quoi commencer dépend de ce qui manque :
//
// - **l'entretien** : une facture de garage porte souvent la date et le
//   kilométrage de la dernière révision, et Nexora sait la lire. On commence
//   donc par le document — c'est ce qui demande le moins ;
// - **tout le reste** (mise en circulation, dernier contrôle) : aucun document
//   n'est lu automatiquement pour ça. Proposer « ajoutez une facture » serait
//   une fausse promesse. On demande directement la seule donnée qui débloque.
//
// Dans les deux cas : « Plus tard » existe, et il tient.
function Preparer({ etat, vehicule, onPlusTard }) {
  const { element } = etat.principale;
  const premiere = element.actions?.[0] ?? null;
  const parLeDocument = element.genre === "revision";

  return (
    <section aria-labelledby="titre-preparer" className={`${carte} border-l-4 border-l-primary/50`}>
      <p id="titre-preparer" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Préparons la suite
      </p>
      <h2 className="mt-1.5 font-display text-xl font-semibold leading-snug text-foreground">
        {parLeDocument ? "Votre prochain entretien" : element.titre}
      </h2>

      {parLeDocument ? (
        <>
          <p className="mt-1 text-[15px] leading-snug text-foreground">
            Ajoutez une facture de garage : Nexora y cherchera la date, le kilométrage et ce qui a été fait.
          </p>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
            Une facture ne porte pas toujours l'intervalle prévu par le constructeur. Si elle manque, Nexora vous le dira plutôt que de l'inventer.
          </p>
        </>
      ) : (
        <p className="mt-1 text-[15px] leading-snug text-foreground">{element.explication}</p>
      )}

      <div className="mt-4 space-y-2">
        {parLeDocument ? (
          <>
            <Link href={`/auto/factures/nouvelle?vehicule=${vehicule.id}`} className={boutonPrincipal}>
              <ReceiptText className="size-5" aria-hidden="true" />
              Ajouter une facture
            </Link>
            {premiere ? (
              <Link
                href={`/auto/vehicules/${vehicule.id}?action=${premiere.code}`}
                className="flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-primary transition hover:bg-secondary"
              >
                Je n'ai pas de facture : {premiere.libelle.charAt(0).toLowerCase()}{premiere.libelle.slice(1)}
              </Link>
            ) : null}
          </>
        ) : premiere ? (
          <Link href={`/auto/vehicules/${vehicule.id}?action=${premiere.code}`} className={boutonPrincipal}>
            {premiere.libelle}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => onPlusTard(element)}
          className="flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted"
        >
          Plus tard
        </button>
      </div>
    </section>
  );
}

// Les phrases d'en-tête, une par raison d'être en premier. Aucune ne porte de
// jugement sur l'état de la voiture.
const ENTETES = { depasse: "À faire sans attendre", proche: "À faire bientôt", horizon: "À prévoir" };

function ActionPrincipale({ etat, vehicule }) {
  const { element, urgence } = etat.principale;
  const pastille = pastilleElement(element, { avecSujet: false });
  const estTache = element.genre === "tache";
  // Une tâche se termine ou se reporte dans « À prévoir » : l'écran y renvoie
  // plutôt que de dupliquer ces gestes.
  const premiere = estTache ? null : element.actions?.[0] ?? null;

  return (
    <section aria-labelledby="titre-action" className={`${carte} border-l-4 ${urgence === "depasse" ? "border-l-red-500" : urgence === "proche" ? "border-l-amber-500" : "border-l-primary/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="titre-action" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {ENTETES[urgence] ?? ENTETES.horizon}
        </p>
        <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
      </div>

      <h2 className="mt-1.5 font-display text-xl font-semibold leading-snug text-foreground">{element.titre}</h2>
      <p className="mt-1 text-[15px] leading-snug text-foreground">{element.quand}</p>

      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground/80">{libelleFondement(element)}.</span>
        {element.explication ? ` ${element.explication}` : ""}
      </p>

      {element.alerte ? (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-red-800">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {element.alerte}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {premiere ? (
          <Link href={`/auto/vehicules/${vehicule.id}?action=${premiere.code}`} className={boutonPrincipal}>
            {premiere.libelle}
          </Link>
        ) : (
          <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}&element=${encodeURIComponent(element.cle)}`} className={boutonPrincipal}>
            Ouvrir cette échéance
          </Link>
        )}
        {element.serviceCode ? (
          <Link
            href={`/auto/services/${element.serviceCode}?vehicule=${vehicule.id}`}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary transition hover:bg-secondary"
          >
            Ce que comprend cette prestation
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// Ce qui est connu mais lointain : on le dit, on ne le met pas en action.
// La provenance est nommée : une date que vous avez saisie n'est pas une date
// que Nexora a lue sur un document.
function Resume({ elements, aCompleter = [], vehicule, avecAction }) {
  // Un écran calme ne doit pas laisser croire que tout est connu. Quand une
  // échéance n'est pas calculable, on le dit ici même — y compris lorsque la
  // demande a été reportée : le report tait le rappel, pas le trou.
  const inconnues = aCompleter.filter((el) => el.titre);
  return (
    <section aria-labelledby="titre-resume" className="mt-3">
      <h2 id="titre-resume" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ce que Nexora sait de cette voiture
      </h2>
      <ul className={carteListe}>
        {elements.map((el) => (
          <li key={el.cle} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 break-words font-semibold text-foreground">{el.titre}</span>
              <span className="text-sm text-muted-foreground">{el.delai}</span>
            </div>
            <p className="mt-0.5 break-words text-sm text-muted-foreground">{el.quand}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground/90">{libelleFondement(el)}.</p>
          </li>
        ))}
        {!avecAction && inconnues.length > 0
          ? inconnues.map((el) => (
              <li key={el.cle} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words font-semibold text-foreground">{el.titre}</span>
                  <span className="text-sm text-muted-foreground">inconnue</span>
                </div>
                {/* L'explication dit déjà ce qui manque : la redoubler d'un
                    « Nexora ne peut pas la calculer » n'ajoutait qu'un mot de
                    plus à lire. */}
                <p className="mt-0.5 break-words text-sm text-muted-foreground">
                  {el.explication || "Une information manque pour la calculer."}
                </p>
                {el.actions?.[0] ? (
                  <Link href={`/auto/vehicules/${vehicule.id}?action=${el.actions[0].code}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">
                    {el.actions[0].libelle}
                  </Link>
                ) : null}
              </li>
            ))
          : null}
      </ul>
    </section>
  );
}

// Les gestes, dits en toutes lettres — et seulement ceux qui servent.
function Acces({ etat, vehicule, compteur }) {
  const gestes = [
    { href: `/auto/factures/nouvelle?vehicule=${vehicule.id}`, icone: ReceiptText, titre: "Ajouter un document", texte: "Facture, procès-verbal, carte grise. Une facture PDF est lue automatiquement." },
    // Le compteur n'est proposé ici que s'il sert à une échéance. La saisie
    // reste évidemment possible à tout moment depuis la fiche de la voiture.
    ...(compteur === "utile"
      ? [{ href: `/auto/vehicules/${vehicule.id}?action=releve`, icone: Gauge, titre: "Mettre à jour le kilométrage", texte: "Votre prochaine révision se suit au compteur." }]
      : compteur === "a_verifier"
        ? [{ href: `/auto/vehicules/${vehicule.id}?action=verifier_kilometrage`, icone: Gauge, titre: "Vérifier vos kilométrages", texte: "Deux relevés se contredisent : tant qu'ils ne concordent pas, la révision n'est pas suivie au compteur." }]
        : []),
    { href: `/auto/vehicules/${vehicule.id}?action=intervention`, icone: Wrench, titre: "Enregistrer une révision", texte: "Ou toute autre intervention déjà réalisée." },
    { href: `/auto/vehicules/${vehicule.id}/dossier`, icone: FileText, titre: "Le dossier de ma voiture", texte: "Historique, documents et dépenses." },
  ];
  const { echeances, aCompleter } = etat.compteurs;

  return (
    <section aria-labelledby="titre-gestes" className="mt-6">
      <h2 id="titre-gestes" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Enregistrer ou consulter
      </h2>
      <ul className={carteListe}>
        {gestes.map(({ href, icone: Icone, titre, texte }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
              <span className={`${iconeLigne} flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary`}>
                <Icone className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{titre}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{texte}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Une date connue et une information absente ne se comptent pas ensemble. */}
      {echeances > 0 || aCompleter > 0 ? (
        <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}`} className={`${carte} mt-3 flex items-center gap-3 transition hover:border-primary/40`}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Tout ce qui est à prévoir</span>
            <span className="block text-sm text-muted-foreground">
              {[
                echeances > 0 ? `${echeances} ${echeances > 1 ? "échéances" : "échéance"}` : null,
                aCompleter > 0 ? `${aCompleter} ${aCompleter > 1 ? "informations à compléter" : "information à compléter"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <Link href="/auto/vehicules/nouveau" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-primary transition hover:bg-secondary">
        <Plus className="size-4" aria-hidden="true" />
        Ajouter une autre voiture
      </Link>
    </section>
  );
}

// Une échéance qui presse sur une autre voiture ne doit pas se perdre parce
// qu'on regarde celle-ci. Une ligne, pas une carte : c'est un signal, pas
// l'action du jour.
function AilleursDansLeGarage({ elements, onChoisir }) {
  return (
    <section aria-labelledby="titre-ailleurs" className="mt-6">
      <h2 id="titre-ailleurs" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Vos autres voitures
      </h2>
      <ul className={carteListe}>
        {elements.map((el) => {
          const pastille = pastilleElement(el, { avecSujet: false });
          return (
            <li key={el.cle}>
              <button
                type="button"
                onClick={() => onChoisir(el.vehicule.id)}
                className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-foreground">{el.vehicule.nom}</span>
                  <span className="block break-words text-sm text-muted-foreground">{el.titre}</span>
                </span>
                <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
