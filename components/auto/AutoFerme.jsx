// Nexora Auto n'est pas ouvert ici : aucune donnée n'est lue, aucun compte
// n'est proposé. Rendu par le serveur (app/auto/layout.tsx).

import Image from "next/image";
import Link from "next/link";

export default function AutoFerme() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10">
      <Link href="/" className="flex items-center gap-2 self-start rounded-lg">
        <Image src="/logo-nexora.png" alt="" width={240} height={116} className="h-8 w-8 object-contain" priority />
        <span className="font-display text-[17px] font-bold tracking-tight text-foreground">Nexora</span>
      </Link>
      <h1 className="mt-10 font-display text-[32px] font-bold leading-tight tracking-tight text-foreground">Nexora Auto arrive bientôt</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        L'application pour suivre votre voiture n'est pas encore ouverte. Revenez un peu plus tard.
      </p>
    </main>
  );
}
