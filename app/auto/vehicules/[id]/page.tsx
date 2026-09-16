import { notFound } from "next/navigation"

import FicheVehicule from "@/components/auto/FicheVehicule"
import { estIdentifiant } from "@/lib/auto/identifiants"

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
  // Une adresse mal formée n'interroge pas la base (sinon quatre erreurs 400).
  if (!estIdentifiant(id)) notFound()
  return <FicheVehicule vehiculeId={id} actionInitiale={typeof action === "string" ? action : null} />
}
