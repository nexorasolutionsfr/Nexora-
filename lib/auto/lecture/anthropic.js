// Fournisseur de lecture : Claude (Anthropic), via l'API Messages.
//
// Interface commune à tout fournisseur (pour pouvoir le remplacer) :
//   compterJetons(contenu) → { jetonsEntree }            (gratuit)
//   lire(contenu)          → { brut, usage, dureeMs }
//   contenu = { typeMime, base64 }
// En cas d'échec : ErreurLecture { code, facturation, usage? } où facturation
// vaut "non_facturee" (refus avant traitement), "facturee" (réponse reçue et
// comptée) ou "inconnue" (délai dépassé, coupure : la facture fera foi).
//
// Aucune nouvelle tentative automatique : chaque essai est décidé par la
// personne et journalisé. `fetch` est injectable pour les tests.

import { SCHEMA_PROPOSITION } from "./proposition.js";

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

export class ErreurLecture extends Error {
  constructor(code, { facturation = "inconnue", usage = null, statut = null } = {}) {
    super(code);
    this.code = code;
    this.facturation = facturation;
    this.usage = usage;
    this.statut = statut;
  }
}

const CONSIGNES = [
  "Tu lis une facture d'entretien ou de réparation automobile pour pré-remplir un dossier que la personne vérifiera.",
  "N'invente rien : une information absente ou illisible vaut null. Une valeur déduite ou partiellement lisible est « incertaine ».",
  "Dates au format AAAA-MM-JJ. date_intervention seulement si une date de travaux distincte de la date de facture est imprimée.",
  "montant_ttc : le total TTC de la facture entière, jamais une ligne. kilometrage : le compteur relevé à l'intervention.",
  "Opérations : regroupe pièces et main-d'œuvre d'une même opération. Classe « revision » seulement si le document dit révision, entretien constructeur ou forfait entretien ; une vidange seule reste « vidange ».",
  "Ne recopie aucune donnée personnelle du client (nom, adresse, téléphone) : elles ne sont pas demandées.",
].join("\n");

function blocDocument({ typeMime, base64 }) {
  if (typeMime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  return { type: "image", source: { type: "base64", media_type: typeMime, data: base64 } };
}

// Le comptage des jetons refuse max_tokens et temperature : `pourComptage`.
function corps(modele, contenu, jetonsSortieMax, { pourComptage = false } = {}) {
  return {
    model: modele,
    ...(pourComptage ? {} : { max_tokens: jetonsSortieMax, temperature: 0 }),
    system: CONSIGNES,
    tools: [{ name: "proposer_facture", description: "Propose les informations lues sur la facture.", input_schema: SCHEMA_PROPOSITION }],
    tool_choice: { type: "tool", name: "proposer_facture" },
    messages: [{ role: "user", content: [blocDocument(contenu), { type: "text", text: "Lis cette facture et propose les informations." }] }],
  };
}

// Statuts HTTP refusés avant traitement : pas de facturation. Tout autre
// échec (500, 502…) reste « inconnue » : prudence sur le budget.
const REFUS_AVANT_TRAITEMENT = new Set([400, 401, 403, 404, 413, 429, 529]);

export function creerFournisseurAnthropic({ cle, modele, jetonsSortieMax = 1500, delaiMs = 45000, fetch: requeter = globalThis.fetch, maintenant = () => Date.now() }) {
  const entetes = { "x-api-key": cle, "anthropic-version": VERSION, "content-type": "application/json" };

  async function appeler(chemin, charge, codeDelai) {
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), delaiMs);
    try {
      return await requeter(`${API}${chemin}`, { method: "POST", headers: entetes, body: JSON.stringify(charge), signal: controle.signal });
    } catch {
      // Délai dépassé ou coupure réseau : la demande a pu être traitée.
      throw new ErreurLecture(codeDelai, { facturation: "inconnue" });
    } finally {
      clearTimeout(minuterie);
    }
  }

  return {
    nom: "anthropic",
    modele,

    async compterJetons(contenu) {
      const reponse = await appeler("/messages/count_tokens", corps(modele, contenu, jetonsSortieMax, { pourComptage: true }), "comptage_indisponible");
      if (!reponse.ok) throw new ErreurLecture("comptage_refuse", { facturation: "non_facturee", statut: reponse.status });
      const donnees = await reponse.json();
      if (!Number.isFinite(donnees?.input_tokens)) throw new ErreurLecture("comptage_illisible", { facturation: "non_facturee" });
      return { jetonsEntree: donnees.input_tokens };
    },

    async lire(contenu) {
      const debut = maintenant();
      const reponse = await appeler("/messages", corps(modele, contenu, jetonsSortieMax), "delai_depasse");
      const dureeMs = maintenant() - debut;
      if (!reponse.ok) {
        throw new ErreurLecture(reponse.status === 429 ? "trop_de_demandes" : reponse.status === 529 ? "fournisseur_surcharge" : "refus_fournisseur", {
          facturation: REFUS_AVANT_TRAITEMENT.has(reponse.status) ? "non_facturee" : "inconnue",
          statut: reponse.status,
        });
      }
      let donnees;
      try {
        donnees = await reponse.json();
      } catch {
        throw new ErreurLecture("reponse_illisible", { facturation: "inconnue" });
      }
      const usage = donnees?.usage ?? null;
      const outil = Array.isArray(donnees?.content) ? donnees.content.find((b) => b?.type === "tool_use" && b?.name === "proposer_facture") : null;
      if (donnees?.stop_reason === "max_tokens") throw new ErreurLecture("reponse_tronquee", { facturation: "facturee", usage });
      if (!outil?.input || typeof outil.input !== "object") throw new ErreurLecture("reponse_sans_proposition", { facturation: "facturee", usage });
      return { brut: outil.input, usage, dureeMs };
    },
  };
}
