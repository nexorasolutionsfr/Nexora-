import { NextResponse } from "next/server";

import { configurationLecture } from "@/lib/auto/lecture/configuration";
import { accesAutoServeur } from "@/lib/auto/acces-serveur";

// La lecture automatique est-elle activée ici, pour quels formats, et le
// document part-il chez un prestataire extérieur ? Ni clé, ni budget, ni
// raison ne sont révélés. Nexora Auto fermé : aucune lecture annoncée.
export const dynamic = "force-dynamic";

export async function GET() {
  if ((await accesAutoServeur()).mode === "ferme") return NextResponse.json({ disponible: false, formats: [], externe: false });
  const c = configurationLecture(process.env);
  return NextResponse.json(c.disponible ? { disponible: true, formats: c.formats, externe: !c.gratuit } : { disponible: false, formats: [], externe: false });
}
