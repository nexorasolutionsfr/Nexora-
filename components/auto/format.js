// Mise en forme des écrans Nexora Auto : libellés, dates, kilomètres,
// montants, délais et messages d'erreur. Pur et testé (format.test.js) :
// les écrans ne font qu'appeler.

export const ENERGIES = [
  { valeur: "essence", libelle: "Essence" },
  { valeur: "diesel", libelle: "Diesel" },
  { valeur: "hybride", libelle: "Hybride" },
  { valeur: "hybride_rechargeable", libelle: "Hybride rechargeable" },
  { valeur: "electrique", libelle: "Électrique" },
  { valeur: "gpl", libelle: "GPL" },
  { valeur: "ethanol", libelle: "Superéthanol E85" },
  { valeur: "autre", libelle: "Autre" },
];

export const TYPES_INTERVENTION = [
  { valeur: "revision", libelle: "Révision" },
  { valeur: "vidange", libelle: "Vidange" },
  { valeur: "controle_technique", libelle: "Contrôle technique" },
  { valeur: "pneus", libelle: "Pneus" },
  { valeur: "freinage", libelle: "Freinage" },
  { valeur: "batterie", libelle: "Batterie" },
  { valeur: "distribution", libelle: "Distribution" },
  { valeur: "climatisation", libelle: "Climatisation" },
  { valeur: "carrosserie", libelle: "Carrosserie" },
  { valeur: "reparation", libelle: "Réparation" },
  { valeur: "lavage", libelle: "Lavage" },
  { valeur: "autre", libelle: "Autre intervention" },
];

// Intervalles fréquents dans les carnets, proposés en raccourci. Ce ne sont
// que des raccourcis de saisie : c'est la personne qui choisit celui de SON
// carnet, jamais l'application qui le suppose.
export const INTERVALLES_COURANTS = [
  { km: 15000, mois: 12 },
  { km: 20000, mois: 24 },
  { km: 30000, mois: 24 },
];

export const MARQUES_COURANTES = [
  "Peugeot", "Renault", "Citroën", "Dacia", "Volkswagen", "Toyota", "Ford", "Opel",
  "Fiat", "Skoda", "Seat", "Kia", "Hyundai", "Nissan", "BMW", "Mercedes-Benz", "Audi",
  "DS", "MG", "Tesla", "Suzuki", "Mini", "Volvo", "Cupra",
];

