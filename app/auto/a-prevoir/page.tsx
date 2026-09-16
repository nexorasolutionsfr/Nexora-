import APrevoir from "@/components/auto/APrevoir"

export const metadata = { title: "À prévoir — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string; element?: string }> }) {
  const { vehicule, element } = await searchParams
  return (
    <APrevoir
      vehiculeFiltre={typeof vehicule === "string" ? vehicule : null}
      elementCible={typeof element === "string" ? element : null}
    />
  )
}
