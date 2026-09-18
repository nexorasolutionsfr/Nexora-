// À quel projet Supabase ce déploiement est-il relié ? Règles pures du
// contrôle /environnement (navigateur) et /api/auto/environnement (serveur).
//
// Rien de secret n'en sort : l'identifiant du projet (déjà dans l'adresse
// servie au navigateur) et le rôle inscrits dans une clé. Une clé Supabase
// « historique » est un jeton signé dont la partie lisible porte `ref` (le
// projet) et `role` (anon ou service_role) ; les nouvelles clés
// (sb_publishable_…, sb_secret_…) ne portent pas le projet : seule la réponse
// du projet le confirme.
//
// Pur et testé (environnement.test.js).

import { PROJET_PRODUCTION } from "./lecture/configuration.js";

export { PROJET_PRODUCTION };
export const PROJET_TEST = "slawilafseganlbghgwx";

export function projetDepuisAdresse(adresse) {
  return String(adresse || "").match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1] ?? null;
}

export function libelleProjet(projet) {
  if (projet === PROJET_TEST) return "Test";
  if (projet === PROJET_PRODUCTION) return "Production";
  return projet ? "autre projet" : "inconnu";
}

function decoderBase64Url(texte) {
  const base64 = texte.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

// { format, projet, role } — jamais la clé.
export function analyserCle(cle) {
  const valeur = String(cle || "");
  if (!valeur) return { format: "absente", projet: null, role: null };
  if (valeur.startsWith("sb_publishable_")) return { format: "nouvelle", projet: null, role: "anon" };
  if (valeur.startsWith("sb_secret_")) return { format: "nouvelle", projet: null, role: "service_role" };
  const parties = valeur.split(".");
  if (parties.length !== 3) return { format: "illisible", projet: null, role: null };
  try {
    const charge = JSON.parse(decoderBase64Url(parties[1]));
    return {
      format: "jwt",
      projet: typeof charge.ref === "string" ? charge.ref : null,
      role: typeof charge.role === "string" ? charge.role : null,
    };
  } catch {
    return { format: "illisible", projet: null, role: null };
  }
}

// La clé vise-t-elle ce projet, avec ce rôle, et le projet l'a-t-il acceptée ?
function cleConforme(cle, projet, role) {
  if (!cle || cle.acceptee !== true || cle.role !== role) return false;
  return cle.format === "nouvelle" ? true : cle.projet === projet;
}

// Rend { confirme, ecarts } : confirmé seulement si le navigateur ET le
// serveur visent `projet`, avec des clés de ce projet que le projet accepte.
export function verdictProjet({ navigateur, serveur } = {}, projet = PROJET_TEST) {
  const ecarts = [];
  const nom = `${projet} (${libelleProjet(projet)})`;
  if (!navigateur) ecarts.push("navigateur : contrôle non effectué");
  else {
    if (navigateur.projetAdresse !== projet) ecarts.push(`navigateur : l'adresse Supabase vise ${navigateur.projetAdresse ?? "un projet inconnu"}, pas ${nom}`);
    if (!cleConforme(navigateur.clePublique, projet, "anon")) ecarts.push("navigateur : la clé publique n'est pas une clé acceptée de ce projet");
  }
  if (!serveur) ecarts.push("serveur : contrôle non effectué");
  else {
    if (serveur.projetAdresse !== projet) ecarts.push(`serveur : l'adresse Supabase du code vise ${serveur.projetAdresse ?? "un projet inconnu"}, pas ${nom}`);
    if (serveur.projetAdresseService !== projet) ecarts.push(`serveur : le client de service vise ${serveur.projetAdresseService ?? "un projet inconnu"}, pas ${nom}`);
    if (serveur.projetAdresseExecution !== projet) ecarts.push(`serveur : l'adresse Supabase des variables d'exécution vise ${serveur.projetAdresseExecution ?? "un projet inconnu"}`);
    if (!cleConforme(serveur.clePublique, projet, "anon")) ecarts.push("serveur : la clé publique n'est pas une clé acceptée de ce projet");
    if (!cleConforme(serveur.cleService, projet, "service_role")) ecarts.push("serveur : la clé de service n'est pas une clé acceptée de ce projet");
    if (serveur.projetQuiARepondu !== projet) ecarts.push(`serveur : le projet qui a répondu est ${serveur.projetQuiARepondu ?? "inconnu"}`);
  }
  return { confirme: ecarts.length === 0, ecarts };
}
