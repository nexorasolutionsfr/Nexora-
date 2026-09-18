"use client";

// « Rappel par e-mail », sous l'échéance du contrôle technique.
//
// La personne choisit d'être prévenue : le canal, l'adresse et le moment sont
// écrits AVANT qu'elle active, et l'arrêt est à un clic. Rien n'est repris du
// compte garage : le consentement est celui-ci (auto_activer_rappel).
//
// Tant que le parcours n'est pas éprouvé de bout en bout avec un envoi réel,
// ce panneau n'existe qu'où NEXT_PUBLIC_AUTO_RAPPELS vaut « actif » (recette
// locale sur Test) : en Production, aucune promesse de rappel n'est affichée.
//
// Ce qu'il dit vient de etatRappel() (lib/auto/rappels.js, testé).

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, LoaderCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { etatRappel, jourParis, libelleMoment, momentParDefaut, momentsPossibles, origineDate, rappelPossible } from "@/lib/auto/rappels";
import { Alerte, aide, boutonLien, boutonPrincipal, boutonSecondaire, etiquette } from "@/components/auto/elements";
import { messageErreurAuto } from "@/components/auto/format";

export const RAPPELS_ACTIFS = process.env.NEXT_PUBLIC_AUTO_RAPPELS === "actif";

export default function RappelControle({ vehiculeId, element }) {
  const [lu, setLu] = useState(null);
  const [indisponible, setIndisponible] = useState(false);
  const [formulaire, setFormulaire] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc("auto_etat_rappel", { p_vehicule_id: vehiculeId });
    if (error) {
      // Fonction absente (base sans le rappel) ou accès refusé : on ne montre
      // rien plutôt qu'un rappel qu'on ne pourrait pas tenir.
      setIndisponible(true);
      return;
    }
    setLu(data);
  }, [vehiculeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture de l'état du rappel au montage et quand la voiture change.
    charger();
  }, [charger]);

  if (indisponible || !lu) return null;

  const aujourdhui = jourParis();
  const etat = etatRappel({ lu, element, aujourdhui });
  if (etat.cas === "masque") return null;

  async function activer(delaiJours, texteSucces) {
    setErreur("");
    setMessage("");
    setEnCours(true);
    const { data, error } = await supabase.rpc("auto_activer_rappel", { p_vehicule_id: vehiculeId, p_delai_jours: delaiJours });
    setEnCours(false);
    if (error) return setErreur(messageErreurAuto(error));
    if (!data?.ok) {
      return setErreur(
        data?.raison === "adresse_absente"
          ? "Votre compte n'a pas d'adresse e-mail confirmée : le rappel ne peut pas être envoyé."
          : "Cette voiture est archivée : le rappel ne peut pas être activé.",
      );
    }
    setFormulaire(false);
    setMessage(texteSucces(data));
    await charger();
  }

  async function arreter() {
    setErreur("");
    setMessage("");
    setEnCours(true);
    const { error } = await supabase.rpc("auto_desactiver_rappel", { p_vehicule_id: vehiculeId });
    setEnCours(false);
    if (error) return setErreur(messageErreurAuto(error));
    setFormulaire(false);
    setMessage("Rappel arrêté : aucun e-mail ne partira.");
    await charger();
  }

  const possibles = rappelPossible(element).possible ? momentsPossibles(element.date, { aujourdhui }) : [];

  return (
    <div className="mt-3 border-t border-border pt-3">
      {formulaire ? (
        <FormulaireRappel
          adresse={lu.adresse_compte}
          element={element}
          possibles={possibles}
          delaiActuel={lu.abonnement?.actif ? lu.abonnement.delai_jours : null}
          enCours={enCours}
          onAnnuler={() => setFormulaire(false)}
          onValider={(delai) => {
            const moment = possibles.find((m) => m.jours === delai);
            activer(delai, (data) => `Rappel activé : un e-mail ${libelleMoment({ jour: moment?.jour })}, à ${data.adresse}.`);
          }}
        />
      ) : (
        <Etat etat={etat} possibles={possibles} enCours={enCours} onOuvrir={() => setFormulaire(true)} onArreter={arreter} onConfirmer={() => activer(etat.delaiJours, (data) => `Adresse confirmée : le rappel partira à ${data.adresse}.`)} />
      )}
      {erreur ? <div className="mt-2"><Alerte>{erreur}</Alerte></div> : null}
      <p aria-live="polite" className={message ? `${aide} mt-2 text-foreground` : "sr-only"}>
        {message}
      </p>
    </div>
  );
}

