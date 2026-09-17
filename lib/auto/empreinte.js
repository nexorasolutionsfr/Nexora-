// Empreinte SHA-256 d'un fichier : reconnaître une facture déjà déposée avant
// de l'envoyer de nouveau (et avant toute lecture).
//
// Le navigateur la calcule avec crypto.subtle… seulement sur une page sûre
// (https ou localhost). Sur une adresse locale en http (téléphone sur le
// Wi-Fi, pendant une recette), crypto.subtle n'existe pas : le calcul se fait
// alors ici, en JavaScript. Même résultat (sha256.test.js).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// SHA-256 en JavaScript pur (FIPS 180-4). Rend l'empreinte en hexadécimal.
export function sha256Hex(octets) {
  const donnees = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const longueur = donnees.length;
  const blocs = Math.ceil((longueur + 9) / 64);
  const message = new Uint8Array(blocs * 64);
  message.set(donnees);
  message[longueur] = 0x80;
  const vue = new DataView(message.buffer);
  vue.setUint32(message.length - 8, Math.floor((longueur * 8) / 0x100000000));
  vue.setUint32(message.length - 4, (longueur * 8) >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let bloc = 0; bloc < blocs; bloc++) {
    for (let t = 0; t < 16; t++) w[t] = vue.getUint32(bloc * 64 + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, i] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (i + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      i = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + i) >>> 0;
  }
  return Array.from(h, (mot) => mot.toString(16).padStart(8, "0")).join("");
}

export async function empreinteSha256(donnees, { subtle = globalThis.crypto?.subtle } = {}) {
  const tampon = donnees instanceof ArrayBuffer ? donnees : await donnees.arrayBuffer();
  if (subtle) {
    const condensat = await subtle.digest("SHA-256", tampon);
    return Array.from(new Uint8Array(condensat), (o) => o.toString(16).padStart(2, "0")).join("");
  }
  return sha256Hex(new Uint8Array(tampon));
}
