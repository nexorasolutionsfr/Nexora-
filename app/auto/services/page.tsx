import { CatalogueServices } from "@/components/auto/UniversServices"
import { identifiantOuNul } from "@/lib/auto/identifiants"

export const metadata = { title: "Services — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string; mode?: string; besoin?: string }> }) {
  const { vehicule, mode, besoin } = await searchParams
  return (
    <CatalogueServices
      vehiculeId={identifiantOuNul(vehicule)}
      mode={typeof mode === "string" ? mode : null}
      besoin={typeof besoin === "string" ? besoin : null}
    />
  )
}
