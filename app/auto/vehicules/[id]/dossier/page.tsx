import { notFound } from "next/navigation"

import DossierVoiture from "@/components/auto/DossierVoiture"
import { estIdentifiant } from "@/lib/auto/identifiants"

export const metadata = { title: "Dossier de la voiture — Nexora" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!estIdentifiant(id)) notFound()
  return <DossierVoiture vehiculeId={id} />
}