export function libelleDe(liste, valeur) {
  return liste.find((e) => e.valeur === valeur)?.libelle ?? "";
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// « 2027-03-12 » → « 12 mars 2027 ». Lu comme une date calendaire, sans fuseau.
export function formaterDate(iso) {
  const m = typeof iso === "string" ? iso.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return "";
  const jour = Number(m[3]);
  return `${jour === 1 ? "1er" : jour} ${MOIS_COURTS[Number(m[2]) - 1]} ${m[1]}`;
}

const ESPACE_FINE = " ";

export function formaterNombre(n) {
  if (!Number.isFinite(n)) return "";
  const signe = n < 0 ? "-" : "";
  return signe + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

export function formaterKm(n) {
  return Number.isFinite(n) ? `${formaterNombre(n)}${ESPACE_FINE}km` : "";
}

export function formaterEuros(montant) {
  const n = typeof montant === "string" ? Number(montant) : montant;
  if (!Number.isFinite(n)) return "";
  const centimes = Math.round(Math.abs(n) * 100);
  const entiers = formaterNombre(Math.trunc(centimes / 100));
  const decimales = String(centimes % 100).padStart(2, "0");
  return `${n < 0 ? "-" : ""}${entiers},${decimales}${ESPACE_FINE}€`;
}

// Un délai en jours, dit comme on le dirait. Au-delà de 60 jours, en mois.
// « En retard » plutôt que « dépassé » : la tournure s'accorde avec tous les
// sujets (le CT, la révision, la contre-visite).
export function delaiLisible(jours) {
  if (!Number.isFinite(jours)) return "";
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  if (jours === -1) return "en retard d'un jour";
  const absolu = Math.abs(jours);
  const texte = absolu < 60 ? `${absolu} jours` : `${Math.round(absolu / 30.44)} mois`;
  return jours > 0 ? `dans ${texte}` : `en retard de ${texte}`;
}

// Un entier tapé par une personne : « 61 400 », « 61400 km », « 61.400 ».
export function lireEntier(saisie) {
  if (typeof saisie === "number") return Number.isInteger(saisie) ? saisie : null;
  if (typeof saisie !== "string") return null;
  const brut = saisie.replace(/[\s  .]/g, "").replace(/km$/i, "");
  if (!/^\d+$/.test(brut)) return null;
  return Number(brut);
}

// « 79,90 » ou « 79.90 » → 79.9 ; vide → null ; invalide → NaN.
export function lireMontant(saisie) {
  if (typeof saisie !== "string" || saisie.trim() === "") return null;
  const brut = saisie.replace(/[\s  €]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(brut) ? Number(brut) : Number.NaN;
}

// Le chemin où revenir après la connexion. Toujours interne à Nexora Auto :
// un paramètre d'adresse ne doit jamais envoyer ailleurs.
export function cheminSuite(valeur) {
  if (typeof valeur !== "string") return "/auto";
  if (!valeur.startsWith("/auto") || valeur.startsWith("//") || valeur.includes("\\")) return "/auto";
  return valeur;
}

// Erreur d'enregistrement rendue par Supabase → phrase pour la personne.
export function messageErreurAuto(erreur) {
  if (!erreur) return "";
  const texte = `${erreur.message || ""} ${erreur.details || ""}`;
  if (texte.includes("auto_vehicules_plaque_par_proprietaire")) return "Cette plaque est déjà enregistrée dans votre garage.";
  if (texte.includes("auto_taches_service_une_ouverte")) return "Cette prestation figure déjà dans vos prochaines actions pour cette voiture.";
  if (texte.includes("auto_service_non_ajoutable")) return "Cette prestation est déjà suivie automatiquement dans « À prévoir ».";
  if (texte.includes("motorisation")) return "La motorisation ne doit pas dépasser 80 caractères.";
  if (texte.includes("auto_date_future")) return "La date ne peut pas être dans le futur.";
  if (texte.includes("immatriculation")) return "Cette plaque n'est pas valide.";
  if (texte.includes("intervalle")) return "Cet intervalle d'entretien ne semble pas correct.";
  if (texte.includes("km_borne")) return "Ce kilométrage ne semble pas correct.";
  if (texte.includes("annee_bornee")) return "Cette année ne semble pas correcte.";
  if (texte.includes("montant_positif")) return "Le montant ne peut pas être négatif.";
  if (erreur.code === "42501" || erreur.code === "28000") return "Votre session a expiré. Reconnectez-vous.";
  return "L'enregistrement n'a pas abouti. Vérifiez votre connexion et réessayez.";
}

// Erreur de connexion ou d'inscription → phrase pour la personne. Ne dit
// jamais si une adresse possède déjà un compte, sauf quand Supabase le dit.
export function messageConnexion(erreur) {
  if (!erreur) return "";
  const code = erreur.code || "";
  const brut = erreur.message || "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(brut)) return "Adresse e-mail ou mot de passe incorrect.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(brut)) return "Confirmez d'abord votre adresse : ouvrez le lien reçu par e-mail.";
  if (code === "weak_password" || /password/i.test(brut) && /(weak|short|least)/i.test(brut)) return "Mot de passe trop faible : au moins 8 caractères.";
  if (code === "email_address_invalid" || /email address .* invalid/i.test(brut)) return "Cette adresse e-mail n'est pas acceptée. Vérifiez-la.";
  if (code === "over_email_send_rate_limit" || erreur.status === 429 || /rate limit/i.test(brut)) return "Trop de demandes en peu de temps. Réessayez dans une heure.";
  if (code === "user_already_exists" || /already registered/i.test(brut)) return "Cette adresse a déjà un compte : connectez-vous.";
  return "La demande n'a pas abouti. Réessayez dans un instant.";
}
