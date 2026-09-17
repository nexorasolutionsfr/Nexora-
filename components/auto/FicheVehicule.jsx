"use client";

// Fiche d'une voiture : kilométrage, échéances, historique.
//
// Chaque échéance dit d'où elle vient, et quand elle ne peut pas être
// calculée, l'écran demande l'information qui manque au lieu d'inventer une
// valeur. Un seul petit formulaire ouvert à la fois.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BatteryCharging,
  CalendarClock,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Disc,
  Droplet,
  Gauge,
  History,
  LayoutGrid,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  Snowflake,
  Sparkles,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { RESULTATS_DEFAVORABLES, aujourdhuiIso, dernierKilometrage } from "@/lib/auto/echeances";
import { estimerKilometrage } from "@/lib/auto/kilometrage";
import { FONDEMENTS, elementControle, elementRevision, pastilleElement } from "@/components/auto/aPrevoir";
import {
  Alerte,
  Chargement,
  PageAuto,
  Pastille,
  Plaque,
  aide,
  boutonLien,
  boutonPrincipal,
  boutonSecondaire,
  carte,
  carteListe,
  champ,
  etiquette,
  memoriserVoitureCourante,
  useSessionAuto,
} from "@/components/auto/elements";
import FormulaireVehicule from "@/components/auto/FormulaireVehicule";
import BlocDepenses from "@/components/auto/Depenses";
import BlocDocuments, { ouvrirDocument } from "@/components/auto/Documents";
import { COMPARTIMENT } from "@/lib/auto/documents";
import {
  ENERGIES,
  INTERVALLES_COURANTS,
  TYPES_INTERVENTION,
  formaterDate,
  formaterEuros,
  formaterKm,
  formaterNombre,
  libelleDe,
  messageErreurAuto,
} from "@/components/auto/format";
import { NATURES_CONTROLE, RESULTATS_CONTROLE, validerIntervalle, validerIntervention, validerReleve } from "@/components/auto/validation";

// Le geste proposé par une échéance → le petit formulaire qui l'accomplit.
const FORMULAIRE_PAR_ACTION = {
  releve: "releve",
  revision: "entretien",
  controle: "controle",
  contre_visite: "contre_visite",
  proces_verbal: "proces_verbal",
  mise_en_circulation: "mise_en_circulation",
  intervalle: "intervalle",
  // Depuis une fiche de service : compléter la voiture ou son historique.
  modifier: "modifier",
  intervention: "intervention",
};
const SECTION_PAR_ACTION = { releve: "kilometrage", revision: "echeance-revision", intervalle: "echeance-revision", modifier: "haut-fiche", intervention: "historique" };

const ICONES = {
  revision: Wrench,
  vidange: Droplet,
  controle_technique: ClipboardCheck,
  pneus: CircleDot,
  freinage: Disc,
  batterie: BatteryCharging,
  climatisation: Snowflake,
  lavage: Sparkles,
};

