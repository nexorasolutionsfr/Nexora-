"use client";

// Ajouter une facture : déposer → lire → vérifier → confirmer une fois.
//
// - Le fichier part dans le stockage privé et devient un document de la
//   voiture AVANT toute lecture : il est conservé quoi qu'il arrive.
// - Un fichier déjà déposé (même empreinte) renvoie vers l'existant : ni nouvel
//   envoi, ni nouvelle lecture.
// - La lecture automatique propose ; la personne confirme. Les champs
//   incertains sont mis en évidence, les absents restent vides. Sans lecture
//   (non activée, format, limite, échec), le même écran se remplit à la main.
// - Une intervention ressemblante n'est jamais fusionnée : la personne choisit
//   « Rattacher » ou « Créer une autre intervention ». Une incohérence de
//   kilométrage est signalée, rien n'est écrasé.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, ExternalLink, FileText, LoaderCircle, Plus, ScanText, Upload } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { COMPARTIMENT, cheminDocument, nomAffichable, verifierFichierComplet } from "@/lib/auto/documents";
import { ecrireBrouillon, effacerBrouillon, lireBrouillon, stockageNavigateur } from "@/lib/auto/brouillon";
import { empreinteSha256 } from "@/lib/auto/empreinte";
import { nouvelIdentifiant } from "@/lib/auto/identifiants";
import {
  champsCorriges,
  incoherencesKilometrage,
  interventionsRessemblantes,
  plaqueDifferente,
  modeInitial,
  saisieDepuisProposition,
  saisieVide,
  typePrincipal,
  validerFacture,
} from "@/lib/auto/factures";
import { ouvrirDocument } from "@/components/auto/Documents";
import ChoixFichier from "@/components/auto/ChoixFichier";
import EditeurOperations from "@/components/auto/EditeurOperations";
import { Alerte, PageAuto, Plaque, SqueletteVehicules, aide, boutonLien, boutonPrincipal, boutonSecondaire, carte, champ, deconnexionVolontaire, etiquette, focaliserPremiereErreur, puce, puceEtat, useSessionAuto, voitureCourante } from "@/components/auto/elements";
import { TYPES_INTERVENTION, formaterDate, formaterEuros, formaterKm, libelleDe, messageErreurAuto } from "@/components/auto/format";

const ACCEPTES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

// { disponible, formats, externe } : formats lus automatiquement, et si le
// document part chez un prestataire extérieur (lecture payante).
async function lectureDisponible() {
  try {
    const r = await fetch("/api/auto/lecture", { cache: "no-store" });
    const c = await r.json();
    return { disponible: c?.disponible === true, formats: Array.isArray(c?.formats) ? c.formats : [], externe: c?.externe === true };
  } catch {
    return { disponible: false, formats: [], externe: false };
  }
}

