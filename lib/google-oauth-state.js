import crypto from "node:crypto";

// State OAuth Google signé — préparation locale (voir app/api/auth/google/
// connect et callback). Secret serveur dédié, jamais exposé au client.
// Échec fermé si la variable manque : on ne génère ni ne vérifie jamais un
// state avec un secret absent ou vide (pas de valeur par défaut).
function getSecret() {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("GOOGLE_OAUTH_STATE_SECRET manquant");
  }
  return secret;
}

const DUREE_VALIDITE_MS = 10 * 60 * 1000; // 10 minutes — état par nature éphémère (durée d'un aller-retour OAuth).

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
}

// Construit et signe un state {garageId, userId, nonce}. exp est calculé ici,
// jamais fourni par l'appelant.
export function creerStateSigne({ garageId, userId, nonce }) {
  const payload = { garageId, userId, nonce, exp: Date.now() + DUREE_VALIDITE_MS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

// Vérifie la signature ET l'expiration. Retourne le payload si valide, sinon
// null — ne lève jamais d'exception applicative sur un state invalide (un
// state malformé est un cas attendu, pas une erreur serveur), mais laisse
// remonter l'erreur si le secret lui-même est absent (échec fermé).
export function verifierStateSigne(stateBrut) {
  if (typeof stateBrut !== "string" || !stateBrut.includes(".")) {
    return null;
  }
  const [payloadB64, signature] = stateBrut.split(".");
  if (!payloadB64 || !signature) {
    return null;
  }

  const attendu = sign(payloadB64);
  const bufAttendu = Buffer.from(attendu, "hex");
  const bufRecu = Buffer.from(signature, "hex");
  if (bufAttendu.length !== bufRecu.length || !crypto.timingSafeEqual(bufAttendu, bufRecu)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }

  if (!payload || typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return null;
  }
  if (!payload.garageId || !payload.userId || !payload.nonce) {
    return null;
  }

  return payload;
}

export function genererNonce() {
  return crypto.randomBytes(32).toString("hex");
}

export function comparerNonces(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
