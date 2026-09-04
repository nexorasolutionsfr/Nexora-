import { Calendar, Wrench, ListChecks, CircleDollarSign, ChevronRight } from "lucide-react"

// Représentation visuelle illustrative de l'accueil Garage OS — données
// clairement génériques, jamais présentées comme un résultat client réel.
const stats = [
  { icon: Calendar, label: "Rendez-vous aujourd'hui", value: "6" },
  { icon: Wrench, label: "Véhicules en atelier", value: "4" },
  { icon: ListChecks, label: "Priorités actives", value: "3" },
  { icon: CircleDollarSign, label: "Montant connu à risque", value: "540 €" },
]

const priorities = [
  { title: "Devis prêt — M. Lambert", meta: "Révision complète · 320 € TTC", tone: "#3D6BE0" },
  { title: "Créneau à valider — Mme Bertin", meta: "Diagnostic panne · demain 9h", tone: "#B45309" },
  { title: "Inspection en attente — Peugeot 208", meta: "Photos partagées · décision client", tone: "#3D6BE0" },
]

export function DashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full overflow-hidden rounded-2xl border border-[#1E2C4C] bg-[#0F1B33] p-3 shadow-[0_30px_80px_-30px_rgba(15,27,51,0.55)] sm:p-4"
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <span className="text-[11px] font-medium text-[#8CA0C9]">Aperçu illustratif — Accueil Garage OS</span>
      </div>

      <div className="rounded-xl bg-[#F5F7FA] p-3 sm:p-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <p className="text-[13px] font-bold text-[#0F1B33]">Bonjour, Garage Lambert</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Voici ce qui mérite votre attention.</p>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] text-[#3D6BE0]">
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-[13px] font-bold text-[#0F1B33]">{s.value}</div>
                <div className="truncate text-[9.5px] text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex items-center justify-between px-0.5 pb-2">
            <span className="text-[10.5px] font-semibold text-[#0F1B33]">Opportunités détectées</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          </div>
          <div className="flex flex-col gap-1.5">
            {priorities.map((p) => (
              <div key={p.title} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="h-full w-[3px] self-stretch rounded-full" style={{ backgroundColor: p.tone }} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[11px] font-semibold text-[#0F1B33]">{p.title}</div>
                  <div className="truncate text-[9.5px] text-slate-500">{p.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
