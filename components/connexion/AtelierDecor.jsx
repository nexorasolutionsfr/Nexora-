"use client";

// Le décor de la page de connexion.
//
// TROIS RÈGLES QUE CE FICHIER S'IMPOSE
//
// 1. Aucun fichier image. Tout est en SVG et en CSS : rien à télécharger, rien
//    qui pixellise, et la page s'affiche instantanément même sur le réseau
//    d'un atelier en sous-sol.
// 2. Rien ne bouge vite. Les animations durent entre 12 et 40 secondes. Un
//    mouvement qu'on remarque est un mouvement qui dérange — surtout sur un
//    écran qu'on ouvre dix fois par jour.
// 3. `prefers-reduced-motion` coupe tout. Ce n'est pas une option : certaines
//    personnes ont des vertiges avec les animations, et une page de connexion
//    n'a pas le droit d'être un obstacle.
//
// Le motif est un engrenage et une trame d'atelier, à très faible opacité.
// L'idée est de reconnaître le métier au premier coup d'œil sans tomber dans
// le cliché du damier de circuit ou de la voiture de sport : ce sont des
// garages de quartier, pas des écuries de course.

export default function AtelierDecor() {
  return (
    <div aria-hidden className="nx-decor">
      <style>{`
        .nx-decor { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }

        /* Halo lent qui respire. Il donne de la profondeur au fond marine sans
           jamais attirer l'œil : 24 s par cycle, 4 % d'écart d'opacité. */
        .nx-halo {
          position: absolute; border-radius: 9999px; filter: blur(60px);
          animation: nx-respire 24s ease-in-out infinite;
        }
        .nx-halo-a { width: 460px; height: 460px; top: -140px; left: -120px;
          background: radial-gradient(circle, rgba(61,107,224,0.35), transparent 70%); }
        .nx-halo-b { width: 380px; height: 380px; bottom: -120px; right: -100px;
          background: radial-gradient(circle, rgba(61,107,224,0.22), transparent 70%);
          animation-delay: -12s; }

        @keyframes nx-respire {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        /* Les deux engrenages tournent en sens inverse, très lentement, comme
           un mécanisme au ralenti. 40 s et 28 s : jamais synchrones, donc le
           motif ne se répète pas à l'œil. */
        .nx-engrenage { position: absolute; color: #ffffff; }
        .nx-engrenage-a { top: 12%; right: 8%; width: 190px; opacity: 0.05;
          animation: nx-tourne 40s linear infinite; }
        .nx-engrenage-b { bottom: 14%; left: 6%; width: 120px; opacity: 0.04;
          animation: nx-tourne 28s linear infinite reverse; }

        @keyframes nx-tourne { to { transform: rotate(360deg); } }

        /* Trame technique : des lignes fines, comme un plan d'atelier. */
        .nx-trame { position: absolute; inset: 0; opacity: 0.035;
          background-image:
            linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px);
          background-size: 56px 56px; }

        @media (prefers-reduced-motion: reduce) {
          .nx-halo, .nx-engrenage { animation: none !important; }
        }
      `}</style>

      <div className="nx-trame" />
      <div className="nx-halo nx-halo-a" />
      <div className="nx-halo nx-halo-b" />

      <svg className="nx-engrenage nx-engrenage-a" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="50" cy="50" r="20" />
        <circle cx="50" cy="50" r="8" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={50 + Math.cos(a) * 22} y1={50 + Math.sin(a) * 22} x2={50 + Math.cos(a) * 32} y2={50 + Math.sin(a) * 32} strokeLinecap="round" />;
        })}
      </svg>

      <svg className="nx-engrenage nx-engrenage-b" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3">
        <circle cx="50" cy="50" r="18" />
        <circle cx="50" cy="50" r="7" />
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i * Math.PI) / 3;
          return <line key={i} x1={50 + Math.cos(a) * 20} y1={50 + Math.sin(a) * 20} x2={50 + Math.cos(a) * 30} y2={50 + Math.sin(a) * 30} strokeLinecap="round" />;
        })}
      </svg>
    </div>
  );
}
