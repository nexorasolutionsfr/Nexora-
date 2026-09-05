"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PROFILS_ACTIVITE } from "./profilsActivite";

// Écran de mise en service, affiché au premier accès d'un compte qui ne
// possède pas encore de garage. Il remplace le cul-de-sac « Contactez le
// support Nexora », qui imposait une création manuelle côté éditeur.
//
// Deux étapes seulement, et rien de plus : le nom du garage, puis les
// activités exercées. Le reste (horaires, prestations, logo, notifications)
// se règle ensuite dans Paramètres, sur un tableau de bord déjà ouvert — un
// garage doit pouvoir entrer et voir son outil avant qu'on lui demande quoi
// que ce soit d'autre.
//
// Toute la création passe par la RPC creer_mon_garage : le propriétaire y est
// pris dans la session, jamais dans un paramètre.

const ACCENT = "#3D6BE0";
const NAVY = "#0F1B33";
const BG = "#F5F7FA";

const CADRE = {
  background: "#fff",
  padding: 32,
  borderRadius: 12,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
};

const CHAMP = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 14,
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  color: NAVY,
  background: "#fff",
};

const LIBELLE = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  marginBottom: 4,
};

function messageErreur(error) {
  const brut = error?.message || "";
  if (brut.includes("possede deja un garage")) {
    return "Un garage est déjà rattaché à ce compte. Rechargez la page.";
  }
  if (brut.includes("nom du garage est obligatoire")) {
    return "Le nom du garage est obligatoire.";
  }
  if (brut.includes("profil d'activite invalide") || brut.includes("profil d''activite invalide")) {
    return "Choisissez au moins une activité.";
  }
  if (brut.includes("sans session authentifiee")) {
    return "Votre session a expiré. Reconnectez-vous.";
  }
  return "La création du garage a échoué. Réessayez dans un instant.";
}

export default function OnboardingGarage({ onGarageCree }) {
  const [etape, setEtape] = useState(1);
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [profil, setProfil] = useState([]);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const nomValide = nom.trim().length > 0;

  function basculerActivite(cle) {
    setProfil((precedent) =>
      precedent.includes(cle) ? precedent.filter((c) => c !== cle) : [...precedent, cle]
    );
  }

  async function creer() {
    setErreur("");
    setEnCours(true);
    const { data, error } = await supabase.rpc("creer_mon_garage", {
      p_nom_garage: nom,
      p_adresse: adresse,
      p_telephone: telephone,
      p_email: email,
      p_profil_activite: profil,
    });
    setEnCours(false);
    if (error) {
      console.error("Erreur creation garage :", error);
      setErreur(messageErreur(error));
      return;
    }
    onGarageCree(data);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
        padding: 24,
      }}
    >
      <div style={CADRE}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
          Bienvenue sur Nexora
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>
          {etape === 1
            ? "Deux questions, et votre garage est ouvert."
            : "Que faites-vous dans votre atelier ?"}
        </p>

        {etape === 1 && (
          <>
            <label style={LIBELLE} htmlFor="onboarding-nom">
              Nom de votre garage
            </label>
            <input
              id="onboarding-nom"
              type="text"
              placeholder="Garage Dupont"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              style={CHAMP}
            />

            <label style={LIBELLE} htmlFor="onboarding-adresse">
              Adresse <span style={{ fontWeight: 400, color: "#94A3B8" }}>— facultatif</span>
            </label>
            <input
              id="onboarding-adresse"
              type="text"
              placeholder="12 rue des Ateliers, 52100 Saint-Dizier"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              style={CHAMP}
            />

            <label style={LIBELLE} htmlFor="onboarding-telephone">
              Téléphone <span style={{ fontWeight: 400, color: "#94A3B8" }}>— facultatif</span>
            </label>
            <input
              id="onboarding-telephone"
              type="tel"
              placeholder="03 25 00 00 00"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              style={CHAMP}
            />

            <label style={LIBELLE} htmlFor="onboarding-email">
              E-mail de contact <span style={{ fontWeight: 400, color: "#94A3B8" }}>— facultatif</span>
            </label>
            <input
              id="onboarding-email"
              type="email"
              placeholder="contact@garage-dupont.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={CHAMP}
            />

            <button
              type="button"
              onClick={() => setEtape(2)}
              disabled={!nomValide}
              style={{
                width: "100%",
                padding: "10px 12px",
                marginTop: 6,
                background: nomValide ? ACCENT : "#CBD5E1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: nomValide ? "pointer" : "not-allowed",
              }}
            >
              Continuer
            </button>
          </>
        )}

        {etape === 2 && (
          <>
            <p style={{ fontSize: 12.5, color: "#64748B", marginBottom: 14 }}>
              Choisissez tout ce qui vous concerne. Votre tableau de bord n&apos;affichera que ce
              qui vous sert, et vous pourrez le modifier à tout moment.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {PROFILS_ACTIVITE.map((activite) => {
                const choisie = profil.includes(activite.cle);
                return (
                  <button
                    key={activite.cle}
                    type="button"
                    onClick={() => basculerActivite(activite.cle)}
                    aria-pressed={choisie}
                    title={activite.exemple}
                    style={{
                      padding: "9px 13px",
                      borderRadius: 999,
                      border: `1px solid ${choisie ? ACCENT : "#E2E8F0"}`,
                      background: choisie ? "#EAF0FF" : "#fff",
                      color: choisie ? ACCENT : "#334155",
                      fontSize: 13,
                      fontWeight: choisie ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {activite.label}
                  </button>
                );
              })}
            </div>

            {erreur && (
              <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>{erreur}</p>
            )}

            <button
              type="button"
              onClick={creer}
              disabled={profil.length === 0 || enCours}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: profil.length > 0 && !enCours ? ACCENT : "#CBD5E1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: profil.length > 0 && !enCours ? "pointer" : "not-allowed",
              }}
            >
              {enCours ? "Création..." : "Ouvrir mon tableau de bord"}
            </button>

            <button
              type="button"
              onClick={() => setEtape(1)}
              disabled={enCours}
              style={{
                width: "100%",
                padding: "10px 12px",
                marginTop: 6,
                background: "none",
                color: "#64748B",
                border: "none",
                fontSize: 13,
                cursor: enCours ? "not-allowed" : "pointer",
              }}
            >
              Revenir
            </button>
          </>
        )}
      </div>
    </div>
  );
}
