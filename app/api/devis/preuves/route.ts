import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PHOTOS_BUCKET, PORTAIL_PHOTO_SIGNED_URL_TTL_SECONDES } from "@/components/inspections/inspectionsConstants";

// Les photos de constat d'un devis public. Même modèle que
// app/api/inspections/photos : le bucket reste privé et cette route revalide
// le JETON — jamais un chemin ni un identifiant fourni par l'appelant.
//
// La page publique ne connaît que des identifiants opaques de photo
// (`lire_devis_par_jeton`). La correspondance identifiant → chemin n'existe
// que côté serveur : `chemins_preuves_devis`, réservée au rôle de service,
// rend les seules photos des lignes de ce devis (20260919000900). Rien d'autre
// du contrôle — ni ses autres photos, ni ses notes — ne peut donc être signé.
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

  const { data: preuves, error } = await supabaseAdmin.rpc("chemins_preuves_devis", { p_token: token });
  if (error) {
    console.error("[api/devis/preuves] lecture des preuves :", error);
    return NextResponse.json({ error: "Impossible de charger les photos" }, { status: 500 });
  }
  // Jeton inconnu, révoqué, expiré ou chiffrage incomplet : la fonction ne
  // rend rien. On ne distingue pas « pas de photo » de « pas de droit » pour
  // un lien invalide : la page a déjà dit pourquoi le devis est indisponible.
  const liste = (preuves || []).filter((p) => p?.photo_id && typeof p.chemin === "string");
  if (liste.length === 0) {
    return NextResponse.json({ urls: {} }, { status: 200 });
  }

  const chemins = liste.map((p) => p.chemin);
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(chemins, PORTAIL_PHOTO_SIGNED_URL_TTL_SECONDES);

  if (signError) {
    console.error("[api/devis/preuves] échec signature URLs :", signError);
    return NextResponse.json({ error: "Impossible de charger les photos" }, { status: 500 });
  }

  const urlParChemin = {};
  (signed || []).forEach((s) => { if (s.signedUrl && !s.error) urlParChemin[s.path] = s.signedUrl; });
  const urls = {};
  for (const p of liste) if (urlParChemin[p.chemin]) urls[p.photo_id] = urlParChemin[p.chemin];

  return NextResponse.json({ urls });
}
