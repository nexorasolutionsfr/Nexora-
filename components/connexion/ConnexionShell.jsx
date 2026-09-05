"use client";

import AtelierDecor from "./AtelierDecor";

const NAVY = "#0F1B33";
const ACCENT = "#3D6BE0";

// L'habillage commun de tous les écrans d'entrée : connexion, inscription,
// mot de passe oublié, nouveau mot de passe.
//
// POURQUOI UN HABILLAGE COMMUN
//
// Ces quatre écrans étaient quatre cartes blanches de 320 px sur fond gris,
// chacune avec ses propres styles en ligne. Le premier écran que voit un
// prospect ne ressemblait à rien — ni à Nexora, ni à un logiciel de garage.
// Et à quatre endroits, une correction se fait trois fois puis s'oublie.
//
// LA COMPOSITION
//
// À gauche, le métier : fond marine, engrenages au ralenti, et la promesse en
// une phrase. À droite, le formulaire, sur fond clair, sans décor — c'est là
// qu'on tape, ça doit être le plus lisible de l'écran.
//
// Sur un téléphone, le panneau de gauche disparaît : il ne reste que le
// logotype et le formulaire. Un garagiste qui se connecte depuis l'atelier
// veut son champ mot de passe, pas un argumentaire.
export default function ConnexionShell({ titre, sousTitre, children, bas }) {
  return (
    <div className="nx-connexion">
      <style>{`
        .nx-connexion { min-height: 100vh; min-height: 100dvh; display: flex; background: #fff; }

        .nx-vitrine {
          display: none; position: relative; width: 46%; max-width: 560px;
          background: ${NAVY}; color: #fff; padding: 48px 44px;
          flex-direction: column; justify-content: space-between; overflow: hidden;
        }
        @media (min-width: 900px) {
          .nx-vitrine { display: flex; }
          .nx-logo-formulaire { display: none; }
        }

        .nx-vitrine-contenu { position: relative; z-index: 1; }

        .nx-formulaire {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 32px 24px; background: #fff;
        }
        .nx-carte { width: 100%; max-width: 380px; }

        /* Les champs. Hauteur 48 px : une cible tactile confortable avec des
           doigts gras, ce qui est la situation normale d'un atelier. */
        .nx-champ {
          width: 100%; box-sizing: border-box; min-height: 48px;
          padding: 12px 14px; border: 1.5px solid #E2E8F0; border-radius: 12px;
          font-size: 15px; color: ${NAVY}; background: #fff;
          -webkit-text-fill-color: ${NAVY};
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .nx-champ::placeholder { color: #94A3B8; opacity: 1; }
        .nx-champ:focus {
          outline: none; border-color: ${ACCENT};
          box-shadow: 0 0 0 4px rgba(61,107,224,0.13);
        }
        .nx-champ:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 1000px #fff inset;
          -webkit-text-fill-color: ${NAVY};
        }

        .nx-label {
          display: block; font-size: 13px; font-weight: 600;
          color: #334155; margin-bottom: 6px;
        }

        .nx-bouton {
          width: 100%; min-height: 48px; border: none; border-radius: 12px;
          background: ${ACCENT}; color: #fff; font-size: 15px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: transform .12s ease, box-shadow .15s ease, background-color .15s ease;
          box-shadow: 0 2px 10px rgba(61,107,224,0.28);
        }
        .nx-bouton:hover:not(:disabled) { background: #3560CE; box-shadow: 0 4px 16px rgba(61,107,224,0.34); }
        /* L'enfoncement de 1 px : le seul retour tactile qu'un écran sait donner. */
        .nx-bouton:active:not(:disabled) { transform: translateY(1px); box-shadow: 0 1px 6px rgba(61,107,224,0.28); }
        .nx-bouton:disabled { opacity: .6; cursor: default; }

        .nx-lien {
          background: none; border: none; padding: 6px 0; cursor: pointer;
          color: #64748B; font-size: 13.5px; transition: color .15s ease;
        }
        .nx-lien:hover { color: ${ACCENT}; }

        /* L'erreur arrive par le haut plutôt qu'en surgissant : on la voit
           apparaître, donc on sait qu'elle est nouvelle. Pas de secousse — une
           erreur de mot de passe n'est pas une faute, c'est une frappe. */
        .nx-erreur {
          display: flex; gap: 8px; align-items: flex-start;
          background: #FDECEC; color: #B91C1C; border-radius: 10px;
          padding: 10px 12px; font-size: 13.5px; line-height: 1.45;
          animation: nx-arrive .22s ease-out;
        }
        @keyframes nx-arrive {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: none; }
        }

        .nx-rond {
          width: 16px; height: 16px; border-radius: 9999px;
          border: 2px solid rgba(255,255,255,0.45); border-top-color: #fff;
          animation: nx-rotation .7s linear infinite;
        }
        @keyframes nx-rotation { to { transform: rotate(360deg); } }

        .nx-carte > * + * { margin-top: 16px; }

        @media (prefers-reduced-motion: reduce) {
          .nx-erreur, .nx-rond { animation: none; }
          .nx-bouton { transition: none; }
          .nx-bouton:active:not(:disabled) { transform: none; }
        }
      `}</style>

      <aside className="nx-vitrine">
        <AtelierDecor />
        <div className="nx-vitrine-contenu">
          <Logotype clair />
        </div>
        <div className="nx-vitrine-contenu">
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            L&apos;atelier tient tout seul.
          </div>
          <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, color: "#C3D0EA", maxWidth: 380 }}>
            Rendez-vous, contrôles, devis, factures. Vos clients savent où en est leur
            voiture, et vous ne rappelez plus personne pour le dire.
          </p>
        </div>
        <div className="nx-vitrine-contenu" style={{ fontSize: 12.5, color: "#8FA3C8" }}>
          Conçu pour les garages indépendants.
        </div>
      </aside>

      <main className="nx-formulaire">
        <div className="nx-carte">
          <div className="nx-logo-formulaire" style={{ marginBottom: 4 }}><Logotype /></div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: "-0.01em", margin: 0 }}>{titre}</h1>
            {sousTitre && <p style={{ fontSize: 14, color: "#64748B", marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>{sousTitre}</p>}
          </div>
          {children}
          {bas}
        </div>
      </main>
    </div>
  );
}

// Le logotype : la clé plate de Nexora, dessinée, pas importée. Une image de
// plus, c'est une requête de plus sur le premier écran.
export function Logotype({ clair = false }) {
  const couleur = clair ? "#fff" : NAVY;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={clair ? "#fff" : ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
      <span style={{ fontSize: 19, fontWeight: 700, color: couleur, letterSpacing: "-0.02em" }}>Nexora</span>
    </div>
  );
}
