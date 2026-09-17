"use client";

// Le dossier d'une voiture, à garder, imprimer et transmettre soi-même, par
// exemple lors d'une vente. Tout est préparé dans le navigateur : rien n'est
// envoyé ailleurs, aucun fichier ni lien de document n'est inclus.
// « PDF » = l'impression du navigateur (destination « Enregistrer au format
// PDF ») : aucun fichier PDF n'est produit par Nexora.
// « Tableau » = un fichier CSV téléchargé. Règles : lib/auto/export.js.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { aujourdhuiIso } from "@/lib/auto/echeances";
import { TYPES_DOCUMENT } from "@/lib/auto/documents";
import { construireExport, exportCsv, nomFichierExport } from "@/lib/auto/export";
import { Alerte, Chargement, PageAuto, boutonPrincipal, boutonSecondaire, carte, deconnexionVolontaire, useSessionAuto } from "@/components/auto/elements";
import { ENERGIES, TYPES_INTERVENTION, formaterDate, formaterEuros, formaterKm } from "@/components/auto/format";
import { RESULTATS_CONTROLE } from "@/components/auto/validation";

const enTable = (liste) => Object.fromEntries(liste.map((e) => [e.valeur, e.libelle]));
const LIBELLES = {
  interventions: enTable(TYPES_INTERVENTION),
  energies: enTable(ENERGIES),
  documents: enTable(TYPES_DOCUMENT),
  resultats: enTable(RESULTATS_CONTROLE),
};
const euros = (centimes) => formaterEuros(centimes / 100);

async function chargerDossier(vehiculeId) {
  const [vehicule, releves, historique, documents] = await Promise.all([
    supabase.from("auto_vehicules").select("marque, modele, motorisation, annee, energie, immatriculation, date_mise_en_circulation, archive_le").eq("id", vehiculeId).maybeSingle(),
    supabase.from("auto_releves_km").select("id, kilometrage, releve_le, source").eq("vehicule_id", vehiculeId),
    supabase
      .from("auto_historique")
      .select("id, type, realise_le, kilometrage, prestataire, montant_ttc, libelle, operations, saisie, source, resultat_controle, controle_valable_jusqu_au")
      .eq("vehicule_id", vehiculeId),
    supabase.from("auto_documents").select("type, titre, date_document, historique_id, created_at").eq("vehicule_id", vehiculeId),
  ]);
  if ([vehicule, releves, historique, documents].some((r) => r.error)) return { chargement: false, erreur: true };
  if (!vehicule.data) return { chargement: false, introuvable: true };
  return { chargement: false, donnees: { vehicule: vehicule.data, releves: releves.data, historique: historique.data, documents: documents.data } };
}

