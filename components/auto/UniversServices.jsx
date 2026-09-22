"use client";

// Services : comprendre une prestation pour sa voiture, la garder dans ses
// prochaines actions, et voir tout de suite si elle est réservable.
//
// Consulter n'est pas réserver. Une fiche se lit avec ou sans dossier complet ;
// seule une offre réelle (auto_offres, lib/auto/offres.js) pourra un jour
// rendre une prestation réservable. Aujourd'hui il n'en existe aucune : l'écran
// le dit sobrement, sans formulaire que personne ne traiterait.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BatteryCharging, CalendarCheck, CalendarX2, Car, Check, ChevronRight, CircleAlert, CircleCheck, CircleDot, ClipboardCheck, Crosshair, Disc, Droplet, LifeBuoy, LoaderCircle, Minus, Plus, Snowflake, Sparkles, SprayCan, Stethoscope, ThermometerSnowflake, Wrench } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { LIBELLE_NON_DISPONIBLE, disponibiliteReservation } from "@/lib/auto/offres";
import { BESOINS, CONSTATS, DEPUIS, besoinParCode, immobilise, precisionsPour, prestationPour, resumeProbleme, securite } from "@/lib/auto/besoins";
import { etatEntretien } from "@/lib/auto/entretien";
import { construireAPrevoir } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import Preparation from "@/components/auto/Preparation";
import { Alerte, BoutonCopier, PageAuto, Pastille, Plaque, SqueletteVehicules, aide, boutonPrincipal, boutonSecondaire, carte, carteListe, champ, etiquette, iconeLigne, memoriserVoitureCourante, puce, puceEtat, useSessionAuto, voitureCourante } from "@/components/auto/elements";
import { ENERGIES, formaterDate, libelleDe, messageErreurAuto } from "@/components/auto/format";
import {
  MODES,
  UNIVERS,
  actionExistante,
  compatibilite,
  informationsService,
  peutAjouterAuxActions,
  remarquesVehicule,
  serviceParCode,
  servicesDuMode,
} from "@/components/auto/services";

const ICONES = {
  revision: Wrench,
  vidange: Droplet,
  freinage: Disc,
  batterie: BatteryCharging,
  diagnostic: Stethoscope,
  climatisation: Snowflake,
  pneus_remplacement: CircleDot,
  pneus_saisonniers: ThermometerSnowflake,
  geometrie: Crosshair,
  lavage_complet: Sparkles,
  detailing: SprayCan,
  controle_technique: ClipboardCheck,
  assistance_panne: LifeBuoy,
};


// Dossiers et offres lisibles. Sans session : rien à charger, le catalogue
// reste consultable. Une lecture d'offres en échec n'invente rien : sans
// offre lue, rien n'est réservable.
function useDonneesServices(session) {
  const [donnees, setDonnees] = useState(null);
  const charger = useCallback(async () => {
    const [dossiers, offres] = await Promise.all([
      chargerDossiers(),
      supabase.from("auto_offres").select("service_code, mode, codes_postaux, energies, valable_du, valable_jusqu_au, actif"),
    ]);
    setDonnees({ dossiers, offres: offres.error ? [] : offres.data });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement Supabase à l'ouverture et à la connexion ; l'état n'est posé qu'à la réponse, et `charger` sert aussi après chaque enregistrement.
    if (session) charger();
  }, [session, charger]);
  return [session === null ? { dossiers: null, offres: [] } : donnees, charger];
}

// La voiture demandée si elle est active, sinon celle consultée en dernier,
// sinon la principale.
function choisirVehicule(vehicules, id) {
  const actives = vehicules.filter((v) => !v.archive_le).sort((a, b) => Number(b.principal) - Number(a.principal));
  const vehicule = actives.find((v) => v.id === id) ?? actives.find((v) => v.id === voitureCourante()) ?? actives[0] ?? null;
  return { actives, vehicule };
}

