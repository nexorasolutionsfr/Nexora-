import { NouvelleFacture } from "@/components/auto/ImportFacture"
import { identifiantOuNul } from "@/lib/auto/identifiants"

export const metadata = { title: "Ajouter ma facture — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string }> }) {
  const { vehicule } = await searchParams
  return <NouvelleFacture vehiculeId={identifiantOuNul(vehicule)} />
}
