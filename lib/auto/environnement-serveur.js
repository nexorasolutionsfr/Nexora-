// Contrôle de l'environnement, côté SERVEUR : les valeurs que les routes
// utilisent réellement, et ce que le projet Supabase en dit.
//
// - clé de service : celle du client `supabaseAdmin` lui-même ;
// - adresse et clé publique : les mêmes références que les routes qui créent
//   un client par requête (Next.js les inscrit dans le code à la
//   construction), plus l'adresse lue dans les variables d'exécution ;
// - acceptation : une requête sans contenu à chaque clé (réglages publics
//   d'authentification ; zéro ligne d'une table fermée à tout autre rôle que
//   le service). Le projet qui répond se nomme dans l'en-tête sb-project-ref.
//
// Ne rend ni clé, ni corps de réponse.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { analyserCle, projetDepuisAdresse } from "@/lib/auto/environnement";

const ADRESSE_CODE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_PUBLIQUE_CODE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sonder(url, cle, requeter) {
  const entetes = { apikey: cle };
  if (analyserCle(cle).format === "jwt") entetes.Authorization = `Bearer ${cle}`;
  try {
    const reponse = await requeter(url, { headers: entetes, cache: "no-store", signal: AbortSignal.timeout(5000) });
    return { acceptee: reponse.ok, statut: reponse.status, projet: reponse.headers.get("sb-project-ref") };
  } catch {
    return { acceptee: false, statut: null, projet: null };
  }
}

export async function controleServeur({
  adresse = ADRESSE_CODE,
  clePublique = CLE_PUBLIQUE_CODE,
  adresseService = supabaseAdmin.supabaseUrl,
  cleService = supabaseAdmin.supabaseKey,
  env = process.env,
  requeter = fetch,
} = {}) {
  const racine = (valeur) => String(valeur || "").replace(/\/+$/, "");
  const [publique, service] = await Promise.all([
    racine(adresse) && clePublique ? sonder(`${racine(adresse)}/auth/v1/settings`, clePublique, requeter) : null,
    racine(adresseService) && cleService ? sonder(`${racine(adresseService)}/rest/v1/parametres_envois?select=cle&limit=0`, cleService, requeter) : null,
  ]);
  const repondus = [publique?.projet, service?.projet].filter(Boolean);
  const { format: formatPublique, projet: projetPublique, role: rolePublique } = analyserCle(clePublique);
  const { format: formatService, projet: projetService, role: roleService } = analyserCle(cleService);
  return {
    projetAdresse: projetDepuisAdresse(adresse),
    projetAdresseService: projetDepuisAdresse(adresseService),
    projetAdresseExecution: projetDepuisAdresse(env.NEXT_PUBLIC_SUPABASE_URL),
    clePublique: { format: formatPublique, projet: projetPublique, role: rolePublique, acceptee: publique?.acceptee ?? false, statut: publique?.statut ?? null },
    cleService: { format: formatService, projet: projetService, role: roleService, acceptee: service?.acceptee ?? false, statut: service?.statut ?? null },
    projetQuiARepondu: repondus.length === 0 ? null : repondus.every((p) => p === repondus[0]) ? repondus[0] : "incohérent",
  };
}