function adresse(chemin, params) {
  const recherche = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const texte = recherche.toString();
  return texte ? `${chemin}?${texte}` : chemin;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export function CatalogueServices({ vehiculeId = null, mode = null, besoin = null }) {
  const session = useSessionAuto();
  const router = useRouter();
  const [donnees, charger] = useDonneesServices(session);
  const modeChoisi = MODES.some((m) => m.code === mode) ? mode : null;

  if (session === undefined || !donnees) {
    return (
      <PageAuto session={session}>
        <SqueletteVehicules />
      </PageAuto>
    );
  }
  if (donnees.dossiers?.erreur) {
    return (
      <PageAuto session={session}>
        <ErreurChargement onRecharger={charger} />
      </PageAuto>
    );
  }

  const { actives, vehicule } = choisirVehicule(donnees.dossiers?.vehicules ?? [], vehiculeId);
  // `reports` manquait ici : un élément mis à « plus tard » se représentait
  // intact sur cet écran, alors que l'accueil et « À prévoir » le respectaient.
  const { elements } = construireAPrevoir({ vehicules: actives, taches: donnees.dossiers?.taches ?? [], reports: donnees.dossiers?.reports ?? [], aujourdhui: aujourdhuiIso() });
  const taches = donnees.dossiers?.taches ?? [];
  const besoinChoisi = besoinParCode(besoin);
  // Un besoin ne filtre pas par « façon de faire » : il rassemble ce qui y répond.
  const services = besoinChoisi
    ? besoinChoisi.services.map((code) => serviceParCode(code)).filter(Boolean)
    : servicesDuMode(modeChoisi);
  const aller = (params) => router.replace(adresse("/auto/services", { vehicule: vehicule?.id, mode: modeChoisi, besoin, ...params }), { scroll: false });

  // « J'ai un problème » : un parcours guidé, borné, qui aide à FORMULER.
  if (besoinChoisi?.guide) {
    return (
      <PageAuto session={session}>
        <Link href={adresse("/auto/services", { vehicule: vehicule?.id })} className="-ml-2 mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Services
        </Link>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">{besoinChoisi.titre}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nexora ne cherche pas la panne : il vous aide à décrire ce que vous constatez, pour en parler à un professionnel sans rien oublier.
        </p>
        <div className="mt-4">
          <ChoixVoiture session={session} actives={actives} vehicule={vehicule} suite="/auto/services?besoin=probleme" onChoisir={(id) => { memoriserVoitureCourante(id); aller({ vehicule: id }); }} />
        </div>
        {vehicule ? <DecrireLeProbleme vehicule={vehicule} onEnregistre={charger} /> : null}
      </PageAuto>
    );
  }

  return (
    <PageAuto session={session}>
      {besoinChoisi ? (
        <Link href={adresse("/auto/services", { vehicule: vehicule?.id })} className="-ml-2 mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Services
        </Link>
      ) : null}
      <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">{besoinChoisi ? besoinChoisi.titre : "Services"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {besoinChoisi ? besoinChoisi.resume : "Comprendre chaque prestation pour votre voiture, et la garder dans vos prochaines actions."}
      </p>

      <div className="mt-4">
        <ChoixVoiture session={session} actives={actives} vehicule={vehicule} suite="/auto/services" onChoisir={(id) => { memoriserVoitureCourante(id); aller({ vehicule: id }); }} />
      </div>

      {/* Un besoin doit parler de LA voiture choisie, pas seulement en porter
          le nom en en-tête : « Entretenir ma voiture » menait à cinq
          prestations à trier soi-même (constat du 18 sept. 2026).
          Et quand le suivi n'est pas calculable, l'état seul était une impasse :
          il listait trois manques, et les trois sorties réclamaient une
          information que le propriétaire n'a pas (constat du 22 sept. 2026).
          C'est alors la préparation qui prend la place — pas qui s'y ajoute,
          sinon les mêmes trois lignes s'afficheraient deux fois. */}
      {besoinChoisi?.preparation && vehicule ? (
        <Aide besoin={besoinChoisi} vehicule={vehicule} elements={elements} />
      ) : null}

      {/* Par besoin d'abord : personne ne se réveille en pensant « géométrie ».
          Le catalogue reste dessous, entier. */}
      {!besoinChoisi ? (
        <section aria-labelledby="titre-besoins" className="mt-6">
          <h2 id="titre-besoins" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            De quoi avez-vous besoin ?
          </h2>
          <ul className={carteListe}>
            {BESOINS.map((b) => (
              <li key={b.code}>
                {/* Un besoin dont la réponse est déjà écrite ailleurs y mène
                    directement : un écran intermédiaire qui ne ferait que
                    reposer le lien est une étape sans utilité. */}
                <Link
                  href={b.fiche && vehicule ? `/auto/vehicules/${vehicule.id}#${b.fiche}` : adresse("/auto/services", { vehicule: vehicule?.id, besoin: b.code })}
                  className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 break-words">
                    <span className="block font-semibold leading-snug text-foreground">{b.titre}</span>
                    <span className="block text-sm leading-snug text-muted-foreground">{b.resume}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {UNIVERS.map((u) => {
        const liste = services.filter((s) => s.univers === u.code);
        if (liste.length === 0) return null;
        return (
          <section key={u.code} className="mt-7" aria-labelledby={`univers-${u.code}`}>
            <h2 id={`univers-${u.code}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {besoinChoisi ? `${u.libelle} : ce que comprend chaque prestation` : u.libelle}
            </h2>
            <ul className={`${carteListe} mt-2`}>
              {liste.map((service) => {
                const Icone = ICONES[service.code] ?? Wrench;
                const existante = actionExistante(service, vehicule, { elements, taches });
                const compat = compatibilite(service, vehicule);
                return (
                  <li key={service.code}>
                    <Link href={adresse(`/auto/services/${service.code}`, { vehicule: vehicule?.id })} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/60">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary ${iconeLigne}`}>
                        <Icone className="size-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        <span className="block font-semibold leading-snug text-foreground">{service.nom}</span>
                        <span className="block text-sm leading-snug text-muted-foreground">{service.resume}</span>
                        {existante || compat.etat === "non_concerne" ? (
                          <span className="mt-1.5 block">
                            {existante ? <Pastille ton="ok">Dans À prévoir</Pastille> : <Pastille>Ne concerne pas cette voiture</Pastille>}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* Les façons de faire réaliser une prestation ne débouchent sur aucune
          offre réservable : elles restent une information, en fin d'écran, et
          non un filtre mis en avant. */}
      {!besoinChoisi ? (
        <section aria-labelledby="titre-facons" className="mt-8 border-t border-border pt-5">
          <h2 id="titre-facons" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Où cela se fait, d'habitude
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Chez un professionnel, à domicile, ou avec collecte et restitution. Nexora ne propose ni rendez-vous ni prestataire : ce filtre montre seulement les
            prestations qui se réalisent habituellement de cette façon.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Façon de réaliser la prestation">
            {[{ code: null, libelle: "Toutes les façons" }, ...MODES].map((m) => (
              <button key={m.code ?? "toutes"} type="button" onClick={() => aller({ mode: m.code })} aria-pressed={modeChoisi === m.code} className={`${puce} ${puceEtat(modeChoisi === m.code)}`}>
                {m.libelle}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </PageAuto>
  );
}

// ---------------------------------------------------------------------------
// Fiche d'une prestation
// ---------------------------------------------------------------------------

export function FicheService({ code, vehiculeId = null }) {
  const service = serviceParCode(code);
  const session = useSessionAuto();
  const router = useRouter();
  const [donnees, charger] = useDonneesServices(session);
  const [message, setMessage] = useState("");
  const aujourdhui = aujourdhuiIso();

  if (session === undefined || !donnees) {
    return (
      <PageAuto session={session}>
        <SqueletteVehicules />
      </PageAuto>
    );
  }
  if (donnees.dossiers?.erreur) {
    return (
      <PageAuto session={session}>
        <ErreurChargement onRecharger={charger} />
      </PageAuto>
    );
  }

  const { actives, vehicule } = choisirVehicule(donnees.dossiers?.vehicules ?? [], vehiculeId);
  const taches = donnees.dossiers?.taches ?? [];
  const { elements } = construireAPrevoir({ vehicules: actives, taches, reports: donnees.dossiers?.reports ?? [], aujourdhui });
  const existante = actionExistante(service, vehicule, { elements, taches });
  const compat = compatibilite(service, vehicule);
  const disponibilite = disponibiliteReservation({ serviceCode: service.code, vehicule, offres: donnees.offres, aujourdhui });
  const univers = UNIVERS.find((u) => u.code === service.univers);
  const Icone = ICONES[service.code] ?? Wrench;
  const suite = adresse(`/auto/services/${service.code}`, { vehicule: vehicule?.id });

  return (
    <PageAuto session={session}>
      <Link href={adresse("/auto/services", { vehicule: vehicule?.id })} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Services
      </Link>

      <div className="mt-2 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <Icone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{univers?.libelle}</p>
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">{service.nom}</h1>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{service.resume}</p>
        </div>
      </div>

      <div className="mt-4">
        <ChoixVoiture
          session={session}
          actives={actives}
          vehicule={vehicule}
          suite={suite}
          onChoisir={(id) => {
            setMessage("");
            memoriserVoitureCourante(id);
            router.replace(adresse(`/auto/services/${service.code}`, { vehicule: id }), { scroll: false });
          }}
        >
          {vehicule ? <AdaptationVoiture service={service} vehicule={vehicule} compat={compat} /> : null}
        </ChoixVoiture>
      </div>

      {message ? (
        <div className="mt-3">
          <Alerte ton="succes">{message}</Alerte>
        </div>
      ) : null}

      <div className="mt-3">
        {service.assistance ? (
          <BlocAssistance vehicule={vehicule} />
        ) : (
          <BlocAction
            service={service}
            session={session}
            vehicule={vehicule}
            existante={existante}
            compat={compat}
            disponibilite={disponibilite}
            onAjoute={async (texte) => {
              setMessage(texte);
              await charger();
            }}
            onDoublon={charger}
          />
        )}
      </div>

      <Rubrique titre="À quoi ça sert">
        <p className="text-[15px] leading-relaxed text-foreground">{service.aQuoiSert}</p>
      </Rubrique>

      <Rubrique titre={service.assistance ? "Les bons réflexes" : "Ce que comprend habituellement la prestation"}>
        <Liste lignes={service.comprend} />
      </Rubrique>

      <Rubrique titre={service.assistance ? "Ce qui dépend de votre contrat" : "Ce qui dépend du véhicule ou reste à vérifier"}>
        <Liste lignes={service.dependDuVehicule} />
        {!service.assistance ? <p className={aide}>Nexora ne pose pas de diagnostic et ne recommande aucun remplacement : le professionnel le fait après examen.</p> : null}
      </Rubrique>

      <Rubrique titre={service.assistance ? "À avoir sous la main" : "Pour préparer une future offre"}>
        <Informations service={service} vehicule={vehicule} />
      </Rubrique>

      {!service.assistance ? (
        <Rubrique titre="Façons de la réaliser">
          <ul className="space-y-2.5">
            {MODES.map((m) => {
              const mode = service.modes[m.code];
              if (!mode) return null;
              return (
                <li key={m.code} className="flex items-start gap-2.5">
                  {mode.envisageable ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Possible" />
                  ) : (
                    <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Pas habituel" />
                  )}
                  <span className="min-w-0 text-[15px] leading-snug">
                    <span className={mode.envisageable ? "text-foreground" : "text-muted-foreground"}>{m.libelle}</span>
                    {mode.note ? <span className="block text-[13px] text-muted-foreground">{mode.note}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={aide}>Ce sont les façons habituelles de réaliser cette prestation, pas des disponibilités.</p>
        </Rubrique>
      ) : null}
    </PageAuto>
  );
}

// ---------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------

function ErreurChargement({ onRecharger }) {
  return (
    <Alerte action={<button type="button" onClick={onRecharger} className="text-sm font-semibold underline underline-offset-2">Recharger</button>}>
      Impossible de charger vos voitures. Vérifiez votre connexion.
    </Alerte>
  );
}

// La voiture pour laquelle on lit : reprise du dossier, changeable d'un geste.
function ChoixVoiture({ session, actives, vehicule, suite, onChoisir, children }) {
  if (session === null) {
    return (
      <div className={`${carte} flex items-center gap-3`}>
        <Car className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground">Connectez-vous pour adapter les fiches à votre voiture.</p>
        <Link href={`/auto/connexion?suite=${encodeURIComponent(suite)}`} className="shrink-0 text-sm font-semibold text-primary hover:underline">
          Se connecter
        </Link>
      </div>
    );
  }
  if (!vehicule) {
    return (
      <div className={`${carte} flex items-center gap-3`}>
        <Car className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-foreground">Ajoutez votre voiture pour adapter les fiches.</p>
        <Link href="/auto/vehicules/nouveau" className="shrink-0 text-sm font-semibold text-primary hover:underline">
          Ajouter
        </Link>
      </div>
    );
  }
  return (
    <section className={carte} aria-label="Voiture">
      {actives.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choisir la voiture">
          {actives.map((v) => (
            <button key={v.id} type="button" onClick={() => v.id !== vehicule.id && onChoisir(v.id)} aria-pressed={v.id === vehicule.id} className={`${puce} ${puceEtat(v.id === vehicule.id)}`}>
              {v.marque} {v.modele}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${actives.length > 1 ? "mt-3" : ""}`}>
        <Car className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Link href={`/auto/vehicules/${vehicule.id}`} className="-my-1 inline-flex min-h-8 items-center rounded-lg font-semibold text-foreground hover:underline">
          {vehicule.marque} {vehicule.modele}
        </Link>
        <Plaque valeur={vehicule.immatriculation} />
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {[vehicule.energie ? libelleDe(ENERGIES, vehicule.energie) : "Énergie non renseignée", vehicule.motorisation, vehicule.annee].filter(Boolean).join(" · ")}
      </p>
      {children}
    </section>
  );
}

function AdaptationVoiture({ service, vehicule, compat }) {
  const remarques = remarquesVehicule(service, vehicule);
  if (!compat.texte && remarques.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {compat.texte ? (
        <p className={`rounded-lg px-3 py-2 text-sm leading-snug ${compat.etat === "non_concerne" ? "bg-slate-100 text-slate-800" : "bg-amber-50 text-amber-900"}`}>{compat.texte}</p>
      ) : null}
      {remarques.map((r) => (
        <p key={r} className="text-sm leading-snug text-foreground">
          {r}
        </p>
      ))}
    </div>
  );
}

function BlocAction({ service, session, vehicule, existante, compat, disponibilite, onAjoute, onDoublon }) {
  const lienAPrevoir = (cle) => adresse("/auto/a-prevoir", { vehicule: vehicule?.id, element: cle });
  let action = null;

  if (session && vehicule && existante?.type === "echeance") {
    const { element } = existante;
    // Une information qui manque s'ouvre ICI, sur le formulaire qui la
    // débloque. Renvoyer vers « À prévoir » pour y cliquer ensuite sur le même
    // bouton faisait une boucle : deux écrans pour un geste.
    const aCompleter = element.etat === "a_completer" && element.actions?.[0];
    action = aCompleter ? (
      <EtatAction
        titre={element.nbManques > 1 ? "Des informations manquent" : "Une information manque"}
        detail={element.explication || "Nexora ne peut pas encore calculer cette échéance."}
        lien={`/auto/vehicules/${vehicule.id}?action=${element.actions[0].code}`}
        libelleLien={element.actions[0].libelle}
      />
    ) : (
      <EtatAction titre="Déjà suivi dans « À prévoir »" detail={element.quand} lien={lienAPrevoir(element.cle)} />
    );
  } else if (session && vehicule && existante?.type === "tache") {
    const { tache } = existante;
    action = <EtatAction titre="Dans vos prochaines actions" detail={tache.echeance ? `Pour le ${formaterDate(tache.echeance)}` : "Sans date"} lien={lienAPrevoir(`tache:${tache.id}`)} />;
  } else if (peutAjouterAuxActions(service, vehicule, existante)) {
    action = <AjoutAction service={service} vehicule={vehicule} onAjoute={onAjoute} onDoublon={onDoublon} />;
  } else if (vehicule && compat.etat === "non_concerne") {
    action = <p className="text-sm text-muted-foreground">Cette prestation ne concerne pas cette voiture.</p>;
  }

  return (
    <section className={carte} aria-label="Prochaines actions et réservation">
      {action}
      {/* Seule une offre réelle rendra « Réserver » possible (lib/auto/offres.js) ;
          le lot de la réservation ajoutera le bouton. */}
      {!disponibilite.reservable ? (
        <p className={`flex items-center gap-2 text-sm text-muted-foreground ${action ? "mt-3 border-t border-border pt-3" : ""}`}>
          <CalendarX2 className="size-4 shrink-0" aria-hidden="true" />
          {LIBELLE_NON_DISPONIBLE}
        </p>
      ) : null}
    </section>
  );
}

function EtatAction({ titre, detail, lien, libelleLien = "Voir dans À prévoir" }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <CalendarCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <div className="min-w-[8rem] flex-1">
        <p className="font-semibold text-foreground">{titre}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Link href={lien} className="-my-2 ml-auto inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-lg px-1 text-sm font-semibold text-primary hover:underline">
        {libelleLien}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function AjoutAction({ service, vehicule, onAjoute, onDoublon }) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function ajouter(evenement) {
    evenement.preventDefault();
    setErreur("");
    setEnCours(true);
    const { error } = await supabase.from("auto_taches").insert({ vehicule_id: vehicule.id, service_code: service.code, titre: service.nom, echeance: date || null });
    setEnCours(false);
    if (error) {
      setErreur(messageErreurAuto(error));
      // Ajoutée entre-temps (autre onglet) : l'écran montre l'action existante.
      if (error.code === "23505") onDoublon();
      return;
    }
    setOuvert(false);
    setDate("");
    onAjoute("Ajouté à vos prochaines actions.");
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={cn(boutonPrincipal, "h-auto min-h-12 px-4 py-2.5 text-[15px] leading-tight")}>
        <Plus className="size-5 shrink-0" aria-hidden="true" />
        Ajouter à mes prochaines actions
      </button>
    );
  }
  return (
    <form onSubmit={ajouter} noValidate className="space-y-3">
      <p className="font-semibold text-foreground">
        {service.nom} · {vehicule.marque} {vehicule.modele}
      </p>
      <div>
        <label htmlFor="service-echeance" className={etiquette}>
          Pour quand ? <span className="font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <input id="service-echeance" type="date" min={aujourdhuiIso()} value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
      </div>
      {erreur ? <Alerte>{erreur}</Alerte> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={enCours} className={cn(boutonPrincipal, "h-11 flex-1")}>
          {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
          Ajouter
        </button>
        <button type="button" onClick={() => setOuvert(false)} disabled={enCours} className={cn(boutonSecondaire, "h-11 w-auto px-4")}>
          Annuler
        </button>
      </div>
    </form>
  );
}

// L'assistance : aucun bouton qui laisserait croire à un dépannage déclenché.
function BlocAssistance({ vehicule }) {
  return (
    <section className={`${carte} border-amber-200 bg-amber-50/70`}>
      <p className="font-semibold text-amber-950">Nexora ne déclenche pas de dépannage.</p>
      <p className="mt-1 text-sm leading-snug text-amber-950">
        En cas de danger, appelez le 112. Sinon, appelez l'assistance de votre assurance ou du constructeur : son numéro figure sur votre contrat ou votre attestation d'assurance.
      </p>
      {vehicule ? (
        <Link href={`/auto/vehicules/${vehicule.id}#documents`} className="mt-2 inline-flex items-center gap-0.5 text-sm font-semibold text-amber-950 underline underline-offset-2">
          Retrouver mes documents
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

function Informations({ service, vehicule }) {
  const infos = informationsService(service, vehicule);
  if (!vehicule) {
    return <Liste lignes={[...infos.aCompleter, ...infos.aPreciser].map((i) => i.libelle)} />;
  }
  return (
    <div className="space-y-4">
      {infos.connues.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-foreground">Déjà dans votre dossier</p>
          <dl className="mt-1.5 divide-y divide-border rounded-xl border border-border">
            {infos.connues.map((i) => (
              <div key={i.cle} className="flex flex-wrap justify-between gap-x-3 px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{i.libelle}</dt>
                <dd className="font-medium text-foreground">{i.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {infos.aCompleter.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-foreground">À compléter dans votre dossier</p>
          <ul className="mt-1.5 divide-y divide-border rounded-xl border border-border">
            {infos.aCompleter.map((i) => (
              <li key={i.cle} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-sm">
                <span className="min-w-0 text-foreground">{i.libelle}</span>
                {i.action ? (
                  <Link href={`/auto/vehicules/${vehicule.id}?action=${i.action}`} className="-my-2 inline-flex min-h-10 shrink-0 items-center rounded-lg px-1 font-semibold text-primary hover:underline">
                    Compléter
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {infos.aPreciser.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-foreground">{service.assistance ? "À indiquer lors de l'appel" : "À préciser le moment venu"}</p>
          <Liste lignes={infos.aPreciser.map((i) => i.libelle)} />
        </div>
      ) : null}
    </div>
  );
}

function Rubrique({ titre, children }) {
  return (
    <section className="mt-7">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titre}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Liste({ lignes }) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {lignes.map((ligne) => (
        <li key={ligne} className="flex items-start gap-2 text-[15px] leading-snug text-foreground">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
          <span className="min-w-0">{ligne}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// « Entretenir ma voiture » commence par CETTE voiture
// ---------------------------------------------------------------------------
//
// L'entrée ouvrait sur Révision, Vidange, Freinage, Batterie, Climatisation :
// un classement propre, mais qui laissait la personne choisir elle-même ce qui
// convenait à sa voiture (constat du 18 sept. 2026). Le dossier passe devant,
// le catalogue reste dessous, entier.
//
// Aucun intervalle constructeur, aucune préconisation : on dit seulement ce qui
// manque au dossier, ou ce qui en a déjà été calculé.
// « Révision : Dans environ 300 km » — la majuscule de la phrase d'origine
// tombait au milieu de celle-ci.
const sansMajuscule = (texte) => (texte ? texte.charAt(0).toLowerCase() + texte.slice(1) : texte);

// Où l'on est, puis ce qu'on peut faire — et jamais les deux fois la même
// chose. Quand l'échéance se calcule, l'état suffit : il porte une date, qui
// est la réponse. Quand elle ne se calcule pas, l'état ne dirait que des
// manques : c'est la préparation qui répond, et elle prend toute la place.
function Aide({ besoin, vehicule, elements }) {
  const calculable = besoin.code !== "entretenir" || etatEntretien({ vehicule, elements }).cas !== "a_preciser";

  return (
    <>
      {besoin.code === "entretenir" && calculable ? <SuiviEntretien vehicule={vehicule} elements={elements} /> : null}
      <Preparation vehicule={vehicule} intention={besoin.code} />
    </>
  );
}

function SuiviEntretien({ vehicule, elements }) {
  const etat = etatEntretien({ vehicule, elements });
  if (etat.cas === "sans_voiture") return null;

  // Le cas « à préciser » ne passe plus ici : `Aide` confie alors l'écran à
  // `Preparation`, qui donne un résultat au lieu d'une liste de manques. Garder
  // ce bloc, c'était garder deux réponses possibles à la même situation.

  if (etat.cas === "echeance") {
    return (
      <section className={`${carte} mt-4`} aria-label="Votre prochaine révision">
        <EtatAction titre={`${etat.titre} : ${sansMajuscule(etat.texte)}`} detail={etat.element.explication} lien={adresse("/auto/a-prevoir", { vehicule: vehicule.id, element: etat.element.cle })} />
      </section>
    );
  }

  return (
    <p className="mt-4 flex items-start gap-2 text-sm leading-snug text-muted-foreground">
      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <span className="min-w-0">{etat.texte ? `Prochaine révision : ${sansMajuscule(etat.texte)}.` : "Votre suivi d'entretien est renseigné."}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// « J'ai un problème » : mettre des mots, pas un diagnostic
// ---------------------------------------------------------------------------
//
// Ce parcours ne conclut jamais à une pièce ni à une cause. Il produit une
// phrase que la personne peut relire, corriger, COPIER et emporter chez un
// professionnel — et il l'enregistre dans « À prévoir ». Aucun prix, aucun
// créneau, aucun professionnel proposé : rien de tout cela n'existe.
//
// Trois défauts corrigés le 18 sept. 2026, après une navigation du fondateur :
//   1. la deuxième question était la même pour tous les constats, très
//      générale, et la phrase obtenue se répétait — elle dépend maintenant du
//      constat (lib/auto/besoins.js) ;
//   2. sur un téléphone, tous les choix restaient dépliés et l'écran
//      s'allongeait — une réponse donnée se replie en une ligne, modifiable ;
//   3. la seule suite était « Garder cette description » : le résumé se copie,
//      ce qui est la façon dont il sert réellement.
// Ces listes-ci portent `code` (lib/auto/besoins.js) ; libelleDe() de
// format.js cherche `valeur` et rendrait une chaîne vide en silence.
const libelleParCode = (liste, code) => liste.find((e) => e.code === code)?.libelle ?? "";

function DecrireLeProbleme({ vehicule, onEnregistre }) {
  const [constat, setConstat] = useState("");
  const [depuis, setDepuis] = useState("");
  const [precision, setPrecision] = useState("");
  const [complement, setComplement] = useState("");
  const [rouverte, setRouverte] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enregistre, setEnregistre] = useState(false);
  const resumeRef = useRef(null);

  const jeu = precisionsPour(constat);
  const resume = resumeProbleme({ constat, depuis, precision, complement });
  const prestation = constat ? serviceParCode(prestationPour(constat)) : null;

  function repondre(setter, valeur, actuel) {
    setter(valeur === actuel ? "" : valeur);
    setRouverte(null);
  }

  async function enregistrer() {
    setErreur("");
    setEnCours(true);
    const titre = resume.slice(0, 120);
    const { error } = await supabase.from("auto_taches").insert({
      vehicule_id: vehicule.id,
      service_code: prestation?.code ?? null,
      titre,
      note: resume.length > 120 ? resume.slice(0, 500) : null,
    });
    setEnCours(false);
    if (error) return setErreur(messageErreurAuto(error));
    setEnregistre(true);
    onEnregistre?.();
  }

  if (enregistre) {
    return (
      <div className={`${carte} mt-4 p-5`}>
        <CircleCheck className="size-8 text-emerald-600" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-semibold text-foreground">C'est noté</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
          Votre description est dans « À prévoir », avec {vehicule.marque} {vehicule.modele}. Vous pourrez la relire, la corriger ou la supprimer.
        </p>
        {/* La suite réellement disponible : emporter cette phrase chez un
            professionnel. Pas un créneau, qui n'existe pas. */}
        <p className="mt-4 text-sm font-medium text-foreground">À dire, ou à envoyer :</p>
        <p ref={resumeRef} className="mt-1 break-words rounded-xl bg-muted/60 px-3.5 py-3 text-[15px] leading-relaxed text-foreground">
          {resume}
        </p>
        <div className="mt-4 space-y-3">
          <BoutonCopier texte={resume} cibleRef={resumeRef} libelle="Copier cette description" />
          <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}`} className={boutonSecondaire}>
            Voir dans À prévoir
          </Link>
          {prestation ? (
            <Link href={adresse(`/auto/services/${prestation.code}`, { vehicule: vehicule.id })} className={boutonSecondaire}>
              Ce que comprend « {prestation.nom} »
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <Etape
        question="Que constatez-vous ?"
        reponse={libelleParCode(CONSTATS, constat)}
        ouverte={!constat || rouverte === "constat"}
        onModifier={() => setRouverte("constat")}
      >
        {CONSTATS.map((c) => (
          <button key={c.code} type="button" onClick={() => repondre(setConstat, c.code, constat)} aria-pressed={constat === c.code} className={`${puce} ${puceEtat(constat === c.code)}`}>
            {c.libelle}
          </button>
        ))}
      </Etape>

      {constat ? (
        <>
          <ConseilConstat constat={constat} precision={precision} />

          <Etape question="Depuis quand ?" reponse={libelleParCode(DEPUIS, depuis)} ouverte={!depuis || rouverte === "depuis"} onModifier={() => setRouverte("depuis")}>
            {DEPUIS.map((d) => (
              <button key={d.code} type="button" onClick={() => repondre(setDepuis, d.code, depuis)} aria-pressed={depuis === d.code} className={`${puce} ${puceEtat(depuis === d.code)}`}>
                {d.libelle}
              </button>
            ))}
          </Etape>

          {jeu ? (
            <Etape question={jeu.question} reponse={libelleParCode(jeu.options, precision)} ouverte={!precision || rouverte === "precision"} onModifier={() => setRouverte("precision")}>
              {jeu.options.map((o) => (
                <button key={o.code} type="button" onClick={() => repondre(setPrecision, o.code, precision)} aria-pressed={precision === o.code} className={`${puce} ${puceEtat(precision === o.code)}`}>
                  {o.libelle}
                </button>
              ))}
            </Etape>
          ) : null}

          <div>
            <label htmlFor="probleme-complement" className={etiquette}>
              Autre chose à préciser <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <textarea id="probleme-complement" rows={3} maxLength={300} value={complement} onChange={(e) => setComplement(e.target.value)} className={champ} placeholder="Plutôt à l'avant droit, surtout quand il fait froid…" />
          </div>

          <section aria-labelledby="titre-resume-probleme" className={`${carte} bg-muted/40`}>
            <h2 id="titre-resume-probleme" className="text-sm font-semibold text-foreground">
              Ce que vous pourrez décrire
            </h2>
            <p ref={resumeRef} className="mt-1.5 break-words text-[15px] leading-relaxed text-foreground">
              {resume}
            </p>
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">Nexora ne dit pas d'où cela vient : seul un professionnel peut le constater sur la voiture.</p>
            <div className="mt-3">
              <BoutonCopier texte={resume} cibleRef={resumeRef} libelle="Copier cette description" />
            </div>
          </section>

          {erreur ? <Alerte>{erreur}</Alerte> : null}

          <div className="space-y-2">
            <button type="button" onClick={enregistrer} disabled={enCours || !resume} className={boutonPrincipal}>
              {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
              Garder cette description dans À prévoir
            </button>
            {prestation ? (
              <Link href={adresse(`/auto/services/${prestation.code}`, { vehicule: vehicule.id })} className={boutonSecondaire}>
                Ce que comprend « {prestation.nom} »
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// Une question répondue tient en une ligne : sur un téléphone, huit constats
// puis cinq moments puis cinq précisions faisaient trois écrans de défilement
// pour trois clics.
function Etape({ question, reponse, ouverte, onModifier, children }) {
  if (!ouverte && reponse) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 py-2 pl-3.5 pr-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-xs leading-snug text-muted-foreground">{question}</span>
          <span className="block break-words text-[15px] font-medium leading-snug text-foreground">{reponse}</span>
        </span>
        <button type="button" onClick={onModifier} className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-semibold text-primary hover:underline">
          Modifier
        </button>
      </div>
    );
  }
  return (
    <fieldset>
      <legend className={etiquette}>{question}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

// Deux messages distincts, parce que ce sont deux situations distinctes.
// « Ne prenez pas la route » s'affichait sur « la voiture démarre mal » — où
// il n'y a pas de route à prendre — et pas sur « quelque chose a changé au
// freinage ». Aucun des deux n'énonce de règle mécanique : Nexora ne sait pas
// ce qui se passe, il rappelle seulement la prudence et ce qui correspond.
function ConseilConstat({ constat, precision }) {
  if (securite(constat, precision)) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] leading-snug text-amber-950">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Si vous avez le moindre doute sur la sécurité, ne prenez pas la route : une vérification vaut mieux qu'un trajet de plus.</p>
      </div>
    );
  }
  if (immobilise(constat)) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-[13px] leading-snug text-foreground">
        <LifeBuoy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p>Si la voiture ne repart pas d'où elle est, c'est une assistance qu'il faut, pas un rendez-vous.</p>
      </div>
    );
  }
  return null;
}