export default function FicheVehicule({ vehiculeId, actionInitiale = null, bienvenue = false }) {
  const session = useSessionAuto();
  const router = useRouter();
  const [etat, setEtat] = useState({ chargement: true, erreur: false, introuvable: false, vehicule: null, releves: [], historique: [], documents: [] });
  const [ouvert, setOuvert] = useState(null);
  const [historiquePourDocument, setHistoriquePourDocument] = useState(null);
  const [message, setMessage] = useState("");
  const [actionEnCours, setActionEnCours] = useState(false);

  useEffect(() => {
    if (session === null) router.replace(`/auto/connexion?suite=/auto/vehicules/${vehiculeId}`);
  }, [session, router, vehiculeId]);

  const charger = useCallback(async () => {
    const [vehicule, releves, historique, documents] = await Promise.all([
      supabase.from("auto_vehicules").select("*").eq("id", vehiculeId).maybeSingle(),
      supabase.from("auto_releves_km").select("id, kilometrage, releve_le, source").eq("vehicule_id", vehiculeId).order("releve_le", { ascending: false }),
      supabase
        .from("auto_historique")
        .select("id, type, realise_le, kilometrage, libelle, prestataire, montant_ttc, source, saisie, created_at, resultat_controle, nature_controle, controle_valable_jusqu_au")
        .eq("vehicule_id", vehiculeId)
        .order("realise_le", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("auto_documents")
        .select("id, type, titre, date_document, chemin, nom_fichier, type_mime, taille_octets, historique_id, source, created_at")
        .eq("vehicule_id", vehiculeId)
        .order("created_at", { ascending: false }),
    ]);
    // Un identifiant qui n'est pas un uuid vaut « introuvable », pas « panne ».
    if (vehicule.error?.code === "22P02") {
      setEtat((e) => ({ ...e, chargement: false, erreur: false, introuvable: true }));
      return;
    }
    if (vehicule.error || releves.error || historique.error || documents.error) {
      setEtat((e) => ({ ...e, chargement: false, erreur: true }));
      return;
    }
    if (!vehicule.data) {
      setEtat((e) => ({ ...e, chargement: false, erreur: false, introuvable: true }));
      return;
    }
    setEtat({ chargement: false, erreur: false, introuvable: false, vehicule: vehicule.data, releves: releves.data, historique: historique.data, documents: documents.data });
    if (!vehicule.data.archive_le) memoriserVoitureCourante(vehicule.data.id);
  }, [vehiculeId]);

  useEffect(() => {
    if (session) charger();
  }, [session, charger]);

  // Arrivée depuis « À prévoir » avec un geste à faire : le formulaire est
  // déjà ouvert, au bon endroit. L'adresse est nettoyée pour qu'un
  // rechargement ne le rouvre pas.
  const actionAppliquee = useRef(false);
  useEffect(() => {
    if (actionAppliquee.current || etat.chargement || !etat.vehicule || !actionInitiale) return;
    actionAppliquee.current = true;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!FORMULAIRE_PAR_ACTION[actionInitiale] || etat.vehicule.archive_le) return;
    setOuvert(FORMULAIRE_PAR_ACTION[actionInitiale]);
    requestAnimationFrame(() => document.getElementById(SECTION_PAR_ACTION[actionInitiale] ?? "echeance-ct")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [etat.chargement, etat.vehicule, actionInitiale]);

  // Juste après l'ajout de la voiture : un mot d'accueil, une seule fois.
  const bienvenueAffichee = useRef(false);
  useEffect(() => {
    if (!bienvenue || bienvenueAffichee.current || etat.chargement || !etat.vehicule) return;
    bienvenueAffichee.current = true;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setMessage(`${etat.vehicule.marque} ${etat.vehicule.modele} est dans votre garage.`);
  }, [bienvenue, etat.chargement, etat.vehicule]);

  // « Pour bien démarrer » : masqué pour cette voiture si la personne le demande.
  const [premiersPasMasques, setPremiersPasMasques] = useState(true);
  useEffect(() => {
    try {
      setPremiersPasMasques((JSON.parse(localStorage.getItem("nexora-auto-premiers-pas-masques") || "[]") ?? []).includes(vehiculeId));
    } catch {
      setPremiersPasMasques(false);
    }
  }, [vehiculeId]);
  function masquerPremiersPas() {
    setPremiersPasMasques(true);
    try {
      const liste = JSON.parse(localStorage.getItem("nexora-auto-premiers-pas-masques") || "[]");
      localStorage.setItem("nexora-auto-premiers-pas-masques", JSON.stringify([...new Set([...liste, vehiculeId])].slice(-50)));
    } catch {
      // Sans stockage, l'encart reviendra à la prochaine visite : sans gravité.
    }
  }

  // Arrivée sur une section précise (#documents, depuis l'assistance) : le
  // dossier se charge après la navigation, le défilement attend l'affichage.
  const ancreAppliquee = useRef(false);
  useEffect(() => {
    if (ancreAppliquee.current || etat.chargement || !etat.vehicule) return;
    ancreAppliquee.current = true;
    const ancre = window.location.hash.slice(1);
    if (ancre) requestAnimationFrame(() => document.getElementById(ancre)?.scrollIntoView({ block: "start" }));
  }, [etat.chargement, etat.vehicule]);

  function faireAction(code, { defiler = false } = {}) {
    setMessage("");
    setOuvert(FORMULAIRE_PAR_ACTION[code]);
    const section = SECTION_PAR_ACTION[code] ?? "echeance-ct";
    if (defiler || section === "kilometrage") requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function apresEnregistrement(texte) {
    setOuvert(null);
    setHistoriquePourDocument(null);
    setMessage(texte);
    await charger();
  }

  // Voiture principale, archivage, restauration : fonctions en base, qui
  // gardent toujours une voiture principale cohérente.
  async function agir(fonction, parametres, texte) {
    setActionEnCours(true);
    setMessage("");
    const { error } = await supabase.rpc(fonction, parametres);
    setActionEnCours(false);
    if (error) {
      setMessage("");
      setEtat((e) => ({ ...e, erreurAction: messageErreurAuto(error) }));
      return;
    }
    setEtat((e) => ({ ...e, erreurAction: "" }));
    await apresEnregistrement(texte);
  }

  function joindreDocument(ligne) {
    setMessage("");
    setHistoriquePourDocument(ligne.id);
    setOuvert("document");
    requestAnimationFrame(() => document.getElementById("documents")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  if (!session || etat.chargement) {
    return (
      <PageAuto session={session}>
        <Chargement />
      </PageAuto>
    );
  }

  if (etat.introuvable || etat.erreur) {
    return (
      <PageAuto session={session}>
        <RetourGarage />
        <div className="mt-4">
          {etat.erreur ? (
            <Alerte action={<button type="button" onClick={charger} className="text-sm font-semibold underline underline-offset-2">Recharger</button>}>
              Impossible de charger ce véhicule. Vérifiez votre connexion.
            </Alerte>
          ) : (
            <Alerte>Ce véhicule est introuvable. Il a peut-être été supprimé.</Alerte>
          )}
        </div>
      </PageAuto>
    );
  }

  const { vehicule, releves, historique, documents } = etat;
  const archive = Boolean(vehicule.archive_le);
  const km = dernierKilometrage({ releves, historique });
  const estimationKm = estimerKilometrage({ releves, historique });
  const elementCt = elementControle({ ...vehicule, releves, historique });
  const elementRev = elementRevision({ ...vehicule, releves, historique });
  const details = [libelleDe(ENERGIES, vehicule.energie), vehicule.motorisation, vehicule.annee].filter(Boolean).join(" · ");
  const dernierControle = historique
    .filter((h) => h.type === "controle_technique")
    .sort((a, b) => (a.realise_le < b.realise_le ? 1 : a.realise_le > b.realise_le ? -1 : 0))[0];
  const ouvrir = (nom) => {
    setMessage("");
    setOuvert((actuel) => (actuel === nom ? null : nom));
  };

  return (
    <PageAuto session={session}>
      <RetourGarage />

      {ouvert === "modifier" ? (
        <section id="haut-fiche" className={`${carte} mt-3 scroll-mt-28 p-5`}>
          <h1 className="mb-5 font-display text-xl font-bold text-foreground">Modifier le véhicule</h1>
          <FormulaireVehicule
            vehicule={vehicule}
            libelleBouton="Enregistrer"
            onAnnuler={() => setOuvert(null)}
            onEnregistrer={async (d) => {
              const { error } = await supabase
                .from("auto_vehicules")
                .update({
                  marque: d.marque,
                  modele: d.modele,
                  annee: d.annee,
                  energie: d.energie,
                  motorisation: d.motorisation,
                  immatriculation: d.immatriculation,
                  date_mise_en_circulation: d.dateMiseEnCirculation,
                })
                .eq("id", vehicule.id);
              if (error) return messageErreurAuto(error);
              await apresEnregistrement("Véhicule modifié.");
              return "";
            }}
          />
        </section>
      ) : (
        <section className={`${carte} mt-3 p-5`}>
          {vehicule.principal ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Star className="size-3.5 fill-current" aria-hidden="true" />
              Voiture principale
            </p>
          ) : null}
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
            {vehicule.marque} {vehicule.modele}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Plaque valeur={vehicule.immatriculation} taille="grande" />
            {details ? <p className="text-sm text-muted-foreground">{details}</p> : null}
          </div>
          {archive ? (
            <div className="mt-3 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-foreground">
              Archivée le {formaterDate(vehicule.archive_le)}. Son dossier est conservé.
            </div>
          ) : null}
          <div className="-ml-2 mt-3 flex flex-wrap gap-x-1">
            <button type="button" onClick={() => ouvrir("modifier")} className={boutonLien}>
              <Pencil className="size-4" aria-hidden="true" />
              Modifier
            </button>
            {!archive && !vehicule.principal ? (
              <button type="button" disabled={actionEnCours} onClick={() => agir("auto_definir_principal", { p_vehicule_id: vehicule.id }, "C'est maintenant votre voiture principale.")} className={boutonLien}>
                <Star className="size-4" aria-hidden="true" />
                Définir comme principale
              </button>
            ) : null}
            {archive ? (
              <button type="button" disabled={actionEnCours} onClick={() => agir("auto_archiver_vehicule", { p_vehicule_id: vehicule.id, p_archiver: false }, "Voiture restaurée.")} className={boutonLien}>
                <ArchiveRestore className="size-4" aria-hidden="true" />
                Restaurer
              </button>
            ) : (
              <button
                type="button"
                disabled={actionEnCours}
                onClick={() => {
                  if (window.confirm(`Archiver ${vehicule.marque} ${vehicule.modele} ? Elle quitte votre garage, son dossier est conservé.`)) {
                    agir("auto_archiver_vehicule", { p_vehicule_id: vehicule.id, p_archiver: true }, "Voiture archivée. Son dossier est conservé.");
                  }
                }}
                className={boutonLien}
              >
                <Archive className="size-4" aria-hidden="true" />
                Archiver
              </button>
            )}
          </div>
          {etat.erreurAction ? (
            <div className="mt-2">
              <Alerte>{etat.erreurAction}</Alerte>
            </div>
          ) : null}
        </section>
      )}

      {message ? (
        <div className="mt-3">
          <Alerte ton="succes">{message}</Alerte>
        </div>
      ) : null}

      {!archive && !premiersPasMasques && historique.length === 0 && documents.length === 0 ? (
        <PremiersPas vehicule={vehicule} kilometrageConnu={Boolean(km)} onAction={(code) => faireAction(code, { defiler: true })} onMasquer={masquerPremiersPas} />
      ) : null}

      {/* Kilométrage */}
      <section id="kilometrage" className={`${carte} mt-3 scroll-mt-28`} aria-labelledby="titre-km">
        <div className="flex items-center gap-3">
          <IconeRonde icone={Gauge} />
          <div className="min-w-0 flex-1">
            <h2 id="titre-km" className="text-sm font-medium text-muted-foreground">
              Kilométrage
            </h2>
            {km ? (
              <p className="font-display text-xl font-semibold text-foreground">
                {formaterKm(km.kilometrage)}
                <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                  {km.origine === "releve" ? `relevé le ${formaterDate(km.date)}` : `à l'intervention du ${formaterDate(km.date)}`}
                </span>
              </p>
            ) : (
              <p className="text-[15px] text-foreground">Pas encore renseigné</p>
            )}
            {estimationKm.estimation ? (
              <p className={aide}>
                <span className="font-semibold text-foreground/80">Estimation.</span> Environ {formaterKm(estimationKm.estimation.kilometrage)} aujourd'hui, d'après le
                rythme de vos relevés. Ce n'est pas un relevé.
              </p>
            ) : null}
            {estimationKm.ancien ? <p className={aide}>Dernier compteur connu il y a {estimationKm.joursDepuis} jours : pensez à l'actualiser.</p> : null}
          </div>
        </div>
        {ouvert === "releve" ? (
          <FormulaireReleve vehiculeId={vehicule.id} dernier={km} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Kilométrage enregistré.")} />
        ) : (
          <button type="button" onClick={() => ouvrir("releve")} className={`${boutonLien} -ml-2 mt-2`}>
            <Plus className="size-4" aria-hidden="true" />
            Mettre à jour le kilométrage
          </button>
        )}
      </section>

      {/* Échéances */}
      <div className="mb-2 mt-7 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Échéances</h2>
        {!archive ? (
          <Link href={`/auto/a-prevoir?vehicule=${vehicule.id}`} className="-my-2 inline-flex min-h-10 items-center gap-0.5 rounded-lg px-1 text-sm font-semibold text-primary hover:underline">
            À prévoir
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {archive ? <p className={`${aide} mb-2`}>Voiture archivée : ses échéances ne figurent plus dans « À prévoir ».</p> : null}
      <div className="space-y-3">
        <CarteEcheance
          id="echeance-ct"
          icone={CalendarClock}
          element={elementCt}
          lienService={archive ? null : `/auto/services/controle_technique?vehicule=${vehicule.id}`}
          onAction={faireAction}
          actionPossible={(code) => code !== "proces_verbal" || dernierControle?.source === "proprietaire"}
        >
          {ouvert === "mise_en_circulation" ? (
            <FormulaireMiseEnCirculation vehiculeId={vehicule.id} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Date de mise en circulation enregistrée.")} />
          ) : ouvert === "controle" ? (
            <FormulaireIntervention vehiculeId={vehicule.id} typeFixe="controle_technique" onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Contrôle technique ajouté à l'historique.")} />
          ) : ouvert === "contre_visite" ? (
            <FormulaireIntervention vehiculeId={vehicule.id} typeFixe="controle_technique" natureInitiale="contre_visite" onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Contre-visite ajoutée à l'historique.")} />
          ) : ouvert === "proces_verbal" && dernierControle ? (
            <FormulaireProcesVerbal controle={dernierControle} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Date du procès-verbal enregistrée.")} />
          ) : null}
        </CarteEcheance>

        <CarteEcheance id="echeance-revision" icone={Wrench} element={elementRev} lienService={archive ? null : `/auto/services/revision?vehicule=${vehicule.id}`} onAction={faireAction}>
          {ouvert === "intervalle" ? (
            <FormulaireIntervalle vehicule={vehicule} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Intervalle de révision enregistré.")} />
          ) : ouvert === "entretien" ? (
            <FormulaireIntervention vehiculeId={vehicule.id} typeFixe="revision" onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Révision ajoutée à l'historique.")} />
          ) : null}
        </CarteEcheance>
      </div>

      {!archive ? (
        <Link href={`/auto/services?vehicule=${vehicule.id}`} className={`${carte} mt-3 flex items-center gap-3 transition hover:border-primary/40`}>
          <IconeRonde icone={LayoutGrid} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Services pour cette voiture</span>
            <span className="block text-sm text-muted-foreground">Entretien, pneus, lavage, contrôle technique, assistance</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <div className="mt-3">
        <BlocDepenses historique={historique} />
      </div>

      {/* Historique */}
      <div id="historique" className="mb-2 mt-7 flex scroll-mt-28 items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Historique</h2>
        {ouvert !== "intervention" ? (
          <button type="button" onClick={() => ouvrir("intervention")} className={boutonLien}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter
          </button>
        ) : null}
      </div>
      {ouvert === "intervention" ? (
        <section className={`${carte} mb-3`}>
          <h3 className="font-semibold text-foreground">Nouvelle intervention</h3>
          <FormulaireIntervention vehiculeId={vehicule.id} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Intervention ajoutée.")} />
        </section>
      ) : null}
      <ListeHistorique historique={historique} documents={documents} onJoindre={joindreDocument} onSupprime={() => apresEnregistrement("Intervention supprimée.")} />

      <BlocDocuments
        vehiculeId={vehicule.id}
        archive={archive}
        proprietaireId={session.user.id}
        documents={documents}
        historique={historique}
        formulaireOuvert={ouvert === "document"}
        historiquePrechoisi={historiquePourDocument}
        onOuvrir={(historiqueId) => {
          setMessage("");
          setHistoriquePourDocument(historiqueId);
          setOuvert("document");
        }}
        onFermer={() => {
          setOuvert(null);
          setHistoriquePourDocument(null);
        }}
        onChange={apresEnregistrement}
      />

      <ZoneSuppression vehicule={vehicule} documents={documents} />
    </PageAuto>
  );
}

// Un dossier vide : trois gestes utiles, aucun obligatoire.
function PremiersPas({ vehicule, kilometrageConnu, onAction, onMasquer }) {
  const gestes = [
    { cle: "facture", icone: ReceiptText, titre: "Ajouter une facture", texte: "En PDF, Nexora essaie de préremplir l'intervention, le kilométrage et la dépense.", href: `/auto/factures/nouvelle?vehicule=${vehicule.id}` },
    kilometrageConnu ? null : { cle: "releve", icone: Gauge, titre: "Indiquer le kilométrage", texte: "Pour suivre l'entretien au compteur." },
    vehicule.date_mise_en_circulation ? null : { cle: "mise_en_circulation", icone: CalendarClock, titre: "Ajouter la mise en circulation", texte: "Case B de la carte grise : Nexora calcule le contrôle technique." },
  ].filter(Boolean);
  const classeGeste = "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-muted";
  return (
    <section className={`${carte} mt-3`} aria-labelledby="titre-premiers-pas">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="titre-premiers-pas" className="font-semibold text-foreground">
            Pour bien démarrer
          </h2>
          <p className="text-sm text-muted-foreground">Rien d'obligatoire : chaque geste rend le dossier plus utile.</p>
        </div>
        <button type="button" onClick={onMasquer} className="-my-1 shrink-0 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          Plus tard
        </button>
      </div>
      <ul className="-mx-2 mt-2">
        {gestes.map(({ cle, icone: Icone, titre, texte, href }) => {
          const contenu = (
            <>
              <IconeRonde icone={Icone} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{titre}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{texte}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </>
          );
          return (
            <li key={cle}>
              {href ? (
                <Link href={href} className={classeGeste}>
                  {contenu}
                </Link>
              ) : (
                <button type="button" onClick={() => onAction(cle)} className={classeGeste}>
                  {contenu}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RetourGarage() {
  return (
    <Link href="/auto" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Mon garage
    </Link>
  );
}

function IconeRonde({ icone: Icone }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
      <Icone className="size-5" aria-hidden="true" />
    </span>
  );
}

// Une échéance, avec les phrases communes à « À prévoir » : quoi, pour quand,
// sur quelles informations. Un petit formulaire remplace les gestes quand il
// est ouvert.
function CarteEcheance({ id, icone, element, lienService = null, onAction, actionPossible = () => true, children }) {
  const pastille = pastilleElement(element, { avecSujet: false });
  return (
    <section id={id} className={`${carte} scroll-mt-28`} aria-labelledby={`${id}-titre`}>
      <div className="flex items-start gap-3">
        <IconeRonde icone={icone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-titre`} className="font-semibold text-foreground">
              {element.titre}
            </h3>
            <Pastille ton={pastille.ton}>{pastille.texte}</Pastille>
          </div>
          <p className="mt-1 text-[15px] leading-snug text-foreground">{element.quand}</p>
          <p className={aide}>
            <span className="font-semibold text-foreground/80">{FONDEMENTS[element.fondement]}.</span> {element.explication}
          </p>
        </div>
      </div>
      {children ?? (
        <div className="-ml-2 mt-2 flex flex-wrap gap-x-1">
          {element.actions
            .filter((a) => actionPossible(a.code))
            .map((a) => (
              <button key={a.code} type="button" onClick={() => onAction(a.code)} className={boutonLien}>
                <Plus className="size-4" aria-hidden="true" />
                {a.libelle}
              </button>
            ))}
          {lienService ? (
            <Link href={lienService} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
              La prestation
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FormulaireProcesVerbal({ controle, onAnnuler, onEnregistre }) {
  const [date, setDate] = useState(controle.controle_valable_jusqu_au ?? "");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement) {
    evenement.preventDefault();
    if (!date) return setErreur("Indiquez la date.");
    if (date <= controle.realise_le.slice(0, 10)) return setErreur("Cette date doit suivre celle du contrôle.");
    setEnCours(true);
    const { data, error } = await supabase.from("auto_historique").update({ controle_valable_jusqu_au: date }).eq("id", controle.id).select("id");
    setEnCours(false);
    if (error) setErreur(messageErreurAuto(error));
    else if (!data?.length) setErreur("L'enregistrement n'a pas abouti. Réessayez.");
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <div>
        <label htmlFor="proces-verbal" className={etiquette}>
          Prochain contrôle avant le
        </label>
        <input id="proces-verbal" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
        <p className={aide}>Inscrite sur le procès-verbal du contrôle du {formaterDate(controle.realise_le)}.</p>
      </div>
      <Erreur texte={erreur} />
      <BoutonsFormulaire enCours={enCours} onAnnuler={onAnnuler} />
    </form>
  );
}

function BoutonsFormulaire({ enCours, libelle = "Enregistrer", onAnnuler }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="submit" disabled={enCours} className={`${boutonPrincipal} h-11 flex-1`}>
        {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
        {libelle}
      </button>
      <button type="button" onClick={onAnnuler} disabled={enCours} className={`${boutonSecondaire} h-11 w-auto px-4`}>
        Annuler
      </button>
    </div>
  );
}

function Erreur({ id, texte }) {
  return texte ? (
    <p id={id} className="mt-1.5 text-[13px] font-medium text-destructive">
      {texte}
    </p>
  ) : null;
}

function FormulaireReleve({ vehiculeId, dernier, onAnnuler, onEnregistre }) {
  const aujourdhui = aujourdhuiIso();
  const [saisie, setSaisie] = useState({ kilometrage: "", releveLe: aujourdhui });
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement) {
    evenement.preventDefault();
    const v = validerReleve(saisie, { aujourdhui });
    setErreurs(v.erreurs);
    if (!v.valide) return;
    // Un compteur ne recule pas : une valeur plus basse que la dernière connue
    // est presque toujours une faute de frappe. On demande, sans interdire.
    if (dernier && v.donnees.kilometrage < dernier.kilometrage && v.donnees.releveLe >= dernier.date) {
      const confirme = window.confirm(`Le dernier kilométrage connu est ${formaterNombre(dernier.kilometrage)} km. Enregistrer quand même ${formaterNombre(v.donnees.kilometrage)} km ?`);
      if (!confirme) return;
    }
    setEnCours(true);
    const { error } = await supabase.from("auto_releves_km").insert({ vehicule_id: vehiculeId, kilometrage: v.donnees.kilometrage, releve_le: v.donnees.releveLe });
    setEnCours(false);
    if (error) setErreurEnvoi(messageErreurAuto(error));
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="releve-km" className={etiquette}>
            Compteur
          </label>
          <div className="relative">
            <input id="releve-km" inputMode="numeric" autoFocus value={saisie.kilometrage} onChange={(e) => setSaisie((s) => ({ ...s, kilometrage: e.target.value }))} className={`${champ} pr-10`} aria-invalid={erreurs.kilometrage ? true : undefined} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">km</span>
          </div>
        </div>
        <div>
          <label htmlFor="releve-date" className={etiquette}>
            Relevé le
          </label>
          <input id="releve-date" type="date" max={aujourdhui} value={saisie.releveLe} onChange={(e) => setSaisie((s) => ({ ...s, releveLe: e.target.value }))} className={champ} aria-invalid={erreurs.releveLe ? true : undefined} />
        </div>
      </div>
      <Erreur texte={erreurs.kilometrage || erreurs.releveLe} />
      {erreurEnvoi ? <Alerte>{erreurEnvoi}</Alerte> : null}
      <BoutonsFormulaire enCours={enCours} onAnnuler={onAnnuler} />
    </form>
  );
}

function FormulaireIntervention({ vehiculeId, typeFixe, typeDefaut = "", natureInitiale = "periodique", onAnnuler, onEnregistre }) {
  const aujourdhui = aujourdhuiIso();
  const [saisie, setSaisie] = useState({ type: typeFixe ?? typeDefaut, realiseLe: "", kilometrage: "", prestataire: "", montant: "", libelle: "", resultatControle: "", natureControle: natureInitiale, controleValableJusquAu: "" });
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);
  const changer = (nom) => (e) => setSaisie((s) => ({ ...s, [nom]: e.target.value }));

  async function soumettre(evenement) {
    evenement.preventDefault();
    const v = validerIntervention(saisie, { aujourdhui });
    setErreurs(v.erreurs);
    if (!v.valide) return;
    setEnCours(true);
    const { error } = await supabase.from("auto_historique").insert({
      vehicule_id: vehiculeId,
      type: v.donnees.type,
      realise_le: v.donnees.realiseLe,
      kilometrage: v.donnees.kilometrage,
      prestataire: v.donnees.prestataire,
      montant_ttc: v.donnees.montantTtc,
      libelle: v.donnees.libelle,
      resultat_controle: v.donnees.resultatControle,
      nature_controle: v.donnees.natureControle,
      controle_valable_jusqu_au: v.donnees.controleValableJusquAu,
    });
    setEnCours(false);
    if (error) setErreurEnvoi(messageErreurAuto(error));
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      {typeFixe ? null : (
        <div>
          <label htmlFor="intervention-type" className={etiquette}>
            Type
          </label>
          <select id="intervention-type" value={saisie.type} onChange={changer("type")} className={`${champ} appearance-none`} aria-invalid={erreurs.type ? true : undefined}>
            <option value="">Choisir…</option>
            {TYPES_INTERVENTION.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </select>
          <Erreur texte={erreurs.type} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="intervention-date" className={etiquette}>
            Date
          </label>
          <input id="intervention-date" type="date" max={aujourdhui} value={saisie.realiseLe} onChange={changer("realiseLe")} className={champ} aria-invalid={erreurs.realiseLe ? true : undefined} />
        </div>
        <div>
          <label htmlFor="intervention-km" className={etiquette}>
            Compteur <span className="font-normal text-muted-foreground">(facult.)</span>
          </label>
          <div className="relative">
            <input id="intervention-km" inputMode="numeric" value={saisie.kilometrage} onChange={changer("kilometrage")} className={`${champ} pr-10`} aria-invalid={erreurs.kilometrage ? true : undefined} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">km</span>
          </div>
        </div>
      </div>
      <Erreur texte={erreurs.realiseLe || erreurs.kilometrage} />
      {saisie.type === "controle_technique" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="intervention-nature" className={etiquette}>
              Nature
            </label>
            <select id="intervention-nature" value={saisie.natureControle} onChange={changer("natureControle")} className={`${champ} appearance-none`}>
              {NATURES_CONTROLE.map((n) => (
                <option key={n.valeur} value={n.valeur}>
                  {n.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="intervention-resultat" className={etiquette}>
              Résultat
            </label>
            <select id="intervention-resultat" value={saisie.resultatControle} onChange={changer("resultatControle")} className={`${champ} appearance-none`}>
              <option value="">Non précisé</option>
              {RESULTATS_CONTROLE.map((r) => (
                <option key={r.valeur} value={r.valeur}>
                  {r.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label htmlFor="intervention-validite" className={etiquette}>
              Date limite sur le procès-verbal <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <input id="intervention-validite" type="date" value={saisie.controleValableJusquAu} onChange={changer("controleValableJusquAu")} className={champ} aria-invalid={erreurs.controleValableJusquAu ? true : undefined} />
            <p className={aide}>Favorable : date du prochain contrôle. Défavorable : fin de validité, le jour même pour une défaillance critique. Elle prime sur tout calcul.</p>
            <Erreur texte={erreurs.controleValableJusquAu} />
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="intervention-prestataire" className={etiquette}>
            Où <span className="font-normal text-muted-foreground">(facult.)</span>
          </label>
          <input id="intervention-prestataire" value={saisie.prestataire} onChange={changer("prestataire")} className={champ} placeholder="Garage, centre…" />
        </div>
        <div>
          <label htmlFor="intervention-montant" className={etiquette}>
            Montant <span className="font-normal text-muted-foreground">(facult.)</span>
          </label>
          <div className="relative">
            <input id="intervention-montant" inputMode="decimal" value={saisie.montant} onChange={changer("montant")} className={`${champ} pr-8`} aria-invalid={erreurs.montant ? true : undefined} placeholder="0,00" />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">€</span>
          </div>
        </div>
      </div>
      <Erreur texte={erreurs.montant} />
      {typeFixe ? null : (
        <div>
          <label htmlFor="intervention-libelle" className={etiquette}>
            Détail <span className="font-normal text-muted-foreground">(facult.)</span>
          </label>
          <input id="intervention-libelle" value={saisie.libelle} onChange={changer("libelle")} className={champ} placeholder="Plaquettes avant, filtre à air…" />
        </div>
      )}
      {erreurEnvoi ? <Alerte>{erreurEnvoi}</Alerte> : null}
      <BoutonsFormulaire enCours={enCours} onAnnuler={onAnnuler} />
    </form>
  );
}

function FormulaireIntervalle({ vehicule, onAnnuler, onEnregistre }) {
  const [saisie, setSaisie] = useState({
    km: vehicule.intervalle_entretien_km ? String(vehicule.intervalle_entretien_km) : "",
    mois: vehicule.intervalle_entretien_mois ? String(vehicule.intervalle_entretien_mois) : "",
  });
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement) {
    evenement.preventDefault();
    const v = validerIntervalle(saisie);
    setErreurs(v.erreurs);
    if (!v.valide) return;
    setEnCours(true);
    const { error } = await supabase
      .from("auto_vehicules")
      .update({ intervalle_entretien_km: v.donnees.km, intervalle_entretien_mois: v.donnees.mois })
      .eq("id", vehicule.id);
    setEnCours(false);
    if (error) setErreurEnvoi(messageErreurAuto(error));
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Recopiez l'intervalle de révision de votre carnet. Raccourcis :</p>
      <div className="flex flex-wrap gap-2">
        {INTERVALLES_COURANTS.map((i) => {
          const actif = saisie.km === String(i.km) && saisie.mois === String(i.mois);
          return (
            <button
              key={`${i.km}-${i.mois}`}
              type="button"
              onClick={() => setSaisie({ km: String(i.km), mois: String(i.mois) })}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${actif ? "border-primary bg-secondary text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}
              aria-pressed={actif}
            >
              {formaterKm(i.km)} ou {i.mois === 12 ? "1 an" : `${i.mois / 12} ans`}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="intervalle-km" className={etiquette}>
            Tous les
          </label>
          <div className="relative">
            <input id="intervalle-km" inputMode="numeric" value={saisie.km} onChange={(e) => setSaisie((s) => ({ ...s, km: e.target.value }))} className={`${champ} pr-10`} aria-invalid={erreurs.km ? true : undefined} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">km</span>
          </div>
        </div>
        <div>
          <label htmlFor="intervalle-mois" className={etiquette}>
            ou tous les
          </label>
          <div className="relative">
            <input id="intervalle-mois" inputMode="numeric" value={saisie.mois} onChange={(e) => setSaisie((s) => ({ ...s, mois: e.target.value }))} className={`${champ} pr-14`} aria-invalid={erreurs.mois ? true : undefined} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">mois</span>
          </div>
        </div>
      </div>
      <Erreur texte={erreurs.km || erreurs.mois} />
      {erreurEnvoi ? <Alerte>{erreurEnvoi}</Alerte> : null}
      <BoutonsFormulaire enCours={enCours} onAnnuler={onAnnuler} />
    </form>
  );
}

function FormulaireMiseEnCirculation({ vehiculeId, onAnnuler, onEnregistre }) {
  const aujourdhui = aujourdhuiIso();
  const [date, setDate] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement) {
    evenement.preventDefault();
    if (!date) return setErreur("Indiquez la date.");
    if (date > aujourdhui) return setErreur("La date ne peut pas être dans le futur.");
    setEnCours(true);
    const { error } = await supabase.from("auto_vehicules").update({ date_mise_en_circulation: date }).eq("id", vehiculeId);
    setEnCours(false);
    if (error) setErreur(messageErreurAuto(error));
    else onEnregistre();
  }

  return (
    <form onSubmit={soumettre} noValidate className="mt-4 space-y-3 border-t border-border pt-4">
      <div>
        <label htmlFor="mise-en-circulation" className={etiquette}>
          Première mise en circulation
        </label>
        <input id="mise-en-circulation" type="date" max={aujourdhui} value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
        <p className={aide}>Case B de la carte grise.</p>
      </div>
      <Erreur texte={erreur} />
      <BoutonsFormulaire enCours={enCours} onAnnuler={onAnnuler} />
    </form>
  );
}

function ListeHistorique({ historique, documents = [], onJoindre, onSupprime }) {
  const [suppression, setSuppression] = useState(null);
  const [erreur, setErreur] = useState("");

  async function supprimer(ligne) {
    const libelle = libelleDe(TYPES_INTERVENTION, ligne.type);
    if (!window.confirm(`Supprimer « ${libelle} » du ${formaterDate(ligne.realise_le)} ?`)) return;
    setErreur("");
    setSuppression(ligne.id);
    const { data, error } = await supabase.from("auto_historique").delete().eq("id", ligne.id).select("id");
    setSuppression(null);
    if (error || !data?.length) setErreur("La suppression n'a pas abouti. Réessayez.");
    else onSupprime();
  }

  if (historique.length === 0) {
    return (
      <div className={`${carte} flex items-center gap-3 text-sm text-muted-foreground`}>
        <History className="size-5 shrink-0" aria-hidden="true" />
        <p>Aucune intervention pour l'instant. Ajoutez la dernière révision ou le dernier contrôle technique.</p>
      </div>
    );
  }

  return (
    <>
      {erreur ? (
        <div className="mb-3">
          <Alerte>{erreur}</Alerte>
        </div>
      ) : null}
      <ol className={carteListe}>
        {historique.map((ligne) => {
          const Icone = ICONES[ligne.type] ?? Wrench;
          const justificatifs = documents.filter((d) => d.historique_id === ligne.id);
          const meta = [
            ligne.kilometrage != null ? formaterKm(ligne.kilometrage) : null,
            ligne.prestataire,
            ligne.montant_ttc != null ? formaterEuros(ligne.montant_ttc) : null,
            ligne.controle_valable_jusqu_au
              ? RESULTATS_DEFAVORABLES.includes(ligne.resultat_controle)
                ? `valable jusqu'au ${formaterDate(ligne.controle_valable_jusqu_au)}`
                : `prochain avant le ${formaterDate(ligne.controle_valable_jusqu_au)}`
              : null,
          ].filter(Boolean);
          return (
            <li key={ligne.id} className="flex items-start gap-3 px-4 py-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70">
                <Icone className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="font-semibold text-foreground">{libelleDe(TYPES_INTERVENTION, ligne.type)}</p>
                  <p className="text-sm text-muted-foreground">{formaterDate(ligne.realise_le)}</p>
                  {ligne.nature_controle === "contre_visite" ? <Pastille>Contre-visite</Pastille> : null}
                  {ligne.resultat_controle === "defavorable_majeure" ? <Pastille ton="proche">Défaillance majeure</Pastille> : null}
                  {ligne.resultat_controle === "defavorable_critique" ? <Pastille ton="depasse">Défaillance critique</Pastille> : null}
                  {ligne.source === "prestation" ? <Pastille ton="ok">Nexora</Pastille> : null}
                </div>
                {meta.length ? <p className="mt-0.5 text-sm text-muted-foreground">{meta.join(" · ")}</p> : null}
                {ligne.libelle ? <p className="mt-0.5 text-sm text-foreground/80">{ligne.libelle}</p> : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted-foreground">{ligne.source === "prestation" ? "Enregistrée par Nexora" : ligne.saisie === "document" ? "D'après votre facture" : "Saisie par vous"}</span>
                  {justificatifs.length ? (
                    <button type="button" onClick={() => ouvrirDocument(justificatifs[0])} className="-my-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg font-semibold text-emerald-700 hover:underline">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      {justificatifs.length > 1 ? `${justificatifs.length} justificatifs` : "Justificatif"}
                    </button>
                  ) : onJoindre ? (
                    <button type="button" onClick={() => onJoindre(ligne)} className="-my-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg font-semibold text-primary hover:underline">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      Joindre un justificatif
                    </button>
                  ) : null}
                </div>
              </div>
              {ligne.source === "proprietaire" ? (
                <button
                  type="button"
                  onClick={() => supprimer(ligne)}
                  disabled={suppression === ligne.id}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 hover:text-destructive"
                  aria-label={`Supprimer ${libelleDe(TYPES_INTERVENTION, ligne.type)} du ${formaterDate(ligne.realise_le)}`}
                >
                  {suppression === ligne.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ZoneSuppression({ vehicule, documents = [] }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function supprimer() {
    if (!window.confirm(`Supprimer définitivement ${vehicule.marque} ${vehicule.modele}, son historique et ses documents ? Pour la retirer en gardant son dossier, archivez-la plutôt.`)) return;
    setEnCours(true);
    setErreur("");
    const { data, error } = await supabase.from("auto_vehicules").delete().eq("id", vehicule.id).select("id");
    setEnCours(false);
    if (error || !data?.length) {
      setErreur("La suppression n'a pas abouti. Réessayez.");
      return;
    }
    // Les fiches sont parties avec la voiture : les fichiers suivent.
    if (documents.length) await supabase.storage.from(COMPARTIMENT).remove(documents.map((d) => d.chemin));
    router.replace("/auto");
  }

  return (
    <div className="mt-10 border-t border-border pt-5">
      {erreur ? (
        <div className="mb-3">
          <Alerte>{erreur}</Alerte>
        </div>
      ) : null}
      <button type="button" onClick={supprimer} disabled={enCours} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-destructive transition hover:bg-red-50 disabled:opacity-60">
        {enCours ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
        Supprimer ce véhicule
      </button>
    </div>
  );
}
