import type { Metadata } from "next"
import { notFound } from "next/navigation"

import ControleEnvironnement from "@/components/auto/ControleEnvironnement"

// Contrôle d'une prévisualisation : à quel projet Supabase le navigateur ET le
// serveur sont reliés, et si les intégrations sortantes sont coupées. Aucune
// clé affichée. Hors de /auto exprès : la mise en page de Nexora Auto se ferme
// sur une prévisualisation reliée à la Production, précisément le cas à voir.
// Absente de la Production (la route /api/auto/environnement y reste).

export const metadata: Metadata = {
  title: "Contrôle de l'environnement — Nexora",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound()
  return <ControleEnvironnement />
}
