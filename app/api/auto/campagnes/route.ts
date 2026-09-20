import { NextResponse } from "next/server";

import { accesAutoServeur } from "@/lib/auto/acces-serveur";
import { correspondance, paliersDeRecherche } from "@/lib/auto/connaissance/campagnes";
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
  // Même règle de paliers que le navigateur : le plus précis qui trouve
  // quelque chose gagne. Envoyer aussi les résultats des paliers plus larges
  // ferait voyager des « Model S » pour une « Model 3 », que le navigateur
  // écarterait ensuite — autant ne pas les envoyer.
  const paliers = paliersDeRecherche(modele);
  let fiches: unknown[] = [];
  for (const p of paliers) {
    fiches = lecture.fiches.filter((f: { modeles_ou_references?: string }) => correspondance(f.modeles_ou_references ?? "", p.terme));
    if (fiches.length > 0) break;
  }

  return NextResponse.json({
    etat: "lues",
    fiches,
    total: lecture.total,
    tronque: lecture.tronque,
    mention: SOURCES["rappelconso-v2"].mention,
  });
}
