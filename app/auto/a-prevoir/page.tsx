import APrevoir from "@/components/auto/APrevoir"

export const metadata = { title: "À prévoir — Nexora" }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicule?: string }> }) {
  const { vehicule } = await searchParams
  return <APrevoir vehiculeFiltre={typeof vehicule === "string" ? vehicule : null} />
}
