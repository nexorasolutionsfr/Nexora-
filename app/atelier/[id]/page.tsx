// SÉCURITÉ (audit 2026-09-01) : cette page appelait lire_etape_atelier /
// avancer_etape_atelier avec l'UUID brut de la page comme unique
// autorisation, sans jeton ni vérification — n'importe qui connaissant ou
// devinant cet UUID pouvait lire ET modifier le statut atelier de n'importe
// quel rendez-vous. Désactivée temporairement le temps de la remplacer par
// un accès à jeton opaque expirable (même mécanisme que /c/[token] et
// /i/[token]). Les deux RPC sont par ailleurs révoquées côté base pour anon
// et authenticated (voir migration de confinement).
export default function AtelierScanPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", padding: 20, fontFamily: "-apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 420, textAlign: "center", color: "#475569" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0F1B33" }}>Ce lien est temporairement indisponible.</div>
        <div style={{ fontSize: 14, marginTop: 8 }}>Le suivi atelier par lien est en cours de sécurisation. Contactez votre garage pour connaître l'état du véhicule.</div>
      </div>
    </div>
  );
}
