// Outils communs aux recettes serveur — Supabase TEST seul.
//
// Refuse de démarrer hors du projet Test. Ouvre de vraies sessions (lien
// magique + OTP), jamais la clé de service pour un geste métier.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(RACINE + "/package.json");
const { createClient } = require("@supabase/supabase-js");

export const env = Object.fromEntries(
  readFileSync(RACINE + "/.env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
export const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes("slawilafseganlbghgwx")) { console.error("REFUS : pas le projet Test."); process.exit(2); }

export const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const anonClient = () => createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
export const BUCKET = "inspections-photos";

export async function session(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = anonClient();
  const { error: e2 } = await c.auth.verifyOtp({ email, token: data.properties.email_otp, type: "email" });
  if (e2) throw e2;
  return c;
}

export async function utilisateurs() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users || [];
}

export async function creerUtilisateur(email) {
  const existant = (await utilisateurs()).find((u) => u.email === email);
  if (existant) return existant;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user;
}

export function compteur() {
  let total = 0, ok = 0;
  const verifier = (libelle, cond, detail = "") => {
    total++;
    if (cond) { ok++; console.log(`  ✔ ${libelle}`); } else console.log(`  ✖ ${libelle}${detail ? " — " + detail : ""}`);
  };
  const bilan = () => { console.log(`\n${ok}/${total} contrôles au vert.`); return ok === total; };
  return { verifier, bilan };
}

/** Une vraie image PNG, aplat coloré avec une bande claire. */
export function imagePng(r = 120, g = 40, b = 40, largeur = 64, hauteur = 48) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  const crc32 = (buf) => { let c = -1; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = 8; ihdr[9] = 2;
  const lignes = [];
  for (let y = 0; y < hauteur; y++) {
    const l = Buffer.alloc(1 + largeur * 3);
    const clair = y > hauteur * 0.4 && y < hauteur * 0.6;
    for (let x = 0; x < largeur; x++) { l[1 + x * 3] = clair ? 230 : r; l[2 + x * 3] = clair ? 220 : g; l[3 + x * 3] = clair ? 200 : b; }
    lignes.push(l);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(lignes))), chunk("IEND", Buffer.alloc(0))]);
}

export const GARAGE_RECETTE_PREFIXE = "PROTO Constat";
export async function garageDeRecette(garageId) {
  const { data } = await admin.from("garages").select("id, nom_garage, owner_user_id").eq("id", garageId).single();
  if (!data?.nom_garage?.startsWith(GARAGE_RECETTE_PREFIXE)) { console.error(`REFUS : pas un garage « ${GARAGE_RECETTE_PREFIXE} ».`); process.exit(2); }
  return data;
}
