import { NextResponse } from "next/server";

import { configurationLecture } from "@/lib/auto/lecture/configuration";

// La lecture automatique est-elle activée ici ? Rien d'autre n'est révélé :
// ni fournisseur, ni budget, ni raison.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ disponible: configurationLecture(process.env).disponible });
}
