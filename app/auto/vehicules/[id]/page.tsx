import FicheVehicule from "@/components/auto/FicheVehicule"

export const metadata = { title: "Mon véhicule — Nexora" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FicheVehicule vehiculeId={id} />
}