async function demanderLecture(documentId, { relire = false } = {}) {
  const { data } = await supabase.auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) return { etat: "echec", raison: "session" };
  try {
    const reponse = await fetch(`/api/auto/documents/${documentId}/lecture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, "content-type": "application/json" },
      body: JSON.stringify({ relire }),
    });
    return (await reponse.json().catch(() => null)) ?? { etat: "echec", raison: "reponse" };
  } catch {
    return { etat: "echec", raison: "reseau" };
  }
}

function useConnexionRequise(session, suite) {
  const router = useRouter();
  useEffect(() => {
    if (session === null && !deconnexionVolontaire()) router.replace(`/auto/connexion?suite=${encodeURIComponent(suite)}`);
  }, [session, router, suite]);
}

// ---------------------------------------------------------------------------
// 1. Déposer
// ---------------------------------------------------------------------------

export function NouvelleFacture({ vehiculeId = null }) {
  const session = useSessionAuto();
  const router = useRouter();
  useConnexionRequise(session, "/auto/factures/nouvelle");
  const [vehicules, setVehicules] = useState(null);
  const [choisi, setChoisi] = useState(vehiculeId);
  const [lecture, setLecture] = useState({ disponible: false, formats: [], externe: false });
  const [fichier, setFichier] = useState(null);
  const [erreur, setErreur] = useState("");
  const [existant, setExistant] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!session) return;
    let actif = true;
    (async () => {
      const [configurationLecture, reponse] = await Promise.all([
        lectureDisponible(),
        supabase.from("auto_vehicules").select("id, marque, modele, immatriculation, principal").is("archive_le", null).order("created_at", { ascending: true }),
      ]);
      if (!actif) return;
      setLecture(configurationLecture);
      setVehicules(reponse.error ? [] : [...reponse.data].sort((a, b) => Number(b.principal) - Number(a.principal)));
    })();
    return () => {
      actif = false;
    };
  }, [session]);

  if (!session || vehicules === null) {
    return (
      <PageAuto session={session}>
        <SqueletteVehicules />
      </PageAuto>
    );
  }

  const vehicule = vehicules.find((v) => v.id === choisi) ?? vehicules.find((v) => v.id === voitureCourante()) ?? vehicules[0] ?? null;

  // Le même fichier, déjà dans l'un des dossiers de la personne (les droits
  // de la base ne montrent jamais celui d'une autre).
  async function chercherExistant(empreinte) {
    const deja = await supabase.from("auto_documents").select("id, vehicule_id, historique_id, type").eq("empreinte_sha256", empreinte).limit(1);
    return deja.data?.[0] ?? null;
  }

  async function deposer(evenement) {
    evenement.preventDefault();
    setErreur("");
    setExistant(null);
    setEnCours(true);
    const verification = await verifierFichierComplet(fichier);
    if (!verification.valide) {
      setEnCours(false);
      return setErreur(verification.erreur);
    }

    const empreinte = await empreinteSha256(fichier);
    const deja = await chercherExistant(empreinte);
    if (deja) {
      setEnCours(false);
      return setExistant(deja);
    }

    const chemin = cheminDocument({ proprietaireId: session.user.id, vehiculeId: vehicule.id, identifiant: nouvelIdentifiant(), typeMime: verification.typeMime });
    const depot = await supabase.storage.from(COMPARTIMENT).upload(chemin, fichier, { contentType: verification.typeMime, upsert: false });
    if (depot.error) {
      setEnCours(false);
      return setErreur("Le fichier n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.");
    }
    const { data, error } = await supabase
      .from("auto_documents")
      .insert({
        vehicule_id: vehicule.id,
        type: "facture",
        chemin,
        nom_fichier: nomAffichable(fichier.name),
        type_mime: verification.typeMime,
        taille_octets: fichier.size,
        empreinte_sha256: empreinte,
      })
      .select("id")
      .single();
    if (error) {
      await supabase.storage.from(COMPARTIMENT).remove([chemin]);
      // Déposée entre-temps (deuxième onglet, double appui) : on montre l'existante.
      const entreTemps = error.code === "23505" ? await chercherExistant(empreinte) : null;
      setEnCours(false);
      return entreTemps ? setExistant(entreTemps) : setErreur(messageErreurAuto(error));
    }
    router.push(`/auto/factures/${data.id}${lecture.disponible && lecture.formats.includes(verification.typeMime) ? "?lire=1" : ""}`);
  }

  return (
    <PageAuto session={session}>
      <Link href={vehicule ? `/auto/vehicules/${vehicule.id}` : "/auto"} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {vehicule ? `${vehicule.marque} ${vehicule.modele}` : "Mon garage"}
      </Link>
      <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-foreground">Ajouter ma facture</h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        {!lecture.disponible
          ? "Votre facture est rangée dans le dossier de la voiture ; vous renseignez ensuite l'intervention."
          : lecture.formats.some((f) => f.startsWith("image/"))
            ? "Nexora lit la facture et vous propose les informations. Vous vérifiez, puis vous confirmez."
            : "Ajoutez votre facture PDF : Nexora essaie de préremplir les informations pour vous. Une photo ou un scan est conservé comme document, et vous renseignez les informations."}
      </p>

      {vehicules.length === 0 ? (
        <div className={`${carte} mt-5`}>
          <p className="text-[15px] text-foreground">Ajoutez d'abord votre voiture.</p>
          <Link href="/auto/vehicules/nouveau" className={`${boutonPrincipal} mt-4`}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter mon véhicule
          </Link>
        </div>
      ) : (
        <form onSubmit={deposer} noValidate className={`${carte} mt-5 space-y-4 p-5`}>
          {vehicules.length > 1 ? (
            <fieldset className="min-w-0">
              <legend className={etiquette}>Voiture</legend>
              <div className="flex flex-wrap gap-2">
                {vehicules.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setChoisi(v.id)}
                    aria-pressed={v.id === vehicule.id}
                    className={`${puce} ${puceEtat(v.id === vehicule.id)}`}
                  >
                    {v.marque} {v.modele}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
              {vehicule.marque} {vehicule.modele} <Plaque valeur={vehicule.immatriculation} />
            </p>
          )}

          <div>
            <ChoixFichier
              id="facture-fichier"
              libelle="Facture"
              accepte={ACCEPTES}
              fichier={fichier}
              onChange={(f) => {
                setFichier(f);
                setExistant(null);
                setErreur("");
              }}
              aideTexte="PDF ou photo, 10 Mo au plus. Le fichier reste privé."
            />
            {lecture.externe ? (
              <p className={`${aide} text-amber-800`}>Lecture automatique en essai : utilisez des factures fictives ou anonymisées.</p>
            ) : null}
          </div>

          {existant ? <DejaDeposee existant={existant} vehicules={vehicules} vehiculeChoisi={vehicule} /> : null}
          {erreur ? <Alerte>{erreur}</Alerte> : null}

          <button type="submit" disabled={enCours || !fichier} className={boutonPrincipal}>
            {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Upload className="size-5" aria-hidden="true" />}
            Ajouter ma facture
          </button>
        </form>
      )}
    </PageAuto>
  );
}

// Le fichier est déjà dans un dossier : rien n'est envoyé ni relu à nouveau.
function DejaDeposee({ existant, vehicules, vehiculeChoisi }) {
  const autre = existant.vehicule_id !== vehiculeChoisi?.id ? vehicules.find((v) => v.id === existant.vehicule_id) : null;
  const facture = existant.type === "facture";
  const aVerifier = facture && !existant.historique_id;
  return (
    <div role="status" className="rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-foreground">
      <p className="font-semibold">
        {facture ? "Cette facture" : "Ce fichier"} est déjà dans {autre ? `le dossier de ${autre.marque} ${autre.modele}` : "votre dossier"}.
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {existant.historique_id
          ? `${facture ? "Elle" : "Il"} justifie déjà une intervention. Rien n'a été envoyé à nouveau.`
          : aVerifier
            ? "Ses informations restent à confirmer : reprenez là où vous en étiez."
            : "Il est rangé dans les documents de la voiture. Rien n'a été envoyé à nouveau."}
      </p>
      <Link
        href={aVerifier ? `/auto/factures/${existant.id}` : `/auto/vehicules/${existant.vehicule_id}#documents`}
        className="-my-1 mt-1 inline-flex min-h-10 items-center gap-1 font-semibold text-primary hover:underline"
      >
        {aVerifier ? "Reprendre la vérification" : `${facture ? "La" : "Le"} voir dans le dossier`}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Vérifier et confirmer
// ---------------------------------------------------------------------------

const MESSAGES_LECTURE = {
  indisponible: "Lecture automatique non activée : renseignez les informations de la facture.",
  illisible: {
    format: "Les photos et les scans ne sont pas encore lus automatiquement : renseignez les informations.",
    taille: "Fichier trop lourd pour la lecture automatique (5 Mo au plus) : renseignez les informations.",
    pages: "Document trop long pour la lecture automatique (4 pages au plus) : renseignez les informations.",
    longueur: "Document trop long pour la lecture automatique : renseignez les informations.",
    contenu: "Le contenu de ce fichier n'est pas un PDF lisible : ouvrez-le pour vérifier, puis renseignez les informations.",
  },
  limite: {
    tentatives: "Cette facture a déjà été lue le nombre de fois permis : renseignez les informations.",
    quota: "Limite de lectures automatiques atteinte pour aujourd'hui : renseignez les informations.",
    budget: "Le budget d'essai de la lecture automatique est atteint : renseignez les informations.",
  },
  echec: "La lecture n'a pas abouti : renseignez les informations, ou réessayez.",
  pdf_sans_texte: "Ce PDF est une image scannée : il n'est pas encore lu automatiquement. Renseignez les informations.",
  pdf_illisible: "Ce PDF n'a pas pu être lu : renseignez les informations.",
  pdf_trop_long: "Document trop long pour la lecture automatique (4 pages au plus) : renseignez les informations.",
  delai_depasse: "La lecture a pris trop de temps : renseignez les informations.",
  non_connecte: "Votre session a expiré : la lecture automatique n'a pas pu se faire. Reconnectez-vous, ou renseignez les informations.",
  vide: "Aucune information n'a pu être lue sur ce document : renseignez-les.",
};

// Échecs qu'une nouvelle tentative ne résoudrait pas.
const ECHECS_DEFINITIFS = new Set(["pdf_sans_texte", "pdf_illisible", "pdf_trop_long", "delai_depasse", "format_non_lu", "session"]);

function messageLecture(lecture) {
  if (lecture.etat === "non_connecte") return MESSAGES_LECTURE.non_connecte;
  if (lecture.etat === "echec" && MESSAGES_LECTURE[lecture.raison]) return MESSAGES_LECTURE[lecture.raison];
  if (lecture.etat === "proposee" && lecture.proposition && !Object.values(lecture.proposition.champs ?? {}).some((c) => c.valeur != null) && !(lecture.proposition.operations ?? []).length) {
    return MESSAGES_LECTURE.vide;
  }
  const m = MESSAGES_LECTURE[lecture.etat];
  if (!m) return null;
  return typeof m === "string" ? m : m[lecture.raison] ?? "Lecture automatique indisponible : renseignez les informations.";
}

export function ConfirmerFacture({ documentId, lire = false }) {
  const session = useSessionAuto();
  useConnexionRequise(session, `/auto/factures/${documentId}`);
  const [etat, setEtat] = useState({ chargement: true });
  const [lecture, setLecture] = useState({ etat: "aucune" });
  const [configurationLecture, setConfigurationLecture] = useState({ disponible: false, formats: [], externe: false });
  const [saisie, setSaisie] = useState(saisieVide);
  const [initiale, setInitiale] = useState(null);
  const [marques, setMarques] = useState({ incertains: new Set(), nonLus: new Set(), immatriculationLue: null, estFacture: null });
  const [touches, setTouches] = useState(new Set());
  const [choix, setChoix] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [enregistre, setEnregistre] = useState(null);
  const [mode, setMode] = useState("intervention");
  // Modifié par la personne : gardé en brouillon sur l'appareil (lib/auto/brouillon.js).
  const [modifie, setModifie] = useState(false);
  const [brouillonRepris, setBrouillonRepris] = useState(false);
  const [ouvertureRatee, setOuvertureRatee] = useState(false);
  const lectureLancee = useRef(false);
  const aujourdhui = aujourdhuiIso();

  const appliquer = useCallback((resultat) => {
    setLecture(resultat);
    if (resultat.etat !== "proposee") return;
    const { saisie: proposee, incertains, nonLus, immatriculationLue, estFacture } = saisieDepuisProposition(resultat.proposition);
    setSaisie(proposee);
    setInitiale(proposee);
    setMarques({ incertains, nonLus, immatriculationLue, estFacture });
    setTouches(new Set());
    setMode(modeInitial(resultat.proposition));
  }, []);

  const charger = useCallback(async () => {
    const document = await supabase
      .from("auto_documents")
      .select("id, vehicule_id, chemin, nom_fichier, type_mime, taille_octets, historique_id, lecture, date_document")
      .eq("id", documentId)
      .maybeSingle();
    if (document.error) return setEtat({ chargement: false, erreur: true });
    if (!document.data) return setEtat({ chargement: false, introuvable: true });
    const d = document.data;
    const [vehicule, releves, historique, dispo] = await Promise.all([
      supabase.from("auto_vehicules").select("id, marque, modele, immatriculation").eq("id", d.vehicule_id).maybeSingle(),
      supabase.from("auto_releves_km").select("kilometrage, releve_le, source").eq("vehicule_id", d.vehicule_id),
      supabase.from("auto_historique").select("id, type, realise_le, kilometrage, prestataire, montant_ttc, libelle").eq("vehicule_id", d.vehicule_id).order("realise_le", { ascending: false }),
      lectureDisponible(),
    ]);
    if (vehicule.error || releves.error || historique.error || !vehicule.data) return setEtat({ chargement: false, erreur: true });
    setConfigurationLecture(dispo);
    setEtat({ chargement: false, document: d, vehicule: vehicule.data, releves: releves.data, historique: historique.data });
    return d;
  }, [documentId]);

  useEffect(() => {
    if (!session) return;
    let actif = true;
    (async () => {
      const d = await charger();
      if (!actif || !d) return;
      const stockage = stockageNavigateur();
      if (d.historique_id) return effacerBrouillon(d.id, { stockage });
      if (d.lecture) appliquer({ etat: "proposee", proposition: d.lecture, reprise: true });
      // Reprendre ce que la personne avait modifié avant de quitter l'écran.
      const brouillon = lireBrouillon(d.id, { stockage });
      if (brouillon) {
        setSaisie(brouillon.saisie);
        setChoix(brouillon.choix);
        setMode(brouillon.mode);
        setTouches(new Set(brouillon.touches));
        setBrouillonRepris(true);
        return;
      }
      if (d.lecture) return;
      if (lire && !lectureLancee.current) {
        lectureLancee.current = true;
        // Un rechargement ne relance pas la lecture : la proposition est conservée.
        window.history.replaceState(window.history.state, "", window.location.pathname);
        setLecture({ etat: "en_cours" });
        const resultat = await demanderLecture(d.id);
        if (actif) appliquer(resultat);
      }
    })();
    return () => {
      actif = false;
    };
  }, [session, charger, appliquer, lire]);

  useEffect(() => {
    if (modifie) ecrireBrouillon(documentId, { saisie, choix, mode, touches: [...touches] }, { stockage: stockageNavigateur() });
  }, [modifie, documentId, saisie, choix, mode, touches]);

  const verification = useMemo(() => validerFacture(saisie, { aujourdhui }), [saisie, aujourdhui]);
  const ressemblantes = useMemo(
    () =>
      etat.historique
        ? interventionsRessemblantes(etat.historique, { realiseLe: verification.donnees.realiseLe, montantTtc: verification.donnees.montantTtc, type: verification.donnees.type })
        : [],
    [etat.historique, verification],
  );
  const conflitsKm = useMemo(
    () =>
      etat.historique && verification.donnees.kilometrage != null
        ? incoherencesKilometrage({ releves: etat.releves, historique: etat.historique }, { date: verification.donnees.realiseLe, kilometrage: verification.donnees.kilometrage })
        : [],
    [etat, verification],
  );

  // Le choix « rattacher » ne vaut que pour une intervention encore ressemblante.
  const choixValide = choix === "creer" || ressemblantes.some((h) => h.id === choix) ? choix : "";

  if (!session || etat.chargement) {
    return (
      <PageAuto session={session}>
        <SqueletteVehicules />
      </PageAuto>
    );
  }
  if (etat.erreur || etat.introuvable) {
    return (
      <PageAuto session={session}>
        <Alerte>{etat.introuvable ? "Cette facture est introuvable. Elle a peut-être été supprimée." : "Impossible de charger la facture. Vérifiez votre connexion."}</Alerte>
      </PageAuto>
    );
  }

  const { document, vehicule } = etat;
  const retour = `/auto/vehicules/${vehicule.id}`;

  if (enregistre?.document) {
    return (
      <PageAuto session={session}>
        <div className={`${carte} mt-2 p-5`}>
          <CircleCheck className="size-8 text-emerald-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground">Document conservé</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Il est rangé dans les documents de la voiture. Aucune intervention ni dépense n'a été enregistrée.</p>
          <div className="mt-5 space-y-3">
            <Link href={`${retour}#documents`} className={boutonPrincipal}>
              Voir {vehicule.marque} {vehicule.modele}
            </Link>
            <Link href={`/auto/factures/nouvelle?vehicule=${vehicule.id}`} className={boutonSecondaire}>
              Ajouter une facture
            </Link>
          </div>
        </div>
      </PageAuto>
    );
  }

  if (enregistre || document.historique_id) {
    return (
      <PageAuto session={session}>
        <div className={`${carte} mt-2 p-5`}>
          <CircleCheck className="size-8 text-emerald-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-2xl font-bold text-foreground">{enregistre ? "Facture enregistrée" : "Facture déjà enregistrée"}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {!enregistre
              ? "Elle a déjà été confirmée, peut-être depuis un autre appareil. Rien n'a été compté deux fois."
              : enregistre.rattachee
                ? "Elle justifie l'intervention existante, qui n'a pas été modifiée."
                : "L'intervention est ajoutée à l'historique de la voiture, d'après votre facture."}
          </p>
          <div className="mt-5 space-y-3">
            <Link href={retour} className={boutonPrincipal}>
              Voir {vehicule.marque} {vehicule.modele}
            </Link>
            <Link href={`/auto/factures/nouvelle?vehicule=${vehicule.id}`} className={boutonSecondaire}>
              Ajouter une autre facture
            </Link>
          </div>
        </div>
      </PageAuto>
    );
  }

  const stockage = stockageNavigateur();
  const modifier = (nom, valeur) => {
    setSaisie((s) => ({ ...s, [nom]: valeur }));
    setTouches((t) => new Set(t).add(nom));
    setModifie(true);
    if (erreurs[nom]) setErreurs((e) => ({ ...e, [nom]: undefined }));
  };
  const modifierOperations = (operations) => {
    setSaisie((s) => ({ ...s, operations, type: touches.has("type") || !operations.length ? s.type : typePrincipal(operations) }));
    setTouches((t) => new Set(t).add("operations"));
    setModifie(true);
  };
  const choisir = (valeur) => {
    setChoix(valeur);
    setModifie(true);
  };
  const oublierBrouillon = () => {
    effacerBrouillon(document.id, { stockage });
    setModifie(false);
    setBrouillonRepris(false);
  };
  const propositionConnue = lecture.etat === "proposee" ? lecture.proposition : document.lecture;
  function repartir() {
    oublierBrouillon();
    setChoix("");
    setErreurs({});
    if (propositionConnue) return appliquer({ etat: "proposee", proposition: propositionConnue, reprise: true });
    setSaisie(saisieVide());
    setTouches(new Set());
    setMode("intervention");
  }

  async function garderCommeDocument() {
    setErreurEnvoi("");
    setEnCours(true);
    const { error } = await supabase.from("auto_documents").update({ type: "autre" }).eq("id", document.id);
    setEnCours(false);
    if (error) return setErreurEnvoi(messageErreurAuto(error));
    oublierBrouillon();
    setEnregistre({ document: true });
  }

  async function relire() {
    oublierBrouillon();
    setLecture({ etat: "en_cours" });
    appliquer(await demanderLecture(document.id, { relire: true }));
  }

  async function enregistrer(evenement) {
    evenement.preventDefault();
    setErreurEnvoi("");
    const formulaire = evenement.currentTarget;
    const rattacherA = choixValide && choixValide !== "creer" ? choixValide : null;
    if (!rattacherA) {
      setErreurs(verification.erreurs);
      if (!verification.valide) return focaliserPremiereErreur(formulaire);
      if (ressemblantes.length && !choixValide) {
        setErreurEnvoi("Une intervention ressemblante existe : choisissez de rattacher la facture ou d'en créer une autre.");
        return requestAnimationFrame(() => formulaire.querySelector('input[name="choix-doublon"]')?.focus());
      }
    }
    const d = verification.donnees;
    const lectureId = lecture.etat === "proposee" ? lecture.proposition?.lectureId ?? lecture.lectureId ?? null : null;
    setEnCours(true);
    const { error } = await supabase.rpc("auto_enregistrer_facture", {
      p_document_id: document.id,
      p_rattacher_a: rattacherA,
      p_realise_le: rattacherA ? null : d.realiseLe,
      p_date_facture: d.dateFacture,
      p_type: rattacherA ? null : d.type,
      p_operations: rattacherA || !d.operations.length ? null : d.operations,
      p_prestataire: rattacherA ? null : d.prestataire,
      p_kilometrage: rattacherA ? null : d.kilometrage,
      p_montant_ttc: rattacherA ? null : d.montantTtc,
      p_libelle: rattacherA ? null : d.libelle,
      p_creer_malgre_ressemblance: choixValide === "creer",
      p_lecture_id: lectureId,
      p_corrections: lectureId && initiale ? champsCorriges(initiale, saisie) : null,
    });
    setEnCours(false);
    if (error) {
      const texte = error.message || "";
      // Confirmée entre-temps (autre onglet, autre appareil) : l'écran le montre,
      // rien n'est compté deux fois.
      if (texte.includes("auto_facture_deja_enregistree")) {
        oublierBrouillon();
        return charger();
      }
      setErreurEnvoi(messageErreurAuto(error));
      // Une intervention a pu être ajoutée entre-temps : l'écran la montre.
      if (texte.includes("auto_doublon_potentiel")) await charger();
      return;
    }
    oublierBrouillon();
    setEnregistre({ rattachee: Boolean(rattacherA) });
  }

  const formatLu = configurationLecture.disponible && configurationLecture.formats.includes(document.type_mime);
  const message =
    lecture.etat === "aucune" && !formatLu
      ? configurationLecture.disponible
        ? MESSAGES_LECTURE.illisible.format
        : MESSAGES_LECTURE.indisponible
      : messageLecture(lecture);
  const propositionVide = message === MESSAGES_LECTURE.vide;
  const surligner = (nom) => marques.incertains.has(nom) && !touches.has(nom);
  const invalide = (nom) => (erreurs[nom] ? { "aria-invalid": true, "aria-describedby": `facture-${nom}-erreur` } : {});
  const nonLu = (nom) => marques.nonLus.has(nom) && !touches.has(nom) && lecture.etat === "proposee";
  const rattachement = Boolean(choixValide && choixValide !== "creer");

  return (
    <PageAuto session={session}>
      <Link href={retour} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {vehicule.marque} {vehicule.modele}
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-foreground">Vérifier la facture</h1>
        <button
          type="button"
          onClick={async () => {
            setOuvertureRatee(false);
            setOuvertureRatee(!(await ouvrirDocument(document)));
          }}
          className={`${boutonLien} shrink-0`}
        >
          <FileText className="size-4" aria-hidden="true" />
          Voir
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
        {vehicule.marque} {vehicule.modele} <Plaque valeur={vehicule.immatriculation} />
      </p>

      <div className="mt-4 space-y-3">
        {ouvertureRatee ? <Alerte>La facture n'a pas pu être ouverte. Vérifiez votre connexion, puis réessayez.</Alerte> : null}
        {brouillonRepris ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border bg-muted px-3.5 py-2 text-sm text-foreground">
            <p>Vos modifications non enregistrées ont été reprises.</p>
            <button type="button" onClick={repartir} className="-mx-1 inline-flex min-h-10 items-center rounded-lg px-1 font-semibold text-primary hover:underline">
              {propositionConnue ? "Revenir à la proposition" : "Tout effacer"}
            </button>
          </div>
        ) : null}
        {lecture.etat === "en_cours" ? (
          <div role="status" className={`${carte} flex items-center gap-3`}>
            <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
            <p className="text-[15px] text-foreground">Lecture de la facture…</p>
          </div>
        ) : lecture.etat === "proposee" && !propositionVide && mode === "intervention" ? (
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-950">
            <ScanText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Nexora a essayé de préremplir les informations d'après votre facture. Vérifiez les champs <span className="rounded bg-amber-100 px-1 font-semibold text-amber-900">à vérifier</span>, complétez ce qui manque, puis enregistrez.
            </p>
          </div>
        ) : message ? (
          <p role="status" className="rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-foreground">
            {message} Votre facture est conservée dans le dossier.
          </p>
        ) : null}
        {lecture.etat === "echec" && !ECHECS_DEFINITIFS.has(lecture.raison) ? (
          <button type="button" onClick={relire} className={boutonLien}>
            <ScanText className="size-4" aria-hidden="true" />
            Réessayer la lecture
          </button>
        ) : null}
        {lecture.etat === "aucune" && formatLu ? (
          <button type="button" onClick={relire} className={boutonLien}>
            <ScanText className="size-4" aria-hidden="true" />
            Lire la facture automatiquement
          </button>
        ) : null}
        {marques.estFacture === false && lecture.etat === "proposee" && mode === "intervention" ? (
          <Alerte>Ce document ne ressemble pas à une facture : vérifiez chaque information avant de l'enregistrer comme intervention.</Alerte>
        ) : null}
        {mode === "intervention" && plaqueDifferente(vehicule, marques.immatriculationLue) ? (
          <Alerte>
            La facture mentionne la plaque {marques.immatriculationLue}, différente de celle de cette voiture. Vérifiez qu'il s'agit du bon véhicule.
          </Alerte>
        ) : null}
      </div>

      {mode === "document" ? (
        <section className={`${carte} mt-4 p-5`} aria-labelledby="titre-non-facture">
          <h2 id="titre-non-facture" className="font-semibold text-foreground">
            Ce document ne ressemble pas à une facture
          </h2>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            Devis, attestation ou autre document : il est conservé dans les documents de la voiture. Aucune intervention ni dépense n'est enregistrée.
          </p>
          {erreurEnvoi ? (
            <div className="mt-3">
              <Alerte>{erreurEnvoi}</Alerte>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            <button type="button" onClick={garderCommeDocument} disabled={enCours} className={boutonPrincipal}>
              {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
              Le garder comme document
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("intervention");
                setModifie(true);
              }}
              disabled={enCours}
              className={boutonSecondaire}
            >
              C'est bien une facture : renseigner l'intervention
            </button>
          </div>
        </section>
      ) : (
      <form onSubmit={enregistrer} noValidate className={`${carte} mt-4 space-y-5 p-5`} aria-busy={lecture.etat === "en_cours"}>
        {ressemblantes.length ? (
          <fieldset className="min-w-0 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
            <legend className="px-1 text-sm font-semibold text-amber-950">Intervention ressemblante déjà enregistrée</legend>
            <p className="text-[13px] text-amber-950">Même date{ressemblantes.some((h) => h.montant_ttc != null) ? " et même montant" : " et même type"}. Nexora ne fusionne rien : à vous de choisir.</p>
            <div className="mt-2 space-y-2">
              {ressemblantes.map((h) => (
                <label key={h.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2.5 text-sm">
                  <input type="radio" name="choix-doublon" value={h.id} checked={choixValide === h.id} onChange={() => choisir(h.id)} className="mt-0.5 size-4 accent-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Rattacher à cette intervention</span>
                    <span className="block text-muted-foreground">
                      {[`${libelleDe(TYPES_INTERVENTION, h.type)} du ${formaterDate(h.realise_le)}`, h.montant_ttc != null ? formaterEuros(h.montant_ttc) : null, h.prestataire].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2.5 text-sm">
                <input type="radio" name="choix-doublon" value="creer" checked={choixValide === "creer"} onChange={() => choisir("creer")} className="mt-0.5 size-4 accent-primary" />
                <span className="font-semibold text-foreground">Créer une autre intervention</span>
              </label>
            </div>
            {rattachement ? <p className="mt-2 text-[13px] text-amber-950">La facture sera jointe à cette intervention, sans la modifier ni compter de dépense en plus.</p> : null}
          </fieldset>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Champ nom="dateIntervention" label="Date de l'intervention" surligner={surligner} nonLu={nonLu} erreur={erreurs.dateIntervention} className="col-span-2 sm:col-span-1">
            <input id="facture-dateIntervention" type="date" max={aujourdhui} value={saisie.dateIntervention} onChange={(e) => modifier("dateIntervention", e.target.value)} className={champ} disabled={rattachement} {...invalide("dateIntervention")} />
          </Champ>
          <Champ nom="dateFacture" label="Date de la facture" facultatif surligner={surligner} nonLu={nonLu} erreur={erreurs.dateFacture} avertissement={verification.avertissements.dateFacture} className="col-span-2 sm:col-span-1">
            <input id="facture-dateFacture" type="date" max={aujourdhui} value={saisie.dateFacture} onChange={(e) => modifier("dateFacture", e.target.value)} className={champ} {...invalide("dateFacture")} />
          </Champ>
        </div>

        <fieldset disabled={rattachement} className="min-w-0 space-y-5 disabled:opacity-50">
          <Champ nom="professionnel" label="Professionnel" facultatif surligner={surligner} nonLu={nonLu}>
            <input id="facture-professionnel" value={saisie.professionnel} maxLength={120} onChange={(e) => modifier("professionnel", e.target.value)} className={champ} placeholder="Garage, centre auto…" />
          </Champ>

          <EditeurOperations operations={saisie.operations} surligne={surligner("operations")} nonLue={nonLu("operations")} onChange={modifierOperations} />

          <Champ nom="type" label="Classée comme" surligner={surligner} nonLu={() => false} erreur={erreurs.type} aideTexte="Une vidange seule reste une vidange : « Révision » seulement si la facture le dit.">
            <select id="facture-type" value={saisie.type} onChange={(e) => modifier("type", e.target.value)} className={`${champ} appearance-none`} {...invalide("type")}>
              <option value="">—</option>
              {TYPES_INTERVENTION.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </Champ>

          <div className="grid grid-cols-2 gap-3">
            <Champ nom="kilometrage" label="Kilométrage" facultatif surligner={surligner} nonLu={nonLu} erreur={erreurs.kilometrage} className="col-span-2 sm:col-span-1">
              <div className="relative">
                <input id="facture-kilometrage" inputMode="numeric" value={saisie.kilometrage} onChange={(e) => modifier("kilometrage", e.target.value)} className={`${champ} pr-10`} {...invalide("kilometrage")} />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">km</span>
              </div>
            </Champ>
            <Champ nom="montant" label="Montant TTC" facultatif surligner={surligner} nonLu={nonLu} erreur={erreurs.montant} aideTexte="Le total de la facture, compté une fois." className="col-span-2 sm:col-span-1">
              <div className="relative">
                <input id="facture-montant" inputMode="decimal" value={saisie.montant} onChange={(e) => modifier("montant", e.target.value)} className={`${champ} pr-8`} placeholder="0,00" {...invalide("montant")} />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">€</span>
              </div>
            </Champ>
          </div>
          {conflitsKm.length ? (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-950">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Ce kilométrage ne concorde pas avec {conflitsKm.length > 1 ? "des relevés enregistrés" : "un relevé enregistré"} :{" "}
                {conflitsKm.map((p) => `${formaterKm(p.kilometrage)} le ${formaterDate(p.date)}`).join(", ")}. L'erreur peut venir de la facture ou d'une saisie précédente : rien ne sera remplacé.
              </p>
            </div>
          ) : null}
        </fieldset>

        {erreurEnvoi ? <Alerte>{erreurEnvoi}</Alerte> : null}

        <div className="space-y-3 pt-1">
          <button type="submit" disabled={enCours || lecture.etat === "en_cours"} className={boutonPrincipal}>
            {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
            {rattachement ? "Rattacher la facture" : "Enregistrer la facture"}
          </button>
          <Link href={`${retour}#documents`} className={boutonSecondaire}>
            Plus tard
          </Link>
          <p className={`${aide} text-center`}>
            « Plus tard » : la facture reste dans les documents de la voiture{modifie || brouillonRepris ? ", et vos modifications sont gardées sur cet appareil" : ""}.
          </p>
        </div>
      </form>
      )}
    </PageAuto>
  );
}

function Champ({ nom, label, facultatif = false, surligner, nonLu, erreur, avertissement, aideTexte, className = "", children }) {
  const aVerifier = surligner(nom);
  return (
    <div className={cn(className, aVerifier ? "rounded-xl bg-amber-50 p-2 ring-2 ring-amber-300" : "")}>
      <label htmlFor={`facture-${nom}`} className={cn(etiquette, "flex flex-wrap items-center gap-x-2")}>
        <span>
          {label} {facultatif ? <span className="font-normal text-muted-foreground">(facultatif)</span> : null}
        </span>
        {aVerifier ? <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">À vérifier</span> : null}
      </label>
      {children}
      {erreur ? (
        <p id={`facture-${nom}-erreur`} className="mt-1.5 text-[13px] font-medium text-destructive">
          {erreur}
        </p>
      ) : null}
      {!erreur && avertissement ? <p className="mt-1.5 text-[13px] text-amber-800">{avertissement}</p> : null}
      {!erreur && nonLu(nom) ? <p className={aide}>Non lu sur la facture.</p> : null}
      {aideTexte ? <p className={aide}>{aideTexte}</p> : null}
    </div>
  );
}
