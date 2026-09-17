import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { empreinteSha256, sha256Hex } from "./empreinte.js";
import { nouvelIdentifiant } from "./identifiants.js";

const reference = (octets) => createHash("sha256").update(octets).digest("hex");

test("SHA-256 en JavaScript : identique à la référence, y compris aux limites de bloc", () => {
  for (const taille of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 1024 * 1024 + 3]) {
    const octets = new Uint8Array(randomBytes(taille));
    assert.equal(sha256Hex(octets), reference(octets), `taille ${taille}`);
  }
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("Empreinte : même valeur avec ou sans crypto.subtle (page non sûre)", async () => {
  const octets = new Uint8Array(randomBytes(4096));
  const avec = await empreinteSha256(octets.buffer.slice(0));
  const espion = { digest: () => { throw new Error("subtle utilisé"); } };
  assert.equal(await empreinteSha256(new Blob([octets]), { subtle: espion }).catch(() => "subtle utilisé"), "subtle utilisé");
  const sans = await empreinteSha256(new Blob([octets]), { subtle: null });
  assert.equal(avec, reference(octets));
  assert.equal(sans, reference(octets));
});

test("Identifiant : UUID v4 valide, avec ou sans crypto.randomUUID", () => {
  const motif = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(nouvelIdentifiant(), motif);
  const sansRandomUUID = { getRandomValues: (t) => globalThis.crypto.getRandomValues(t) };
  const liste = Array.from({ length: 200 }, () => nouvelIdentifiant(sansRandomUUID));
  for (const id of liste) assert.match(id, motif);
  assert.equal(new Set(liste).size, 200);
});
