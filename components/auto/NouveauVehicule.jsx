"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Chargement, PageAuto, useSessionAuto } from "@/components/auto/elements";
import FormulaireVehicule from "@/components/auto/FormulaireVehicule";
import { messageErreurAuto } from "@/components/auto/format";

export default function NouveauVehicule() {
  const session = useSessionAuto();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/auto/connexion?mode=inscription&suite=/auto/vehicules/nouveau");
  }, [session, router]);

  // La voiture, son kilométrage et son dernier contrôle partent ensemble :
  // auto_ajouter_vehicule enregistre tout ou rien.
  async function enregistrer(donnees) {
    const { data, error } = await supabase.rpc("auto_ajouter_vehicule", {
      p_marque: donnees.marque,
      p_modele: donnees.modele,
      p_annee: donnees.annee,
      p_energie: donnees.energie,
      p_immatriculation: donnees.immatriculation,
      p_date_mise_en_circulation: donnees.dateMiseEnCirculation,
      p_kilometrage: donnees.kilometrage,
      p_dernier_controle: donnees.dernierControle,
      p_controle_valable_jusqu_au: donnees.controleValableJusquAu,
    });
    if (error) return messageErreurAuto(error);
    router.replace(`/auto/vehicules/${data}`);
    return "";
  }

  return (
    <PageAuto session={session}>
      {session ? (
        <>
          <Link href="/auto" className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Mon garage
          </Link>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight text-foreground">Ajouter un véhicule</h1>
          <p className="mb-6 mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            Seuls la marque et le modèle sont obligatoires. Le reste sert à calculer vos échéances.
          </p>
          <FormulaireVehicule creation libelleBouton="Ajouter ce véhicule" onEnregistrer={enregistrer} />
        </>
      ) : (
        <Chargement />
      )}
    </PageAuto>
  );
}
