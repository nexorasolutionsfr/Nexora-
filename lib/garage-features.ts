export const GARAGE_FEATURES = {
  gmail: { label: "Boîte Gmail", category: "integration" },
  google_calendar: { label: "Google Agenda", category: "integration" },
  sms: { label: "SMS", category: "integration" },
  whatsapp: { label: "WhatsApp", category: "integration" },
  online_payment: { label: "Paiement en ligne", category: "integration" },
  automations: { label: "Automatisations", category: "automation" },
  invoicing: { label: "Facturation", category: "module" },
  parts_assistant: { label: "Assistant pièces auto", category: "module" },
  accounting_ai: { label: "IA comptable", category: "module" },
  analytics: { label: "Études et statistiques", category: "module" },
} as const;

export type GarageFeature = keyof typeof GARAGE_FEATURES;

export function hasGarageFeature(features: readonly string[] | null | undefined, feature: GarageFeature) {
  return Array.isArray(features) && features.includes(feature);
}

type GarageEntitlements = {
  active?: boolean | null;
  trial_ends_at?: string | null;
  enabled_features?: readonly string[] | null;
};

export function hasActiveGarageFeature(entitlements: GarageEntitlements | null | undefined, feature: GarageFeature) {
  if (!entitlements?.active) return false;
  if (entitlements.trial_ends_at && new Date(entitlements.trial_ends_at).getTime() <= Date.now()) return false;
  return hasGarageFeature(entitlements.enabled_features, feature);
}
