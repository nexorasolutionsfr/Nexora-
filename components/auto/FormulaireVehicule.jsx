"use client";

// Formulaire d'une voiture, en création comme en modification. En création
// seulement, deux informations de plus : le kilométrage actuel et la date du
// dernier contrôle technique, enregistrés avec la voiture en une transaction.

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { aujourdhuiIso } from "@/lib/auto/echeances";
import { afficherImmatriculation } from "@/lib/auto/immatriculation";
import { Alerte, aide, boutonPrincipal, boutonSecondaire, champ, etiquette } from "@/components/auto/elements";
import { ENERGIES, MARQUES_COURANTES } from "@/components/auto/format";
import { validerVehicule } from "@/components/auto/validation";

function valeursDepart(vehicule) {
  return {
    marque: vehicule?.marque ?? "",
    modele: vehicule?.modele ?? "",
    annee: vehicule?.annee ? String(vehicule.annee) : "",
    energie: vehicule?.energie ?? "",
    motorisation: vehicule?.motorisation ?? "",
    immatriculation: vehicule?.immatriculation ? afficherImmatriculation(vehicule.immatriculation) : "",
    dateMiseEnCirculation: vehicule?.date_mise_en_circulation ?? "",
    kilometrage: "",
    dernierControle: "",
    controleValableJusquAu: "",
  };
}

export default function FormulaireVehicule({ vehicule, creation = false, libelleBouton, onEnregistrer, onAnnuler }) {
  const [saisie, setSaisie] = useState(() => valeursDepart(vehicule));
  const [erreurs, setErreurs] = useState({});
  const [avertissements, setAvertissements] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);
  const aujourdhui = aujourdhuiIso();

  function modifier(champNom) {
    return (evenement) => {
      const valeur = evenement.target.value;
      setSaisie((s) => ({ ...s, [champNom]: valeur }));
      if (erreurs[champNom]) setErreurs((e) => ({ ...e, [champNom]: undefined }));
    };
  }

  async function soumettre(evenement) {
    evenement.preventDefault();
    setErreurEnvoi("");
    const verification = validerVehicule(saisie, { aujourdhui, creation });
    setErreurs(verification.erreurs);
    setAvertissements(verification.avertissements);
    if (!verification.valide) return;
    setEnCours(true);
    const message = await onEnregistrer(verification.donnees);
    setEnCours(false);
    if (message) setErreurEnvoi(message);
  }

  const erreurDe = (nom) =>
    erreurs[nom] ? (
      <p id={`auto-${nom}-erreur`} className="mt-1.5 text-[13px] font-medium text-destructive">
        {erreurs[nom]}
      </p>
    ) : null;

  const attributs = (nom) => ({
    id: `auto-${nom}`,
    value: saisie[nom],
    onChange: modifier(nom),
    "aria-invalid": erreurs[nom] ? true : undefined,
    "aria-describedby": erreurs[nom] ? `auto-${nom}-erreur` : undefined,
  });

  return (
    <form onSubmit={soumettre} noValidate className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">La voiture</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="auto-marque" className={etiquette}>
              Marque
            </label>
            <input {...attributs("marque")} list="auto-marques" autoComplete="off" className={champ} placeholder="Peugeot" />
            <datalist id="auto-marques">
              {MARQUES_COURANTES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {erreurDe("marque")}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="auto-modele" className={etiquette}>
              Modèle
            </label>
            <input {...attributs("modele")} autoComplete="off" className={champ} placeholder="308" />
            {erreurDe("modele")}
          </div>
          <div>
            <label htmlFor="auto-annee" className={etiquette}>
              Année <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <input {...attributs("annee")} inputMode="numeric" maxLength={4} className={champ} placeholder="2019" />
            {erreurDe("annee")}
          </div>
          <div>
            <label htmlFor="auto-energie" className={etiquette}>
              Énergie <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <select {...attributs("energie")} className={`${champ} appearance-none`}>
              <option value="">—</option>
              {ENERGIES.map((e) => (
                <option key={e.valeur} value={e.valeur}>
                  {e.libelle}
                </option>
              ))}
            </select>
            {erreurDe("energie")}
          </div>
        </div>
        {!creation ? (
          <div>
            <label htmlFor="auto-motorisation" className={etiquette}>
              Motorisation <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <input {...attributs("motorisation")} maxLength={80} autoComplete="off" className={champ} placeholder="1.2 PureTech 130" />
            {erreurDe("motorisation")}
            <p className={aide}>Telle qu'indiquée sur la carte grise ou le carnet. Elle précise les fiches de service.</p>
          </div>
        ) : null}
        <div>
          <label htmlFor="auto-immatriculation" className={etiquette}>
            Plaque d'immatriculation <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <input
            {...attributs("immatriculation")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={`${champ} font-mono uppercase tracking-wider`}
            placeholder="AB-123-CD"
          />
          {erreurDe("immatriculation")}
          {!erreurs.immatriculation && avertissements.immatriculation ? <p className={aide}>{avertissements.immatriculation}</p> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pour calculer vos échéances</legend>
        <div>
          <label htmlFor="auto-dateMiseEnCirculation" className={etiquette}>
            Première mise en circulation <span className="font-normal text-muted-foreground">(facultatif)</span>
          </label>
          <input {...attributs("dateMiseEnCirculation")} type="date" max={aujourdhui} className={champ} />
          {erreurDe("dateMiseEnCirculation")}
          <p className={aide}>Case B de la carte grise.</p>
        </div>
        {creation ? (
          <>
            <div>
              <label htmlFor="auto-dernierControle" className={etiquette}>
                Dernier contrôle technique <span className="font-normal text-muted-foreground">(facultatif)</span>
              </label>
              <input {...attributs("dernierControle")} type="date" max={aujourdhui} className={champ} />
              {erreurDe("dernierControle")}
              <p className={aide}>Laissez vide si la voiture a moins de 4 ans.</p>
            </div>
            <div>
              <label htmlFor="auto-controleValableJusquAu" className={etiquette}>
                Prochain contrôle avant le <span className="font-normal text-muted-foreground">(facultatif)</span>
              </label>
              <input {...attributs("controleValableJusquAu")} type="date" className={champ} />
              {erreurDe("controleValableJusquAu")}
              <p className={aide}>Date inscrite sur le procès-verbal du dernier contrôle. Elle prime sur tout calcul.</p>
            </div>
            <div>
              <label htmlFor="auto-kilometrage" className={etiquette}>
                Kilométrage actuel <span className="font-normal text-muted-foreground">(facultatif)</span>
              </label>
              <div className="relative">
                <input {...attributs("kilometrage")} inputMode="numeric" className={`${champ} pr-12`} placeholder="61 400" />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">km</span>
              </div>
              {erreurDe("kilometrage")}
            </div>
          </>
        ) : null}
      </fieldset>

      {erreurEnvoi ? <Alerte>{erreurEnvoi}</Alerte> : null}

      <div className="space-y-3">
        <button type="submit" disabled={enCours} className={boutonPrincipal}>
          {enCours ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
          {libelleBouton}
        </button>
        {onAnnuler ? (
          <button type="button" onClick={onAnnuler} disabled={enCours} className={boutonSecondaire}>
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
