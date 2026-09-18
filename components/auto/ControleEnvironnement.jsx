"use client";

// Contrôle d'une prévisualisation : le projet Supabase du NAVIGATEUR (le client
// `supabase` de l'application, tel que servi à cet appareil) et celui du
// SERVEUR (route /api/auto/environnement), puis l'interrupteur des
// intégrations sortantes. Confirmé seulement si tout vise le même projet,
// avec des clés que ce projet accepte.
//
// Aucune clé affichée : l'identifiant du projet et le rôle inscrits dans
// chaque clé, et la réponse du projet.

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { PROJET_TEST, analyserCle, libelleProjet, projetDepuisAdresse, verdictProjet } from "@/lib/auto/environnement";
import { carte } from "@/components/auto/elements";

async function controleNavigateur() {
  const adresse = String(supabase.supabaseUrl || "");
  const cle = supabase.supabaseKey;
  const clePublique = { ...analyserCle(cle), acceptee: false, statut: null };
  try {
    const reponse = await fetch(`${adresse.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: cle }, cache: "no-store" });
    clePublique.acceptee = reponse.ok;
    clePublique.statut = reponse.status;
  } catch {
    // Réseau coupé ou adresse invalide : la clé n'est pas dite acceptée.
  }
  return { projetAdresse: projetDepuisAdresse(adresse), clePublique };
}

async function lireServeur() {
  const reponse = await fetch("/api/auto/environnement", { cache: "no-store" });
  if (!reponse.ok) throw new Error(`statut ${reponse.status}`);
  return reponse.json();
}

const projet = (p) => (p ? `${p} (${libelleProjet(p)})` : "inconnu");
const cle = (c) =>
  c ? `${c.format === "nouvelle" ? "nouvelle clé, projet non inscrit" : `projet ${projet(c.projet)}`}, rôle ${c.role ?? "inconnu"} — ${c.acceptee ? "acceptée" : "refusée"} (${c.statut ?? "sans réponse"})` : "absente";

function Ligne({ libelle, valeur }) {
  return (
    <div className="py-1.5">
      <dt className="text-[13px] text-muted-foreground">{libelle}</dt>
      <dd className="break-words text-[15px] text-foreground">{valeur}</dd>
    </div>
  );
}

function Verdict({ bon, children }) {
  const Icone = bon ? CircleCheck : CircleAlert;
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[15px] font-medium leading-snug ${bon ? "border-primary/30 bg-secondary/50 text-foreground" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
      <Icone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function ControleEnvironnement() {
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    Promise.all([controleNavigateur(), lireServeur().catch(() => null)]).then(([navigateur, reponseServeur]) => {
      setEtat({ chargement: false, navigateur, reponseServeur });
    });
  }, []);

  if (etat.chargement) {
    return (
      <main className="espace-auto mx-auto min-h-dvh max-w-xl bg-background px-4 py-8 text-foreground">
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Contrôle en cours…
        </p>
      </main>
    );
  }

  const { navigateur, reponseServeur } = etat;
  const serveur = reponseServeur?.serveur ?? null;
  const verdict = verdictProjet({ navigateur, serveur }, PROJET_TEST);
  const sortantes = reponseServeur?.integrationsSortantes;
  const coupees = sortantes?.actives === false;

  return (
    <main className="espace-auto mx-auto min-h-dvh max-w-xl space-y-4 bg-background px-4 py-8 text-foreground">
      <header>
        <h1 className="text-xl font-semibold">Contrôle de l'environnement</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {reponseServeur
            ? `${reponseServeur.environnement === "preview" ? "Prévisualisation" : reponseServeur.environnement} · branche ${reponseServeur.branche ?? "inconnue"} · fonctions ${reponseServeur.regionFonction ?? "?"}`
            : "Le serveur n'a pas répondu."}
        </p>
      </header>

      <Verdict bon={verdict.confirme}>
        {verdict.confirme
          ? `Projet Test confirmé : ${PROJET_TEST}, côté navigateur et côté serveur.`
          : "Pas confirmé sur Test : ne pas utiliser ce déploiement pour l'essai."}
      </Verdict>
      {verdict.confirme ? null : (
        <ul className="list-disc space-y-1 pl-5 text-[14px] text-destructive">
          {verdict.ecarts.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Verdict bon={coupees}>
        {coupees
          ? "Intégrations sortantes coupées : ni e-mail (Resend), ni paiement (Stripe), ni connexion Google, ni lecture payante ne peuvent partir d'ici."
          : sortantes
            ? "Intégrations sortantes ACTIVES sur ce déploiement."
            : "État des intégrations sortantes inconnu."}
      </Verdict>

      <section className={carte}>
        <h2 className="font-semibold">Navigateur</h2>
        <p className="text-[13px] text-muted-foreground">Le client Supabase de l'application, tel que servi à cet appareil.</p>
        <dl className="mt-2 divide-y divide-border">
          <Ligne libelle="Adresse Supabase" valeur={projet(navigateur.projetAdresse)} />
          <Ligne libelle="Clé publique" valeur={cle(navigateur.clePublique)} />
        </dl>
      </section>

      <section className={carte}>
        <h2 className="font-semibold">Serveur</h2>
        <p className="text-[13px] text-muted-foreground">Les fonctions Vercel de ce déploiement.</p>
        {serveur ? (
          <dl className="mt-2 divide-y divide-border">
            <Ligne libelle="Adresse Supabase du code" valeur={projet(serveur.projetAdresse)} />
            <Ligne libelle="Adresse du client de service" valeur={projet(serveur.projetAdresseService)} />
            <Ligne libelle="Adresse des variables d'exécution" valeur={projet(serveur.projetAdresseExecution)} />
            <Ligne libelle="Clé publique" valeur={cle(serveur.clePublique)} />
            <Ligne libelle="Clé de service" valeur={cle(serveur.cleService)} />
            <Ligne libelle="Projet qui a répondu" valeur={projet(serveur.projetQuiARepondu)} />
            <Ligne libelle="Accès Nexora Auto" valeur={reponseServeur.accesAuto} />
          </dl>
        ) : (
          <p className="mt-2 text-[15px] text-destructive">Aucune réponse du serveur.</p>
        )}
      </section>

      <p className="text-[13px] text-muted-foreground">
        Aucune clé n'est affichée : seulement le projet et le rôle inscrits dans chaque clé, et la réponse du projet.
      </p>
    </main>
  );
}
