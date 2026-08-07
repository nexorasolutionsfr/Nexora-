const tools = ["Slack", "HubSpot", "Notion", "Gmail", "Shopify", "Airtable", "Stripe", "Google Sheets"]

export function TrustedBy() {
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-sm text-muted-foreground">
          Nous connectons les outils que vos équipes utilisent déjà
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {tools.map((tool) => (
            <span
              key={tool}
              className="font-display text-lg font-semibold text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
