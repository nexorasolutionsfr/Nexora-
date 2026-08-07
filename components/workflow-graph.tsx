import { Mail, Database, Bot, FileSpreadsheet, MessageSquare, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type NodeDef = {
  id: string
  icon: LucideIcon
  label: string
  x: number
  y: number
  tone: "primary" | "accent" | "muted"
}

const nodes: NodeDef[] = [
  { id: "trigger", icon: Mail, label: "Nouvel email", x: 8, y: 20, tone: "primary" },
  { id: "engine", icon: Zap, label: "Traitement n8n", x: 42, y: 50, tone: "accent" },
  { id: "crm", icon: Database, label: "CRM", x: 8, y: 78, tone: "muted" },
  { id: "ai", icon: Bot, label: "IA / Tri", x: 76, y: 18, tone: "muted" },
  { id: "sheet", icon: FileSpreadsheet, label: "Tableur", x: 76, y: 50, tone: "muted" },
  { id: "notify", icon: MessageSquare, label: "Notification", x: 76, y: 82, tone: "primary" },
]

const edges: [string, string][] = [
  ["trigger", "engine"],
  ["crm", "engine"],
  ["engine", "ai"],
  ["engine", "sheet"],
  ["engine", "notify"],
]

function nodeById(id: string) {
  return nodes.find((n) => n.id === id)!
}

const toneClasses: Record<NodeDef["tone"], string> = {
  primary: "border-primary/60 bg-primary/15 text-primary",
  accent: "border-accent/60 bg-accent/15 text-accent",
  muted: "border-border bg-secondary text-muted-foreground",
}

export function WorkflowGraph() {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm sm:aspect-[16/11]">
      {/* grid backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(1 0 0 / 6%) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 6%) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* edges */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)]"
      >
        {edges.map(([from, to], i) => {
          const a = nodeById(from)
          const b = nodeById(to)
          const midX = (a.x + b.x) / 2
          return (
            <path
              key={`${from}-${to}`}
              d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
              fill="none"
              stroke="oklch(0.7 0.17 18)"
              strokeWidth="0.5"
              strokeDasharray="3 3"
              style={{
                animation: "flow-dash 1.2s linear infinite",
                animationDelay: `${i * 0.15}s`,
                opacity: 0.7,
              }}
            />
          )
        })}
      </svg>

      {/* nodes */}
      {nodes.map((node, i) => {
        const Icon = node.icon
        return (
          <div
            key={node.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              animation: "float-slow 4s ease-in-out infinite",
              animationDelay: `${i * 0.4}s`,
            }}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-lg sm:h-12 sm:w-12 ${toneClasses[node.tone]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="whitespace-nowrap rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80 sm:text-xs">
                {node.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
