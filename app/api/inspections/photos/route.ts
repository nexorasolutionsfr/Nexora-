import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PHOTOS_BUCKET, PORTAIL_PHOTO_SIGNED_URL_TTL_SECONDES } from "@/components/inspections/inspectionsConstants";

// Le bucket inspections-photos est privé (voir 20260830000800_inspections_photos_prive.sql).
// Le portail client public n'a donc aucun accès direct au stockage : cette
// route revalide le jeton d'inspection lui-même (jamais les chemins fournis
// par l'appelant) puis ne signe que les photos que ce jeton est autorisé à
// voir, pour une durée courte. Seule route de cette fonctionnalité utilisant
// le service role, exactement pour ce cas justifié (appel à l'API Storage).
export async function POST(request) {
  let token;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("lire_inspection_par_jeton", { p_token: token });
  if (error || !data) {
    return NextResponse.json({ error: "Ce lien n'est plus valable." }, { status: 403 });
  }

  const paths = Array.from(new Set((data.points || []).flatMap((p) => p.photos || [])));
  if (paths.length === 0) {
    return NextResponse.json({ urls: {} });
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, PORTAIL_PHOTO_SIGNED_URL_TTL_SECONDES);

  if (signError) {
    console.error("[api/inspections/photos] échec signature URLs :", signError);
    return NextResponse.json({ error: "Impossible de charger les photos" }, { status: 500 });
  }

  const urls = {};
  (signed || []).forEach((s) => {
    if (s.signedUrl && !s.error) urls[s.path] = s.signedUrl;
  });

  return NextResponse.json({ urls });
}
