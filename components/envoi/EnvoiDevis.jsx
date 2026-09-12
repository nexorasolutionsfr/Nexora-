"use client";

import EnvoiDocument from "./EnvoiDocument";

// Envoyer un devis au client. Le parcours complet — état réel de la file,
// aperçu du message tel qu'il partira, confirmation, double clic sans double
// envoi — vit dans EnvoiDocument, partagé avec la facture depuis le
// 12 septembre 2026.
export default function EnvoiDevis({ devisId, cle = null, onToast }) {
  return <EnvoiDocument document="devis" documentId={devisId} cle={cle} onToast={onToast} />;
}
