// Le lien de confirmation, quand il ne marche plus — les décisions, sans l'affichage.
//
// POURQUOI CE MODULE EXISTE
//
// Constat en Production le 12 septembre 2026 : un garagiste ouvre un ancien
// lien de confirmation, Supabase le renvoie sur `/dashboard` avec un fragment
// `#error=access_denied&error_code=otp_expired…`. Deux situations, un seul
// symptôme :
//
//  - il a déjà une session (il a réussi avec le dernier lien, ou s'est
//    connecté) : l'application marche, mais l'erreur périmée reste dans la
//    barre d'adresse. supabase-js ne l'efface pas — il n'efface le fragment
//    que quand il y trouve une session valide. On la retire nous-mêmes.
//  - il n'a pas de session : l'écran de connexion s'affiche comme si de rien
//    n'était, sans dire que le lien est mort ni comment en obtenir un autre.
//    On le dit, et on propose le renvoi.
//
// Ces fonctions sont pures et testées ici même ; l'écran ne fait que les
// appeler. Le principe à ne pas perdre : on ne retire JAMAIS un fragment qui
// porte une session (`access_token`) — c'est celui-là qui connecte.

export const MESSAGE_LIEN_PERIME = "Ce lien n'est plus valable. Demandez un nouvel e-mail de confirmation.";
export const MESSAGE_LIEN_INVALIDE = "Ce lien n'a pas pu être utilisé. Connectez-vous, ou demandez un nouvel e-mail de confirmation.";
export const RAPPEL_DERNIER_MESSAGE = "Utilisez le dernier message reçu : les liens précédents ne fonctionnent plus.";

// Lit l'erreur d'authentification portée par un fragment d'URL, s'il y en a
// une. Rend null pour un fragment vide, un fragment de session, ou n'importe
// quel autre fragment (une ancre de page, par exemple).
export function erreurAuthDansFragment(fragment) {
  if (typeof fragment !== "string") return null;
  const brut = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!brut) return null;
  const params = new URLSearchParams(brut);
  const error = params.get("error");
  const code = params.get("error_code");
  const description = params.get("error_description");
  if (!error && !code && !description) return null;
  return {
    error: error || "",
    code: code || "",
    description: description || "",
  };
}

// Le fragment porte-t-il une session ? Dans ce cas il ne doit jamais être
// retiré : supabase-js s'en charge lui-même une fois la session enregistrée.
export function fragmentPorteUneSession(fragment) {
  if (typeof fragment !== "string") return false;
  const brut = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(brut);
  return params.has("access_token") || params.has("refresh_token");
}

// Un lien de confirmation ou de connexion qui a expiré, ou a déjà servi.
export function estLienPerime(erreur) {
  if (!erreur) return false;
  if (erreur.code === "otp_expired") return true;
  return /expired|invalid/i.test(erreur.description || "");
}

// Ce que l'application doit faire du fragment, selon qu'une session existe.
//
//  - "nettoyer"  : une session est là, l'erreur est périmée : on la retire de
//                  l'adresse, sans rien dire — la personne est connectée.
//  - "expliquer" : pas de session : l'écran de connexion dit que le lien ne
//                  vaut plus rien et propose un nouvel e-mail.
//  - "rien"      : aucun fragment d'erreur.
export function decisionFragment({ fragment, session }) {
  const erreur = erreurAuthDansFragment(fragment);
  if (!erreur) return "rien";
  if (fragmentPorteUneSession(fragment)) return "rien";
  return session ? "nettoyer" : "expliquer";
}

// L'adresse sans son fragment d'erreur. Toute autre adresse est rendue telle
// quelle : on ne touche ni à une ancre, ni à un fragment de session.
export function adresseSansErreurAuth(href) {
  if (typeof href !== "string") return href;
  const i = href.indexOf("#");
  if (i === -1) return href;
  const fragment = href.slice(i);
  if (!erreurAuthDansFragment(fragment) || fragmentPorteUneSession(fragment)) return href;
  return href.slice(0, i);
}

// La phrase de l'écran de connexion quand un lien a échoué.
export function messageLienEchoue(erreur) {
  return estLienPerime(erreur) ? MESSAGE_LIEN_PERIME : MESSAGE_LIEN_INVALIDE;
}
