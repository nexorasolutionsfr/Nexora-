import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type GoogleOAuthState = {
  garageId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
};

function getStateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_STATE_SECRET manquant ou trop court");
  }
  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getStateSecret()).update(encodedPayload).digest("base64url");
}

export function createGoogleOAuthState(garageId: string, userId: string) {
  const payload: GoogleOAuthState = {
    garageId,
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomUUID(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyGoogleOAuthState(state: string): GoogleOAuthState | null {
  const [encodedPayload, receivedSignature, ...extra] = state.split(".");
  if (!encodedPayload || !receivedSignature || extra.length) return null;

  const expectedSignature = sign(encodedPayload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as GoogleOAuthState;
    if (!payload.garageId || !payload.userId || !payload.nonce || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
