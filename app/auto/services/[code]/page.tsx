import { notFound } from "next/navigation"

import { FicheService } from "@/components/auto/UniversServices"
import { serviceParCode } from "@/components/auto/services"
import { identifiantOuNul } from "@/lib/auto/identifiants"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const service = serviceParCode(code)
  return { title: `${service ? service.nom : "Service"} — Nexora` }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ vehicule?: string }>
}) {
  const { code } = await params
  const { vehicule } = await searchParams
  if (!serviceParCode(code)) notFound()
  return <FicheService code={code} vehiculeId={identifiantOuNul(vehicule)} />
}
