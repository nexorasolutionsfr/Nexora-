import Image from "next/image"

type SiteLogoProps = {
  dark?: boolean
  className?: string
  priority?: boolean
}

export function SiteLogo({ dark = false, className, priority = false }: SiteLogoProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Image src="/logo-nexora.png" alt="Nexora" width={240} height={116} className="h-9 w-9 shrink-0 object-contain" priority={priority} />
      <span className="leading-tight">
        <span className="block font-display text-[15px] font-bold tracking-tight" style={{ color: dark ? "#fff" : "#0F1B33" }}>
          Nexora
        </span>
        <span className="block text-[11px]" style={{ color: dark ? "#8CA0C9" : "#64748B" }}>
          Garage OS
        </span>
      </span>
    </span>
  )
}