export default function DossierVoiture({ vehiculeId }) {
  const session = useSessionAuto();
  const router = useRouter();
  const [etat, setEtat] = useState({ chargement: true });
  const aujourdhui = aujourdhuiIso();

  useEffect(() => {
    if (session === null && !deconnexionVolontaire()) router.replace(`/auto/connexion?suite=/auto/vehicules/${vehiculeId}/dossier`);
  }, [session, router, vehiculeId]);

  useEffect(() => {
    if (!session) return;
    let actif = true;
    chargerDossier(vehiculeId).then((resultat) => {
      if (actif) setEtat(resultat);
    });
    return () => {
      actif = false;
    };
  }, [session, vehiculeId]);

  const dossier = useMemo(() => (etat.donnees ? construireExport({ ...etat.donnees, libelles: LIBELLES, aujourdhui }) : null), [etat.donnees, aujourdhui]);

  function telecharger() {
    const url = URL.createObjectURL(new Blob([exportCsv(dossier)], { type: "text/csv;charset=utf-8" }));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = nomFichierExport(etat.donnees.vehicule, aujourdhui);
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!session || etat.chargement) {
    return (
      <PageAuto session={session}>
        <Chargement />
      </PageAuto>
    );
  }
  if (etat.erreur || etat.introuvable) {
    return (
      <PageAuto session={session}>
        <Alerte>{etat.introuvable ? "Cette voiture est introuvable." : "Impossible de préparer le dossier. Vérifiez votre connexion."}</Alerte>
      </PageAuto>
    );
  }

  const { vehicule, interventions, kilometrages, depenses, documents } = dossier;
  const identite = [
    ["Immatriculation", vehicule.immatriculation],
    ["Motorisation", vehicule.motorisation],
    ["Énergie", vehicule.energie],
    ["Année", vehicule.annee],
    ["Première mise en circulation", vehicule.miseEnCirculation ? formaterDate(vehicule.miseEnCirculation) : null],
    ["Archivée le", vehicule.archiveeLe ? formaterDate(vehicule.archiveeLe) : null],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <PageAuto session={session} large>
      <div className="print:hidden">
        <Link href={`/auto/vehicules/${vehiculeId}`} className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {vehicule.marque} {vehicule.modele}
        </Link>
      </div>

      <header className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dossier de la voiture · établi le {formaterDate(dossier.genereLe)}</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-tight text-foreground">
          {vehicule.marque} {vehicule.modele}
        </h1>
        <p className="mt-2 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-foreground print:border-slate-400 print:bg-white">{dossier.avertissement}</p>
      </header>

      <div className="mt-4 grid gap-3 min-[480px]:grid-cols-2 print:hidden">
        <button type="button" onClick={() => window.print()} className={boutonPrincipal}>
          <Printer className="size-5" aria-hidden="true" />
          Imprimer ou enregistrer en PDF
        </button>
        <button type="button" onClick={telecharger} className={boutonSecondaire}>
          <Download className="size-5" aria-hidden="true" />
          Tableau (CSV)
        </button>
      </div>
      <div className="mt-2 space-y-1 text-[13px] leading-snug text-muted-foreground print:hidden">
        <p>
          <span className="font-semibold text-foreground/80">PDF :</span> le bouton ouvre l'impression de votre navigateur ; choisissez « Enregistrer au format PDF » (sur
          téléphone, depuis l'aperçu d'impression ou le partage). Nexora ne crée pas de fichier PDF.
        </p>
        <p>
          <span className="font-semibold text-foreground/80">Tableau :</span> un fichier CSV téléchargé, qui s'ouvre dans un tableur.
        </p>
        <p>Préparé sur cet appareil : rien n'est envoyé. Les fichiers de vos documents restent privés et ne sont pas inclus.</p>
      </div>

      <Section titre="La voiture">
        {identite.length ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[480px]:grid-cols-2">
            {identite.map(([terme, valeur]) => (
              <div key={terme}>
                <dt className="text-[13px] text-muted-foreground">{terme}</dt>
                <dd className="font-medium text-foreground">{valeur}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Seules la marque et le modèle sont renseignés.</p>
        )}
      </Section>

      <Section titre={`Interventions (${interventions.length})`}>
        {interventions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune intervention enregistrée.</p>
        ) : (
          <ol className="divide-y divide-border">
            {interventions.map((i) => (
              <li key={i.id} className="break-inside-avoid py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold text-foreground">
                    {i.type} · {formaterDate(i.date)}
                  </span>
                  {i.montantTtc != null ? <span className="font-medium tabular-nums text-foreground">{formaterEuros(i.montantTtc)}</span> : null}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  {[i.kilometrage != null ? formaterKm(i.kilometrage) : null, i.professionnel, i.resultatControle, i.controleValableJusquAu ? `valable jusqu'au ${formaterDate(i.controleValableJusquAu)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {i.operations.length || i.detail ? <p className="break-words text-sm text-foreground/80">{i.operations.length ? i.operations.join(" ; ") : i.detail}</p> : null}
                <p className="text-[13px] text-muted-foreground">{i.provenance}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section titre="Kilométrages">
        {kilometrages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun kilométrage enregistré.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {kilometrages.map((k, n) => (
              <li key={`${k.date}-${n}`} className="flex flex-wrap justify-between gap-x-3">
                <span className="text-foreground">
                  {formaterDate(k.date)} <span className="text-muted-foreground">· {k.source}</span>
                </span>
                <span className="font-medium tabular-nums text-foreground">{formaterKm(k.kilometrage)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section titre="Dépenses déclarées">
        {depenses.nombreAvecMontant === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun montant enregistré.</p>
        ) : (
          <>
            <p className="font-semibold text-foreground">
              {euros(depenses.totalCentimes)} <span className="font-normal text-muted-foreground">depuis le {formaterDate(depenses.depuis)}</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {depenses.parAnnee.map((a) => (
                <li key={a.annee} className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-foreground">{a.annee}</span>
                  <span className="tabular-nums text-foreground">{euros(a.totalCentimes)}</span>
                </li>
              ))}
            </ul>
            {depenses.nombreSansMontant ? (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {depenses.nombreSansMontant > 1 ? `${depenses.nombreSansMontant} interventions sans montant ne sont pas comptées.` : "1 intervention sans montant n'est pas comptée."}
              </p>
            ) : null}
          </>
        )}
      </Section>

      <Section titre={`Documents (${documents.length})`}>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun document.</p>
        ) : (
          <>
            <ul className="space-y-1.5 text-sm">
              {documents.map((d, n) => (
                <li key={n} className="break-words">
                  <span className="font-medium text-foreground">{d.titre}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {[d.titre !== d.type ? d.type : null, d.date ? formaterDate(d.date) : null, d.justifie ? `justifie : ${d.justifie.replace(/du (\d{4}-\d{2}-\d{2})$/, (_, j) => `du ${formaterDate(j)}`)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">Liste seulement : les fichiers restent dans votre compte Nexora.</p>
          </>
        )}
      </Section>
    </PageAuto>
  );
}

function Section({ titre, children }) {
  return (
    <section className={`${carte} mt-4 break-inside-avoid-page print:border-slate-300 print:shadow-none`}>
      <h2 className="mb-2 font-semibold text-foreground">{titre}</h2>
      {children}
    </section>
  );
}
