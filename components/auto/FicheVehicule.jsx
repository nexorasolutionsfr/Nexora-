"use client";

// Fiche d'une voiture : kilométrage, échéances, historique.
//
// Chaque échéance dit d'où elle vient, et quand elle ne peut pas être
// calculée, l'écran demande l'information qui manque au lieu d'inventer une
// valeur. Un seul petit formulaire ouvert à la fois.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BatteryCharging,
  CalendarClock,
  CircleDot,
  ClipboardCheck,
  Disc,
  Droplet,
  Gauge,
  History,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  Snowflake,
  Sparkles,
  Star,
  Trash2,
  Wrench,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { aujourdhuiIso, dernierKilometrage, prochainControleTechnique, prochainEntretien } from "@/lib/auto/echeances";
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
  champ,
  etiquette,
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
  delaiLisible,
  formaterDate,
  formaterEuros,
  formaterKm,
  formaterNombre,
  libelleDe,
  messageErreurAuto,
  resumeEntretien,
} from "@/components/auto/format";
import { validerIntervalle, validerIntervention, validerReleve } from "@/components/auto/validation";

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

export default function FicheVehicule({ vehiculeId }) {
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
        .select("id, type, realise_le, kilometrage, libelle, prestataire, montant_ttc, source, created_at, resultat_controle, controle_valable_jusqu_au")
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
  }, [vehiculeId]);

  useEffect(() => {
    if (session) charger();
  }, [session, charger]);

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
  const ct = prochainControleTechnique({ dateMiseEnCirculation: vehicule.date_mise_en_circulation, historique });
  const entretien = prochainEntretien({
    intervalleKm: vehicule.intervalle_entretien_km,
    intervalleMois: vehicule.intervalle_entretien_mois,
    historique,
    releves,
  });
  const details = [libelleDe(ENERGIES, vehicule.energie), vehicule.annee].filter(Boolean).join(" · ");
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
        <section className={`${carte} mt-3 p-5`}>
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

      {/* Kilométrage */}
      <section className={`${carte} mt-3`} aria-labelledby="titre-km">
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
      <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Échéances</h2>
      <div className="space-y-3">
        <section className={carte} aria-labelledby="titre-ct">
          <div className="flex items-start gap-3">
            <IconeRonde icone={CalendarClock} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="titre-ct" className="font-semibold text-foreground">
                  Contrôle technique
                </h3>
                <Pastille ton={ct.etat === "a_renseigner" ? "neutre" : ct.niveau}>
                  {ct.etat === "a_renseigner" ? "À renseigner" : ct.etat === "contre_visite" ? `Contre-visite ${delaiLisible(ct.joursRestants)}` : delaiLisible(ct.joursRestants)}
                </Pastille>
              </div>
              <TexteControle ct={ct} vehicule={vehicule} />
            </div>
          </div>
          {ouvert === "mise_en_circulation" ? (
            <FormulaireMiseEnCirculation vehiculeId={vehicule.id} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Date de mise en circulation enregistrée.")} />
          ) : ouvert === "controle" ? (
            <FormulaireIntervention vehiculeId={vehicule.id} typeFixe="controle_technique" onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Contrôle technique ajouté à l'historique.")} />
          ) : ouvert === "proces_verbal" && dernierControle ? (
            <FormulaireProcesVerbal controle={dernierControle} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Date du procès-verbal enregistrée.")} />
          ) : (
            <ActionControle ct={ct} dernierControle={dernierControle} ouvrir={ouvrir} />
          )}
        </section>

        <section className={carte} aria-labelledby="titre-entretien">
          <div className="flex items-start gap-3">
            <IconeRonde icone={Wrench} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="titre-entretien" className="font-semibold text-foreground">
                  Prochaine révision
                </h3>
                <Pastille ton={resumeEntretien(entretien, { avecSujet: false }).ton}>{resumeEntretien(entretien, { avecSujet: false }).texte}</Pastille>
              </div>
              <TexteEntretien entretien={entretien} vehicule={vehicule} />
            </div>
          </div>
          {ouvert === "intervalle" ? (
            <FormulaireIntervalle vehicule={vehicule} onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Intervalle de révision enregistré.")} />
          ) : ouvert === "entretien" ? (
            <FormulaireIntervention vehiculeId={vehicule.id} typeFixe="revision" onAnnuler={() => setOuvert(null)} onEnregistre={() => apresEnregistrement("Révision ajoutée à l'historique.")} />
          ) : entretien.etat === "dernier_entretien_a_renseigner" ? (
            <button type="button" onClick={() => ouvrir("entretien")} className={`${boutonLien} -ml-2 mt-2`}>
              <Plus className="size-4" aria-hidden="true" />
              Ajouter la dernière révision
            </button>
          ) : (
            <button type="button" onClick={() => ouvrir("intervalle")} className={`${boutonLien} -ml-2 mt-2`}>
              {entretien.etat === "intervalle_a_renseigner" ? <Plus className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
              {entretien.etat === "intervalle_a_renseigner" ? "Renseigner l'intervalle de révision" : "Modifier l'intervalle"}
            </button>
          )}
        </section>
      </div>

      <div className="mt-3">
        <BlocDepenses historique={historique} />
      </div>

      {/* Historique */}
      <div className="mb-2 mt-7 flex items-center justify-between">
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

function Texte({ principal, aideTexte }) {
  return (
    <>
      {principal ? <p className="mt-1 text-[15px] leading-snug text-foreground">{principal}</p> : null}
      {aideTexte ? <p className={aide}>{aideTexte}</p> : null}
    </>
  );
}

// Ce que l'écran dit du contrôle technique, avec la source de chaque date.
function TexteControle({ ct, vehicule }) {
  if (ct.etat === "contre_visite") {
    return (
      <Texte
        principal={`Contre-visite avant le ${formaterDate(ct.date)}`}
        aideTexte={`Délai de 2 mois après le contrôle du ${formaterDate(ct.dernierLe)}. Ajoutez la contre-visite une fois passée, avec la date de son procès-verbal.`}
      />
    );
  }
  if (ct.etat === "a_renseigner") {
    const textes = {
      mise_en_circulation: "Indiquez la date de première mise en circulation pour le calculer.",
      dernier_controle: "La voiture a plus de 4 ans : indiquez la date de son dernier contrôle.",
      date_proces_verbal: "Après une contre-visite, la date du prochain contrôle se lit sur le procès-verbal. Indiquez-la.",
    };
    return <Texte principal={textes[ct.manque]} />;
  }
  const aides = {
    proces_verbal: `Date inscrite sur le procès-verbal du contrôle du ${formaterDate(ct.dernierLe)}.`,
    dernier_controle: `Estimation : 2 ans après le contrôle du ${formaterDate(ct.dernierLe)}, règle d'une voiture particulière. La date du procès-verbal fait foi.`,
    mise_en_circulation: `Premier contrôle d'une voiture particulière : dans les 6 mois avant ses 4 ans (mise en circulation le ${formaterDate(vehicule.date_mise_en_circulation)}), donc à partir du ${formaterDate(ct.fenetreOuverteLe)}.`,
  };
  return <Texte principal={`Avant le ${formaterDate(ct.date)}`} aideTexte={aides[ct.source]} />;
}

function ActionControle({ ct, dernierControle, ouvrir }) {
  const bouton = (nom, libelle, Icone = Plus) => (
    <button type="button" onClick={() => ouvrir(nom)} className={`${boutonLien} -ml-2 mt-2`}>
      <Icone className="size-4" aria-hidden="true" />
      {libelle}
    </button>
  );
  const pvModifiable = dernierControle?.source === "proprietaire";
  if (ct.etat === "a_renseigner" && ct.manque === "mise_en_circulation") return bouton("mise_en_circulation", "Renseigner la mise en circulation");
  if (ct.etat === "a_renseigner" && ct.manque === "dernier_controle") return bouton("controle", "Ajouter le dernier contrôle");
  if (ct.etat === "contre_visite") return bouton("controle", "Ajouter la contre-visite");
  if (pvModifiable && (ct.manque === "date_proces_verbal" || ct.source === "dernier_controle")) {
    return bouton("proces_verbal", "Indiquer la date du procès-verbal", Pencil);
  }
  if (ct.etat === "calcule" && ct.source === "proces_verbal") return bouton("controle", "Ajouter un contrôle passé");
  return null;
}

function TexteEntretien({ entretien, vehicule }) {
  if (entretien.etat === "intervalle_a_renseigner") {
    return <Texte principal="Recopiez l'intervalle de révision indiqué dans votre carnet d'entretien." />;
  }
  if (entretien.etat === "dernier_entretien_a_renseigner") {
    return <Texte principal="Ajoutez votre dernière révision, avec son kilométrage." aideTexte="Une vidange seule ne compte pas comme une révision." />;
  }
  const parties = [];
  if (entretien.parKm) parties.push(`vers ${formaterKm(entretien.parKm.limite)}`);
  if (entretien.parDate) parties.push(`avant le ${formaterDate(entretien.parDate.limite)}`);
  const principal = parties.join(" ou ");
  const intervalle = [
    vehicule.intervalle_entretien_km ? formaterKm(vehicule.intervalle_entretien_km) : null,
    vehicule.intervalle_entretien_mois ? `${vehicule.intervalle_entretien_mois} mois` : null,
  ]
    .filter(Boolean)
    .join(" ou ");
  const depuis = entretien.depuis;
  return (
    <>
      <Texte
        principal={principal ? principal.charAt(0).toUpperCase() + principal.slice(1) : ""}
        aideTexte={`Selon l'intervalle que vous avez renseigné (tous les ${intervalle}), depuis la révision du ${formaterDate(depuis.date)}${depuis.kilometrage != null ? ` à ${formaterKm(depuis.kilometrage)}` : ""}.`}
      />
      {entretien.parKm && entretien.parKm.restants == null ? <p className={aide}>Mettez à jour le kilométrage pour savoir ce qu'il reste.</p> : null}
      {vehicule.intervalle_entretien_km && depuis.kilometrage == null ? <p className={aide}>Ajoutez le kilométrage de cette révision pour suivre l'échéance en kilomètres.</p> : null}
    </>
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

function FormulaireIntervention({ vehiculeId, typeFixe, typeDefaut = "", onAnnuler, onEnregistre }) {
  const aujourdhui = aujourdhuiIso();
  const [saisie, setSaisie] = useState({ type: typeFixe ?? typeDefaut, realiseLe: "", kilometrage: "", prestataire: "", montant: "", libelle: "", resultatControle: "", controleValableJusquAu: "" });
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
          <div>
            <label htmlFor="intervention-resultat" className={etiquette}>
              Résultat
            </label>
            <select id="intervention-resultat" value={saisie.resultatControle} onChange={changer("resultatControle")} className={`${champ} appearance-none`}>
              <option value="">Non précisé</option>
              <option value="favorable">Favorable</option>
              <option value="contre_visite">Contre-visite</option>
            </select>
          </div>
          <div>
            <label htmlFor="intervention-validite" className={etiquette}>
              Prochain avant le <span className="font-normal text-muted-foreground">(PV)</span>
            </label>
            <input id="intervention-validite" type="date" value={saisie.controleValableJusquAu} onChange={changer("controleValableJusquAu")} className={champ} aria-invalid={erreurs.controleValableJusquAu ? true : undefined} />
          </div>
          <p className={`${aide} col-span-2 -mt-1`}>La date inscrite sur le procès-verbal prime sur tout calcul.</p>
          <div className="col-span-2 -mt-2">
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
      <ol className={`${carte} divide-y divide-border p-0`}>
        {historique.map((ligne) => {
          const Icone = ICONES[ligne.type] ?? Wrench;
          const justificatifs = documents.filter((d) => d.historique_id === ligne.id);
          const meta = [
            ligne.kilometrage != null ? formaterKm(ligne.kilometrage) : null,
            ligne.prestataire,
            ligne.montant_ttc != null ? formaterEuros(ligne.montant_ttc) : null,
            ligne.controle_valable_jusqu_au ? `prochain avant le ${formaterDate(ligne.controle_valable_jusqu_au)}` : null,
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
                  {ligne.resultat_controle === "contre_visite" ? <Pastille ton="proche">Contre-visite</Pastille> : null}
                  {ligne.source === "prestation" ? <Pastille ton="ok">Nexora</Pastille> : null}
                </div>
                {meta.length ? <p className="mt-0.5 text-sm text-muted-foreground">{meta.join(" · ")}</p> : null}
                {ligne.libelle ? <p className="mt-0.5 text-sm text-foreground/80">{ligne.libelle}</p> : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted-foreground">{ligne.source === "prestation" ? "Enregistrée par Nexora" : "Saisie par vous"}</span>
                  {justificatifs.length ? (
                    <button type="button" onClick={() => ouvrirDocument(justificatifs[0])} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      {justificatifs.length > 1 ? `${justificatifs.length} justificatifs` : "Justificatif"}
                    </button>
                  ) : onJoindre ? (
                    <button type="button" onClick={() => onJoindre(ligne)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
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
