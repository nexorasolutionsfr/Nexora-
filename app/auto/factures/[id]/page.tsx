import { notFound } from "next/navigation"

import { ConfirmerFacture } from "@/components/auto/ImportFacture"
import { estIdentifiant } from "@/lib/auto/identifiants"

export const metadata = { title: "Vérifier la facture — Nexora" }

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lire?: string }>
}) {
  const { id } = await params
  const { lire } = await searchParams
  if (!estIdentifiant(id)) notFound()
  return <ConfirmerFacture documentId={id} lire={lire === "1"} />
}
