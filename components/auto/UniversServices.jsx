"use client";

// Services : comprendre une prestation pour sa voiture, la garder dans ses
// prochaines actions, et voir tout de suite si elle est réservable.
//
// Consulter n'est pas réserver. Une fiche se lit avec ou sans dossier complet ;
// seule une offre réelle (auto_offres, lib/auto/offres.js) pourra un jour
// rendre une prestation réservable. Aujourd'hui il n'en existe aucune : l'écran
// le dit sobrement, sans formulaire que personne ne traiterait.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BatteryCharging,
  CalendarCheck,
  CalendarX2,
  Car,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Crosshair,
  Disc,
  Droplet,
  LifeBuoy,
  LoaderCircle,
  Minus,
  Plus,
  Snowflake,
  Sparkles,
  SprayCan,
  Stethoscope,
  ThermometerSnowflake,
  Wrench,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { LIBELLE_NON_DISPONIBLE, disponibiliteReservation } from "@/lib/auto/offres";
import { construireAPrevoir } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import { Alerte, PageAuto, Pastille, Plaque, SqueletteVehicules, aide, boutonPrincipal, boutonSecondaire, carte, carteListe, champ, etiquette, iconeLigne, memoriserVoitureCourante, puce, puceEtat, useSessionAuto, voitureCourante } from "@/components/auto/elements";
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

export function CatalogueServices({ vehiculeId = null, mode = null }) {
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
  const { elements } = construireAPrevoir({ vehicules: actives, taches: donnees.dossiers?.taches ?? [], aujourdhui: aujourdhuiIso() });
  const taches = donnees.dossiers?.taches ?? [];
  const services = servicesDuMode(modeChoisi);
  const aller = (params) => router.replace(adresse("/auto/services", { vehicule: vehicule?.id, mode: modeChoisi, ...params }), { scroll: false });

  return (
    <PageAuto session={session}>
      <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">Services</h1>
      <p className="mt-1 text-sm text-muted-foreground">Comprendre chaque prestation pour votre voiture, et la garder dans vos prochaines actions.</p>

      <div className="mt-4">
        <ChoixVoiture session={session} actives={actives} vehicule={vehicule} suite="/auto/services" onChoisir={(id) => { memoriserVoitureCourante(id); aller({ vehicule: id }); }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Façon de réaliser la prestation">
        {[{ code: null, libelle: "Toutes les façons" }, ...MODES].map((m) => (
          <button key={m.code ?? "toutes"} type="button" onClick={() => aller({ mode: m.code })} aria-pressed={modeChoisi === m.code} className={`${puce} ${puceEtat(modeChoisi === m.code)}`}>
            {m.libelle}
          </button>
        ))}
      </div>
      {modeChoisi ? <p className={aide}>Les mêmes prestations, filtrées sur une façon habituelle de les réaliser. Ce n'est pas une disponibilité.</p> : null}

      {UNIVERS.map((u) => {
        const liste = services.filter((s) => s.univers === u.code);
        if (liste.length === 0) return null;
        return (
          <section key={u.code} className="mt-7" aria-labelledby={`univers-${u.code}`}>
            <h2 id={`univers-${u.code}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {u.libelle}
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
    action = (
      <EtatAction
        titre="Déjà suivi dans « À prévoir »"
        detail={element.etat === "a_completer" ? "Une information manque pour calculer l'échéance." : element.quand}
        lien={lienAPrevoir(element.cle)}
      />
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

function EtatAction({ titre, detail, lien }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <CalendarCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <div className="min-w-[8rem] flex-1">
        <p className="font-semibold text-foreground">{titre}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Link href={lien} className="-my-2 ml-auto inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-lg px-1 text-sm font-semibold text-primary hover:underline">
        Voir dans À prévoir
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
