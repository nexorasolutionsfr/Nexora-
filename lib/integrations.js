// Intégrations sortantes : ce que le serveur de l'application peut déclencher
// hors de chez nous — un e-mail (Resend), un paiement (Stripe), une connexion
// Gmail (Google), une lecture payante (Anthropic).
//
// Toutes coupées sur une prévisualisation Vercel. Une prévisualisation hérite
// des clés de Production (constat du 17 sept. 2026) ; les remplacer par des
// valeurs factices ne coupe rien : l'appel part quand même, et c'est le
// fournisseur qui le refuse. L'interrupteur est ici, AVANT tout appel, et ne
// dépend d'aucune variable à poser :
//   VERCEL_ENV = « production »              → selon les clés présentes (inchangé) ;
//   VERCEL_ENV = « preview » / « development » → coupées ;
//   pas de VERCEL_ENV (poste local)          → selon les clés présentes (inchangé).
// VERCEL_ENV est une variable système de Vercel, lue à l'exécution (vérifié
// le 18 sept. 2026 : la route /api/auto/environnement de la Production la lit
// « production »). Le contrôle /environnement affiche l'état de l'interrupteur.
//
// Ne passent pas par ici : les e-mails d'authentification (inscription, mot de
// passe oublié), envoyés par Supabase selon le réglage du projet, et les liens
// que la personne ouvre elle-même (mailto:, tel:, sms:, WhatsApp).

export function integrationsSortantes(env = process.env) {
  const vercel = env.VERCEL_ENV;
  if (vercel && vercel !== "production") return { actives: false, raison: "previsualisation" };
  return { actives: true, raison: null };
}
