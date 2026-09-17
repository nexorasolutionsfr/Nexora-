"use client";

// Choisir le fichier d'un document : « Choisir un fichier » partout, et
// « Prendre une photo » sur un écran tactile (appareil photo arrière).
//
// Une photo prise ainsi arrive en JPEG sur iPhone comme sur Android : elle
// s'ouvre partout, contrairement au HEIC de la photothèque d'un iPhone. Elle
// est conservée comme document ; les informations se renseignent à la main
// (aucune lecture des photos).
//
// Les champs de fichier restent de vrais champs (clavier, lecteur d'écran) :
// ils recouvrent, transparents, le bouton qu'on voit.

import { Camera, FileUp } from "lucide-react";

import { tailleLisible } from "@/lib/auto/documents";
import { aide, etiquette } from "@/components/auto/elements";

const bouton =
  "pointer-events-none flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[15px] font-semibold text-foreground transition peer-hover:bg-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring";

export default function ChoixFichier({ id, libelle, accepte, fichier, onChange, aideTexte }) {
  const choisir = (e) => {
    onChange(e.target.files?.[0] ?? null);
    // Choisir à nouveau le même fichier doit redéclencher le choix.
    e.target.value = "";
  };
  return (
    <div>
      <p id={`${id}-libelle`} className={etiquette}>
        {libelle}
      </p>
      <div className="flex flex-col gap-2 min-[480px]:flex-row">
        <div className="relative flex-1">
          <input
            id={id}
            type="file"
            accept={accepte}
            onChange={choisir}
            aria-labelledby={`${id}-libelle ${id}-choisir`}
            aria-describedby={`${id}-aide`}
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <span id={`${id}-choisir`} className={bouton}>
            <FileUp className="size-5 shrink-0 text-primary" aria-hidden="true" />
            Choisir un fichier
          </span>
        </div>
        <div className="relative flex-1 pointer-fine:hidden">
          <input
            id={`${id}-photo`}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={choisir}
            aria-labelledby={`${id}-libelle ${id}-prendre`}
            aria-describedby={`${id}-aide`}
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <span id={`${id}-prendre`} className={bouton}>
            <Camera className="size-5 shrink-0 text-primary" aria-hidden="true" />
            Prendre une photo
          </span>
        </div>
      </div>
      <p role="status" className="mt-2 break-words text-sm text-foreground">
        {fichier ? (
          <>
            <span className="font-medium">{fichier.name}</span>
            <span className="text-muted-foreground"> · {tailleLisible(fichier.size)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Aucun fichier choisi.</span>
        )}
      </p>
      <p id={`${id}-aide`} className={aide}>
        {aideTexte}
      </p>
    </div>
  );
}
