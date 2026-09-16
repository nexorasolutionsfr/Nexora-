import { Suspense } from "react"
import ConnexionAuto from "@/components/auto/ConnexionAuto"

export const metadata = { title: "Connexion — Nexora" }

// useSearchParams exige une frontière Suspense pour le rendu statique.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConnexionAuto />
    </Suspense>
  )
}
