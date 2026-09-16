import { CatalogueServices } from "@/components/auto/UniversServices"

export const metadata = { title: "Services — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string; mode?: string }> }) {
  const { vehicule, mode } = await searchParams
  return <CatalogueServices vehiculeId={typeof vehicule === "string" ? vehicule : null} mode={typeof mode === "string" ? mode : null} />
}
