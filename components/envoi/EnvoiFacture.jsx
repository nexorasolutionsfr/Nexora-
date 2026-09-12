"use client";

import EnvoiDocument from "./EnvoiDocument";

// Envoyer une facture au client : le même parcours que le devis, avec les
// fonctions de base de la facture. Créer la facture, produire ou copier son
// lien n'arment jamais l'envoi — seul « Oui, envoyer ce message » le fait.
export default function EnvoiFacture({ factureId, cle = null, onToast }) {
  return <EnvoiDocument document="facture" documentId={factureId} cle={cle} onToast={onToast} />;
}
