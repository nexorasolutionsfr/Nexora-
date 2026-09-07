// Ce que Nexora sait faire aujourd'hui, et ce qu'il ne sait pas encore.
//
// POURQUOI CE FICHIER EXISTE
//
// L'écran des paramètres proposait des interrupteurs qui ne commandaient
// rien. Vérification faite le 8 septembre 2026 sur les automatisations
// publiées : aucune ne lit `automatisation_active`, aucune ne lit
// `rappel_confirmation_actif` ni `delai_confirmation_rdv_h`, aucune ne lit
// le canal choisi par type de notification. Les envois partent par e-mail,
// toujours, quel que soit l'état de ces réglages.
//
// Un interrupteur qui ne commande rien est pire qu'une fonction absente :
// le garage croit avoir armé ses rappels, ne les voit jamais partir, et
// conclut que le logiciel est cassé — ou pire, ne s'en aperçoit pas et
// laisse un client sans nouvelles.
//
// Cette table est donc la source unique de vérité de l'interface. Quand une
// automatisation est réellement branchée, on bascule ici `disponible` à
// `true` et l'écran se rouvre tout seul. Ne la faire passer à `true` que
// contre une preuve d'envoi réel, jamais contre une intention.

export const CAPACITES = {
  // La réponse automatique aux demandes entrantes.
  reponseAutomatique: {
    disponible: false,
    resume: "Les demandes ne reçoivent pas encore de réponse automatique.",
    utilisable: "Vous les traitez depuis le tableau de bord, comme un carnet de rendez-vous.",
  },
  // Le rappel de confirmation envoyé avant un rendez-vous.
  rappelConfirmation: {
    disponible: false,
    resume: "L'envoi automatique des rappels de confirmation n'est pas encore branché.",
    utilisable: "Vous pouvez confirmer un rendez-vous à la main depuis l'agenda.",
  },
  // La demande d'avis envoyée après un rendez-vous terminé.
  demandeAvis: {
    disponible: false,
    resume: "La demande d'avis n'est pas encore envoyée automatiquement.",
    utilisable: "Le lien est conservé ici, prêt à servir.",
  },
};

// Les canaux d'envoi. Seul l'e-mail part réellement aujourd'hui : SMS et
// WhatsApp attendent un fournisseur d'envoi qui n'est pas configuré.
export const CANAUX = [
  { key: "email", label: "Email", disponible: true },
  { key: "sms", label: "SMS", disponible: false },
  { key: "whatsapp", label: "WhatsApp", disponible: false },
];

export function canalDisponible(cle) {
  const canal = CANAUX.find((c) => c.key === cle);
  return canal ? canal.disponible : false;
}

// Le canal réellement employé pour un type de notification, quel que soit ce
// qui est enregistré. Un garage dont la préférence dit « SMS » reçoit quand
// même ses envois par e-mail : l'écran doit dire l'e-mail, pas la préférence.
export function canalEffectif(prefere) {
  return canalDisponible(prefere) ? prefere : "email";
}

// La phrase affichée sous un type de notification quand la préférence
// enregistrée ne correspond pas à ce qui part réellement. On ne l'efface
// pas de la base — c'est un choix du garage, il le retrouvera le jour où le
// canal existera.
export function mentionCanalIndisponible(prefere) {
  if (canalDisponible(prefere)) return null;
  const canal = CANAUX.find((c) => c.key === prefere);
  if (!canal) return null;
  return `${canal.label} n'est pas encore disponible : ces messages partent par e-mail.`;
}
