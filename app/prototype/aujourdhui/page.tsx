// Prototype de l'écran Aujourd'hui — ouvrable en local seulement.
//
// `notFound()` en production : cette page ne doit pas exister sur le site
// servi aux garages. Elle sert à juger une direction visuelle avant de
// l'intégrer au tableau de bord, pas à être livrée.
//
// Ouvrir : http://localhost:3113/prototype/aujourdhui

import { notFound } from "next/navigation";
import AujourdhuiPrototype from "@/components/aujourdhui/AujourdhuiPrototype";

export const metadata = { title: "Prototype — Aujourd'hui" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AujourdhuiPrototype />;
}
