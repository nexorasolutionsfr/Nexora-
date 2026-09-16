import FicheVehicule from "@/components/auto/FicheVehicule"

export const metadata = { title: "Mon véhicule — Nexora" }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ action?: string }>
}) {
  const { id } = await params
  const { action } = await searchParams
  return <FicheVehicule vehiculeId={id} actionInitiale={typeof action === "string" ? action : null} />
}
