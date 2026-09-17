import { NextResponse } from "next/server";

import { configurationLecture } from "@/lib/auto/lecture/configuration";

// La lecture automatique est-elle activée ici, pour quels formats, et le
// document part-il chez un prestataire extérieur ? Ni clé, ni budget, ni
// raison ne sont révélés.
export const dynamic = "force-dynamic";

export async function GET() {
  const c = configurationLecture(process.env);
  return NextResponse.json(c.disponible ? { disponible: true, formats: c.formats, externe: !c.gratuit } : { disponible: false, formats: [], externe: false });
}
