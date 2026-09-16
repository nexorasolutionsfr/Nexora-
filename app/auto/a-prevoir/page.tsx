import APrevoir from "@/components/auto/APrevoir"
import { identifiantOuNul } from "@/lib/auto/identifiants"

export const metadata = { title: "À prévoir — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string; element?: string }> }) {
  const { vehicule, element } = await searchParams
  return (
    <APrevoir
      vehiculeFiltre={identifiantOuNul(vehicule)}
      elementCible={typeof element === "string" ? element : null}
    />
  )
}