function Etat({ etat, possibles, enCours, onOuvrir, onArreter, onConfirmer }) {
  if (etat.cas === "proposable") {
    if (possibles.length === 0) {
      return <p className={aide}>L'échéance est trop proche pour un rappel par e-mail : elle reste en tête de « Aujourd'hui ».</p>;
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Bell className="size-4 shrink-0" aria-hidden="true" />
          Être prévenu par e-mail avant cette échéance.
        </p>
        <button type="button" onClick={onOuvrir} className={boutonLien}>
          Activer le rappel
        </button>
      </div>
    );
  }

  const titres = {
    programme: `Rappel par e-mail ${etat.moment}`,
    envoye: `Rappel envoyé ${etat.moment}`,
    en_cours: "Rappel en cours d'envoi",
    adresse_a_confirmer: "Rappel en attente : l'adresse de votre compte a changé",
    echec: "Le rappel n'a pas pu partir",
    sans_envoi: "Rappel actif, aucun e-mail prévu",
  };
  const details = {
    programme: `À ${etat.adresse}.`,
    envoye: `À ${etat.adresse}.`,
    en_cours: `À ${etat.adresse}.`,
    adresse_a_confirmer: `Il avait été activé pour ${etat.adresse}. Confirmez pour l'envoyer à ${etat.adresseCompte}.`,
    echec: `L'envoi à ${etat.adresse} a été refusé. Vérifiez l'adresse de votre compte, puis réessayez.`,
    sans_envoi: `Il n'y a rien à rappeler pour l'instant : ${etat.raison}.`,
  };
  const inactif = etat.cas === "sans_envoi" || etat.cas === "echec";

  return (
    <div>
      <p className="flex items-start gap-2 text-[15px] font-medium leading-snug text-foreground">
        {inactif ? <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
        <span className="min-w-0">{titres[etat.cas]}</span>
      </p>
      <p className={`${aide} ml-6 break-words`}>{details[etat.cas]}</p>
      <div className="-ml-2 mt-1 flex flex-wrap gap-x-1">
        {etat.cas === "adresse_a_confirmer" ? (
          <button type="button" onClick={onConfirmer} disabled={enCours} className={boutonLien}>
            Confirmer l'adresse
          </button>
        ) : null}
        {etat.cas === "echec" ? (
          <button type="button" onClick={onConfirmer} disabled={enCours} className={boutonLien}>
            Réessayer
          </button>
        ) : null}
        {possibles.length > 0 && etat.cas === "programme" ? (
          <button type="button" onClick={onOuvrir} disabled={enCours} className={boutonLien}>
            Modifier
          </button>
        ) : null}
        <button type="button" onClick={onArreter} disabled={enCours} className={boutonLien}>
          {enCours ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          Arrêter le rappel
        </button>
      </div>
    </div>
  );
}

function FormulaireRappel({ adresse, element, possibles, delaiActuel, enCours, onAnnuler, onValider }) {
  const [delai, setDelai] = useState(() => (possibles.some((m) => m.jours === delaiActuel) ? delaiActuel : momentParDefaut(possibles)?.jours ?? null));
  const choisi = possibles.find((m) => m.jours === delai);

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (delai) onValider(delai);
      }}
      className="space-y-3"
    >
      <p className="font-semibold text-foreground">Rappel par e-mail</p>

      <div>
        <p className={etiquette}>À</p>
        <p className="break-words text-[15px] text-foreground">{adresse}</p>
        <p className={aide}>L'adresse de votre compte Nexora.</p>
      </div>

      {possibles.length > 1 ? (
        <fieldset>
          <legend className={etiquette}>Quand</legend>
          <div className="space-y-1.5">
            {possibles.map((m) => (
              <label key={m.jours} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-secondary/40">
                <input type="radio" name="moment-rappel" value={m.jours} checked={delai === m.jours} onChange={() => setDelai(m.jours)} className="size-4 accent-primary" />
                <span className="min-w-0 text-[15px] leading-snug">
                  <span className="font-medium text-foreground">{m.libelle}</span>
                  <span className="text-muted-foreground"> — {libelleMoment({ jour: m.jour })}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div>
          <p className={etiquette}>Quand</p>
          <p className="text-[15px] text-foreground">
            {choisi?.libelle} — {libelleMoment({ jour: choisi?.jour })}
          </p>
        </div>
      )}

      <p className={aide}>
        <span className="font-semibold text-foreground/80">D'après :</span> {origineDate(element)}
      </p>

      <div className="space-y-2">
        <button type="submit" disabled={enCours || !delai} className={boutonPrincipal}>
          {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
          {delaiActuel ? "Enregistrer" : "Activer le rappel"}
        </button>
        <button type="button" onClick={onAnnuler} disabled={enCours} className={boutonSecondaire}>
          Annuler
        </button>
      </div>
      {/* Ce que la personne accepte, dit exactement : un e-mail par échéance,
          et l'abonnement suit les contrôles suivants de cette voiture. */}
      <p className={aide}>Un e-mail avant chaque contrôle technique de cette voiture, rien d'autre. Vous pourrez l'arrêter à tout moment.</p>
    </form>
  );
}
