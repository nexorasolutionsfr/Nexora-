import { NextResponse } from "next/server";

import { descriptionEnvironnement } from "@/lib/auto/acces";
import { accesAutoServeur } from "@/lib/auto/acces-serveur";
import { controleServeur } from "@/lib/auto/environnement-serveur";
import { integrationsSortantes } from "@/lib/integrations";

// À quelle base ce déploiement est-il relié, et où s'exécutent ses fonctions ?
//
// Sert à contrôler une prévisualisation Vercel : la page /environnement
// l'appelle et y ajoute ce que le NAVIGATEUR utilise ; la protection Vercel
// s'applique. Aucune clé, aucun secret : l'identifiant du projet et le rôle
// inscrits dans chaque clé, la réponse du projet (acceptée ou non, et son
// identifiant), l'état de l'interrupteur des intégrations sortantes.

export const dynamic = "force-dynamic";

export async function GET() {
  const [{ mode, raison }, serveur] = await Promise.all([accesAutoServeur(), controleServeur()]);
  return NextResponse.json({
    ...descriptionEnvironnement(process.env),
    serveur,
    integrationsSortantes: integrationsSortantes(),
    accesAuto: mode,
    raison: raison ?? null,
  });
}
