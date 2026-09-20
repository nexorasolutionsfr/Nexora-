import { NextResponse } from "next/server";

import { accesAutoServeur } from "@/lib/auto/acces-serveur";
import { mentionneModele, termesDeModele } from "@/lib/auto/connaissance/campagnes";
import { fichesDeLaMarque } from "@/lib/auto/connaissance/campagnes-serveur";
import { SOURCES } from "@/lib/auto/connaissance/sources";

// Les campagnes de rappel officielles qui nomment un modèle.
//
// Ce qui entre : une marque et un modèle. Rien d'autre — ni plaque, ni date,
// ni identifiant de voiture ou de compte. La date de mise en circulation reste
// dans le navigateur, qui s'en sert pour situer la voiture dans la période.
//
// Ce qui sort : les fiches officielles telles quelles, avec le lien vers
// l'original. Nexora ne les réécrit pas et n'en déduit rien ici.
//
// Pourquoi passer par le serveur alors que la base publique accepte les
// appels directs : pour que l'adresse IP de la personne ne parte pas chez un
// tiers quand elle consulte sa propre voiture.

export const dynamic = "force-dynamic";

const MAX = 40;

export async function GET(requete: Request) {
  if ((await accesAutoServeur()).mode === "ferme") {
    return NextResponse.json({ etat: "indisponible", raison: "auto_ferme" });
  }

  const parametres = new URL(requete.url).searchParams;
  const marque = (parametres.get("marque") ?? "").slice(0, MAX);
  const modele = (parametres.get("modele") ?? "").slice(0, MAX);
  if (!marque.trim() || !modele.trim()) {
    return NextResponse.json({ etat: "donnees_insuffisantes", manques: ["marque_modele"] });
  }

  const lecture = await fichesDeLaMarque(marque);
  if (lecture.etat !== "lues") {
    return NextResponse.json({ etat: "indisponible", raison: lecture.raison });
  }

  // Filtrage du modèle ici aussi : inutile de faire voyager les 150 fiches
  // d'une marque jusqu'au téléphone pour en garder deux.
  //
  // On garde ici ce que N'IMPORTE LEQUEL des termes trouve — « 208 (essai) »
  // comme « 208 ». C'est le navigateur qui choisira ensuite le terme le plus
  // précis qui donne un résultat ; envoyer moins l'empêcherait de le faire.
  const termes = termesDeModele(modele);
  const fiches = lecture.fiches.filter((f: { modeles_ou_references?: string }) =>
    termes.some((t) => mentionneModele(f.modeles_ou_references ?? "", t)),
  );

  return NextResponse.json({
    etat: "lues",
    fiches,
    total: lecture.total,
    tronque: lecture.tronque,
    mention: SOURCES["rappelconso-v2"].mention,
  });
}
