import { ImageResponse } from 'next/og'

export const alt = 'Nexora — Votre garage avance. Nexora garde le fil.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0F1B33',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: '#3D6BE0',
            }}
          />
          <div style={{ display: 'flex', color: '#FFFFFF', fontSize: 40, fontWeight: 700 }}>
            Nexora
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 48,
            color: '#FFFFFF',
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 900,
          }}
        >
          Votre garage avance. Nexora garde le fil.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            color: '#B7C4E6',
            fontSize: 30,
            maxWidth: 900,
          }}
        >
          Le Garage OS des garages indépendants : agenda, atelier, contrôle véhicule, devis, factures.
        </div>
      </div>
    ),
    { ...size },
  )
}
