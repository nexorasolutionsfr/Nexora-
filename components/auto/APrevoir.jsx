"use client";

// « À prévoir » : les prochaines actions de toutes les voitures actives,
// tirées de leurs dossiers. Rien à ressaisir : chaque carte dit quoi faire,
// pour quand, sur quelles informations, et mène au geste utile. Les tâches
// personnelles s'ajoutent si la personne le souhaite.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Calculator, CalendarCheck, Car, ChevronRight, CircleAlert, CircleCheck, ChevronDown, ListTodo, LoaderCircle, Plus, RotateCcw, Ruler, ShieldCheck, Trash2, Waves } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { ajouterJours, aujourdhuiIso } from "@/lib/auto/echeances";
import { Alerte, PageAuto, Pastille, Plaque, SqueletteVehicules, aide, boutonLien, boutonPrincipal, boutonSecondaire, carte, carteListe, champ, deconnexionVolontaire, etiquette, puce, puceEtat, useSessionAuto } from "@/components/auto/elements";
import { FONDEMENTS, HORIZONS_JOURS, construireAPrevoir, pastilleElement } from "@/components/auto/aPrevoir";
import { chargerDossiers } from "@/components/auto/dossiers";
import { formaterDate, messageErreurAuto } from "@/components/auto/format";

const ICONES_FONDEMENT = { officiel: ShieldCheck, calcul: Calculator, intervalle: Ruler, estimation: Waves, tache: ListTodo, manquant: CircleAlert };

