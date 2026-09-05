"use client";

// Les états de chargement.
//
// POURQUOI DES SQUELETTES ET PAS UN TOURNIQUET
//
// Un rond qui tourne dit « attendez » et rien d'autre. Un squelette dit « voici
// ce qui arrive, et où » : l'œil se place avant que le contenu n'existe, et la
// page ne saute pas au moment où il arrive. Sur un tableau de bord ouvert vingt
// fois par jour, cette absence de saut est ce qui donne l'impression que le
// logiciel est rapide — plus encore que la vitesse réelle.
//
// LA RÈGLE : LE SQUELETTE A LA FORME DE CE QU'IL ANNONCE
//
// Un rectangle générique de la mauvaise hauteur est pire que rien : il promet
// une mise en page, puis la contredit. Chaque squelette ci-dessous reprend donc
// la structure réelle du bloc qu'il remplace — mêmes hauteurs, mêmes colonnes,
// mêmes espacements.

function Barre({ largeur = "w-full", hauteur = "h-3", classe = "" }) {
  return <div className={`nx-squelette rounded-md ${largeur} ${hauteur} ${classe}`} />;
}

/** Une carte simple, pour les blocs dont on ne connaît pas encore le détail. */
export function SquelettteCarte({ hauteur = "h-24" }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${hauteur} nx-squelette`} />;
}

/** Les quatre compteurs de l'accueil : deux par ligne sur téléphone. */
export function SquelettesIndicateurs() {
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex-1 min-w-[140px] bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center gap-3">
          <div className="nx-squelette w-9 h-9 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Barre largeur="w-10" hauteur="h-4" />
            <Barre largeur="w-20" hauteur="h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Une zone de décision : en-tête puis quelques lignes. */
export function SquelettteZone({ lignes = 2 }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <div className="nx-squelette w-[30px] h-[30px] rounded-[9px] shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Barre largeur="w-40" hauteur="h-3.5" />
          <Barre largeur="w-56" hauteur="h-2.5" />
        </div>
      </div>
      <div className="px-5 py-1">
        {Array.from({ length: lignes }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3.5 border-b border-slate-50 last:border-0">
            <div className="nx-squelette w-[3px] self-stretch rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Barre largeur="w-2/3" hauteur="h-3.5" />
              <Barre largeur="w-1/3" hauteur="h-2.5" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Une liste de fiches — clients, véhicules, ordres de réparation. */
export function SquelettesListe({ lignes = 4 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[64px]">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Barre largeur="w-1/2" hauteur="h-3.5" />
            <Barre largeur="w-1/3" hauteur="h-2.5" />
          </div>
          <div className="nx-squelette h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * L'accueil au chargement.
 *
 * L'ordre reprend exactement celui de la vue réelle : salutation, compteurs,
 * zones de décision, journée. Le contenu se substitue au squelette sans que
 * rien ne se déplace.
 */
export function SquelettteAccueil() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-2.5">
        <Barre largeur="w-64" hauteur="h-5" />
        <Barre largeur="w-40" hauteur="h-3" />
        <div className="nx-squelette h-7 w-36 rounded-full" />
      </div>
      <SquelettesIndicateurs />
      <SquelettteZone lignes={2} />
      <SquelettteZone lignes={1} />
      <SquelettteCarte hauteur="h-64" />
    </div>
  );
}
