"use client";

// Connecté, mais sans accès à Nexora Auto : bêta privée dont l'adresse n'est
// pas (encore) invitée, application fermée entre-temps, ou vérification
// impossible. Rien n'est lu ni écrit ; la personne peut se déconnecter.

import { Lock } from "lucide-react";

export default function AccesReserve({ acces, email }) {
  const texte = acces?.erreur
    ? "Votre accès n'a pas pu être vérifié. Vérifiez votre connexion, puis rechargez la page."
    : acces?.mode === "beta"
      ? `Nexora Auto est en bêta privée, ouverte aux adresses invitées. ${email ? `Le compte ${email} n'en fait pas partie pour l'instant.` : ""} Si vous avez reçu une invitation, connectez-vous avec l'adresse invitée et confirmez-la depuis l'e-mail reçu.`
      : "Nexora Auto n'est pas encore ouvert.";
  return (
    <section className="mt-2 rounded-2xl border border-border bg-card px-5 py-7 shadow-[0_1px_2px_rgba(15,27,51,0.04)]" aria-labelledby="titre-acces-reserve">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <h1 id="titre-acces-reserve" className="mt-4 font-display text-2xl font-bold tracking-tight text-foreground">
        {acces?.erreur ? "Accès non vérifié" : "Accès réservé"}
      </h1>
      <p className="mt-2 break-words text-[15px] leading-relaxed text-muted-foreground">{texte}</p>
    </section>
  );
}