export default function APrevoir({ vehiculeFiltre = null, elementCible = null }) {
  const session = useSessionAuto();
  const router = useRouter();
  const [dossiers, setDossiers] = useState(null);
  const [filtre, setFiltre] = useState(vehiculeFiltre);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [nouvelleTache, setNouvelleTache] = useState(false);
  const [voirTerminees, setVoirTerminees] = useState(false);
  const aujourdhui = aujourdhuiIso();

  useEffect(() => {
    if (session === null && !deconnexionVolontaire()) router.replace("/auto/connexion?suite=/auto/a-prevoir");
  }, [session, router]);

  const charger = useCallback(async () => {
    setDossiers(await chargerDossiers());
  }, []);

  useEffect(() => {
    if (session) charger();
  }, [session, charger]);

  // Arrivée depuis une fiche de service (« Voir dans À prévoir ») : la carte
  // concernée est amenée à l'écran et mise en évidence.
  useEffect(() => {
    if (!elementCible || !dossiers || dossiers.erreur) return;
    requestAnimationFrame(() => document.getElementById(`element-${elementCible}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [elementCible, dossiers]);

  const resultat = useMemo(() => {
    if (!dossiers || dossiers.erreur) return null;
    const vehicules = filtre ? dossiers.vehicules.filter((v) => v.id === filtre) : dossiers.vehicules;
    return construireAPrevoir({ vehicules, taches: dossiers.taches, reports: dossiers.reports, horizonJours: dossiers.horizonJours, aujourdhui });
  }, [dossiers, filtre, aujourdhui]);

  async function apres(texte) {
    setErreur("");
    setMessage(texte);
    await charger();
  }

  async function executer(requete, texte) {
    setMessage("");
    const { error } = await requete;
    if (error) {
      setErreur(messageErreurAuto(error));
      return false;
    }
    await apres(texte);
    return true;
  }

  const changerHorizon = (horizon) =>
    executer(supabase.from("auto_preferences").upsert({ proprietaire_id: session.user.id, horizon_jours: horizon }, { onConflict: "proprietaire_id" }), `Vous voyez désormais les ${horizon} prochains jours.`);

  const reporterRappel = (element, jours) =>
    executer(
      supabase.from("auto_rappels_reports").upsert({ proprietaire_id: session.user.id, cle: element.cle, reporte_jusqu_au: ajouterJours(aujourdhui, jours) }, { onConflict: "proprietaire_id,cle" }),
      "Rappel reporté. L'échéance reste dans la liste.",
    );
  const annulerReport = (element) => executer(supabase.from("auto_rappels_reports").delete().eq("cle", element.cle), "Report annulé.");

  const terminerTache = (element) => executer(supabase.from("auto_taches").update({ statut: "terminee", terminee_le: new Date().toISOString() }).eq("id", element.tacheId), "Tâche terminée.");
  const rouvrirTache = (element) => executer(supabase.from("auto_taches").update({ statut: "a_faire", terminee_le: null }).eq("id", element.tacheId), "Tâche rouverte.");
  const reporterTache = (element, date) => executer(supabase.from("auto_taches").update({ echeance: date }).eq("id", element.tacheId), `Tâche reportée au ${formaterDate(date)}.`);
  const supprimerTache = (element) => {
    if (!window.confirm(`Supprimer la tâche « ${element.titre} » ?`)) return;
    executer(supabase.from("auto_taches").delete().eq("id", element.tacheId), "Tâche supprimée.");
  };

  if (!session || !dossiers) {
    return (
      <PageAuto session={session}>
        <SqueletteVehicules />
      </PageAuto>
    );
  }

  if (dossiers.erreur) {
    return (
      <PageAuto session={session}>
        <Alerte action={<button type="button" onClick={charger} className="text-sm font-semibold underline underline-offset-2">Recharger</button>}>
          Impossible de charger ce qui est à prévoir. Vérifiez votre connexion.
        </Alerte>
      </PageAuto>
    );
  }

  const actives = dossiers.vehicules.filter((v) => !v.archive_le).sort((a, b) => Number(b.principal) - Number(a.principal));
  if (actives.length === 0) {
    return (
      <PageAuto session={session}>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">À prévoir</h1>
        <div className={`${carte} mt-5 px-5 py-8 text-center`}>
          <Car className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="mt-3 text-[15px] text-foreground">Ajoutez votre voiture : Nexora en tirera ses prochaines échéances.</p>
          <Link href="/auto/vehicules/nouveau" className={`${boutonPrincipal} mt-5`}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter mon véhicule
          </Link>
        </div>
      </PageAuto>
    );
  }

  const { groupes, terminees } = resultat;
  const horizon = dossiers.horizonJours;
  const actions = { reporterRappel, annulerReport, terminerTache, reporterTache, supprimerTache, elementCible };
  const rienDUrgent = groupes.enRetard.length === 0 && groupes.bientot.length === 0;

  return (
    <PageAuto session={session}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-foreground">À prévoir</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tiré de vos dossiers : rien à ressaisir.</p>
        </div>
        {!nouvelleTache ? (
          <button type="button" onClick={() => setNouvelleTache(true)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
            <Plus className="size-4" aria-hidden="true" />
            Tâche
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Afficher</span>
        {HORIZONS_JOURS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => h !== horizon && changerHorizon(h)}
            aria-pressed={h === horizon}
            className={`${puce} ${puceEtat(h === horizon)}`}
          >
            {h} jours
          </button>
        ))}
      </div>

      {actives.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Voitures">
          {[{ id: null, nom: "Toutes les voitures" }, ...actives.map((v) => ({ id: v.id, nom: `${v.marque} ${v.modele}` }))].map((v) => (
            <button
              key={v.id ?? "toutes"}
              type="button"
              onClick={() => setFiltre(v.id)}
              aria-pressed={filtre === v.id}
              className={`${puce} ${puceEtat(filtre === v.id)}`}
            >
              {v.nom}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {message ? <Alerte ton="succes">{message}</Alerte> : null}
        {erreur ? <Alerte>{erreur}</Alerte> : null}
      </div>

      {nouvelleTache ? (
        <section className={`${carte} mt-4`}>
          <h2 className="font-semibold text-foreground">Nouvelle tâche</h2>
          <FormulaireTache
            vehicules={actives}
            vehiculeParDefaut={filtre ?? actives[0].id}
            onAnnuler={() => setNouvelleTache(false)}
            onEnregistre={() => {
              setNouvelleTache(false);
              apres("Tâche ajoutée.");
            }}
          />
        </section>
      ) : null}

      {rienDUrgent ? (
        <div className={`${carte} mt-4 flex items-center gap-3`}>
          <CalendarCheck className="size-6 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-[15px] text-foreground">Rien d'urgent dans les {horizon} prochains jours.</p>
        </div>
      ) : null}

      <Groupe titre="En retard" elements={groupes.enRetard} actions={actions} aujourdhui={aujourdhui} />
      <Groupe titre={`Dans les ${horizon} prochains jours`} elements={groupes.bientot} actions={actions} aujourdhui={aujourdhui} />
      <Groupe titre="À compléter" sousTitre="Nexora a besoin de ces informations pour calculer." elements={groupes.aCompleter} actions={actions} aujourdhui={aujourdhui} />
      <Groupe titre="Tâches sans date" elements={groupes.sansDate} actions={actions} aujourdhui={aujourdhui} />
      <Groupe titre="Plus tard" elements={groupes.plusTard} actions={actions} aujourdhui={aujourdhui} />

      {terminees.length > 0 ? (
        <section className="mt-7">
          <button type="button" onClick={() => setVoirTerminees((v) => !v)} aria-expanded={voirTerminees} className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <CircleCheck className="size-4" aria-hidden="true" />
            {terminees.length > 1 ? `${terminees.length} tâches terminées` : "1 tâche terminée"}
            <ChevronDown className={`size-4 transition ${voirTerminees ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {voirTerminees ? (
            <ul className={`${carteListe} mt-2`}>
              {terminees.map((t) => (
                <li key={t.cle} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="line-clamp-2 block break-words text-foreground line-through decoration-muted-foreground/50">{t.titre}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t.vehicule.nom} · terminée le {formaterDate(t.termineeLe)}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => rouvrirTache(t)} className={boutonLien} aria-label={`Rouvrir ${t.titre}`}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => supprimerTache(t)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-destructive" aria-label={`Supprimer ${t.titre}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </PageAuto>
  );
}

function Groupe({ titre, sousTitre, elements, actions, aujourdhui }) {
  if (elements.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titre}</h2>
      {sousTitre ? <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p> : null}
      <ul className="mt-2 space-y-3">
        {elements.map((element) => (
          <li key={element.cle} id={`element-${element.cle}`} className="scroll-mt-28">
            <CarteElement element={element} actions={actions} aujourdhui={aujourdhui} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CarteElement({ element, actions, aujourdhui }) {
  const [reporter, setReporter] = useState(false);
  const [dateReport, setDateReport] = useState("");
  const pastille = pastilleElement(element, { avecSujet: false });
  const IconeFondement = ICONES_FONDEMENT[element.fondement] ?? CircleAlert;
  const estTache = element.genre === "tache";
  const lienFiche = (code) => `/auto/vehicules/${element.vehicule.id}?action=${code}`;

  return (
    <article className={`${carte} ${actions.elementCible === element.cle ? "ring-2 ring-primary/40" : ""}`}>
      <Link href={`/auto/vehicules/${element.vehicule.id}`} className="-my-1 inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground">
        <Car className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{element.vehicule.nom}</span>
        <Plaque valeur={element.vehicule.immatriculation} />
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-foreground">{element.titre}</h3>
        <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
      </div>
      <p className="mt-1 text-[15px] leading-snug text-foreground">{element.quand}</p>

      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-muted-foreground">
        <IconeFondement className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-foreground/80">{FONDEMENTS[element.fondement]}.</span>
          {element.explication ? ` ${element.explication}` : ""}
        </span>
      </p>

      {element.alerte ? (
        <p className="mt-2 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-red-800">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {element.alerte}
        </p>
      ) : null}

      {element.reporteJusquau ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <BellOff className="size-3.5" aria-hidden="true" />
          Rappel reporté jusqu'au {formaterDate(element.reporteJusquau)}.
          <button type="button" onClick={() => actions.annulerReport(element)} className="-my-2 inline-flex min-h-8 items-center rounded-lg px-1 font-semibold text-primary hover:underline">
            Annuler
          </button>
        </p>
      ) : null}

      <div className="-ml-2 mt-2 flex flex-wrap gap-x-1">
        {estTache ? (
          <>
            <button type="button" onClick={() => actions.terminerTache(element)} className={boutonLien}>
              <CircleCheck className="size-4" aria-hidden="true" />
              C'est fait
            </button>
            <button type="button" onClick={() => setReporter((v) => !v)} aria-expanded={reporter} className={boutonLien}>
              Reporter
            </button>
            <button type="button" onClick={() => actions.supprimerTache(element)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:bg-red-50 hover:text-destructive">
              Supprimer
            </button>
          </>
        ) : (
          <>
            {element.actions.map((a) => (
              <Link key={a.code} href={lienFiche(a.code)} className={boutonLien}>
                {a.libelle}
              </Link>
            ))}
            {/* Une échéance critique ne se reporte pas. */}
            {element.etat === "a_faire" && !element.reporteJusquau && !element.critique ? (
              <button type="button" onClick={() => setReporter((v) => !v)} aria-expanded={reporter} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                Me le rappeler plus tard
              </button>
            ) : null}
          </>
        )}
        {element.serviceCode ? (
          <Link href={`/auto/services/${element.serviceCode}?vehicule=${element.vehicule.id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
            La prestation
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {reporter ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {[
            { jours: 7, libelle: "Dans 1 semaine" },
            { jours: 30, libelle: "Dans 1 mois" },
          ].map((choix) => (
            <button
              key={choix.jours}
              type="button"
              onClick={() => {
                setReporter(false);
                if (estTache) actions.reporterTache(element, ajouterJours(element.date && element.date > aujourdhui ? element.date : aujourdhui, choix.jours));
                else actions.reporterRappel(element, choix.jours);
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {choix.libelle}
            </button>
          ))}
          {estTache ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!dateReport) return;
                setReporter(false);
                actions.reporterTache(element, dateReport);
              }}
            >
              <input type="date" min={aujourdhui} value={dateReport} onChange={(e) => setDateReport(e.target.value)} className={`${champ} w-auto py-1.5`} aria-label="Nouvelle date" />
              <button type="submit" className={boutonLien}>
                OK
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function FormulaireTache({ vehicules, vehiculeParDefaut, onAnnuler, onEnregistre }) {
  const [saisie, setSaisie] = useState({ titre: "", vehiculeId: vehiculeParDefaut, echeance: "", note: "" });
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const changer = (nom) => (e) => setSaisie((s) => ({ ...s, [nom]: e.target.value }));

  async function soumettre(evenement) {
    evenement.preventDefault();
    const titre = saisie.titre.trim();
    if (!titre) return setErreur("Indiquez ce qu'il faut faire.");
    if (titre.length > 120) return setErreur("120 caractères au plus.");
    setEnCours(true);
    const { error } = await supabase.from("auto_taches").insert({
      vehicule_id: saisie.vehiculeId,
      titre,
      echeance: saisie.echeance || null,
      note: saisie.note.trim().slice(0, 500) || null,
    });
    setEnCours(false);
    if (error) setErreur(messageErreurAuto(error));
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <div>
        <label htmlFor="tache-titre" className={etiquette}>
          Quoi faire
        </label>
        <input id="tache-titre" value={saisie.titre} onChange={changer("titre")} maxLength={120} autoFocus className={champ} placeholder="Monter les pneus hiver" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="tache-vehicule" className={etiquette}>
            Voiture
          </label>
          <select id="tache-vehicule" value={saisie.vehiculeId} onChange={changer("vehiculeId")} className={`${champ} appearance-none`}>
            {vehicules.map((v) => (
              <option key={v.id} value={v.id}>
                {v.marque} {v.modele}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="tache-echeance" className={etiquette}>
            Pour le <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <input id="tache-echeance" type="date" value={saisie.echeance} onChange={changer("echeance")} className={champ} />
        </div>
      </div>
      <div>
        <label htmlFor="tache-note" className={etiquette}>
          Note <span className="font-normal text-muted-foreground">(facultatif)</span>
        </label>
        <input id="tache-note" value={saisie.note} onChange={changer("note")} maxLength={500} className={champ} />
        <p className={aide}>Nexora n'ajoute jamais de tâche à votre place : pneus, freins ou batterie restent vos décisions.</p>
      </div>
      {erreur ? <Alerte>{erreur}</Alerte> : null}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={enCours} className={`${boutonPrincipal} h-11 flex-1`}>
          {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
          Ajouter
        </button>
        <button type="button" onClick={onAnnuler} disabled={enCours} className={`${boutonSecondaire} h-11 w-auto px-4`}>
          Annuler
        </button>
      </div>
    </form>
  );
}
