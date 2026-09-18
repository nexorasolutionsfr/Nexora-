// Embarque lib/auto/rappels.js — et tout ce qu'il importe — dans UN script
// autonome, pour le nœud Code du workflow « Rappels Nexora Auto ».
//
// Pourquoi : l'échéance du contrôle technique suit des règles qui vivent dans
// lib/auto/echeances.js et components/auto/aPrevoir.js, que l'écran affiche.
// Les recopier dans n8n (ou en SQL) ferait deux vérités qui divergeraient.
// Ici, le même code est repris à l'identique à chaque construction ; le test
// embarquer.test.js vérifie que le script embarqué rend exactement ce que rend
// le module importé.
//
// Chaque module garde sa propre portée (une fonction par module) : deux
// fonctions internes de même nom dans deux fichiers ne se marchent pas dessus.
// Seules les formes d'import et d'export du dépôt sont acceptées ; toute autre
// forme arrête la construction au lieu de produire un script faux.
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = resolve(ICI, "..", "..");
export const ENTREE = resolve(RACINE, "lib", "auto", "rappels.js");

const IMPORT = /^import \{([^}]+)\} from "([^"]+)";$/;
const EXPORT = /^export (async function|function|const|let|class) ([A-Za-z_$][\w$]*)/;

const PRELUDE = [
  "// ---- Modules embarqués depuis le dépôt Nexora (n8n/rappels-auto/embarquer.mjs). Ne pas modifier ici. ----",
  "const __fabriques = {};",
  "const __caches = {};",
  "function __definir(cle, fabrique) { __fabriques[cle] = fabrique; }",
  "function __module(cle) {",
  "  if (!(cle in __caches)) {",
  "    if (!__fabriques[cle]) throw new Error('module embarqué absent : ' + cle);",
  "    __caches[cle] = __fabriques[cle]();",
  "  }",
  "  return __caches[cle];",
  "}",
].join("\n");

const cleDe = (chemin) => relative(RACINE, chemin).split("\\").join("/");

function transformer(chemin) {
  const exportes = [];
  const lignes = readFileSync(chemin, "utf8").split("\n").map((ligne, i) => {
    const ou = `${cleDe(chemin)}:${i + 1}`;
    const imp = ligne.match(IMPORT);
    if (imp) {
      const noms = imp[1].split(",").map((n) => n.trim()).filter(Boolean).map((n) => {
        const [source, alias] = n.split(/\s+as\s+/);
        return alias ? `${source}: ${alias}` : source;
      });
      return `const { ${noms.join(", ")} } = __module(${JSON.stringify(cleDe(resolve(dirname(chemin), imp[2])))});`;
    }
    if (/^\s*import[\s({]/.test(ligne) || /\bimport\(/.test(ligne) || /\brequire\(/.test(ligne)) {
      throw new Error(`forme d'import non gérée (${ou}) : ${ligne}`);
    }
    const exp = ligne.match(EXPORT);
    if (exp) {
      exportes.push(exp[2]);
      return ligne.replace(/^export /, "");
    }
    if (/^export\b/.test(ligne)) throw new Error(`forme d'export non gérée (${ou}) : ${ligne}`);
    return ligne;
  });
  return `__definir(${JSON.stringify(cleDe(chemin))}, () => {\n${lignes.join("\n")}\nreturn { ${exportes.join(", ")} };\n});`;
}

// Les modules dans l'ordre où ils sont importés (dépendances d'abord).
export function modulesDe(entree = ENTREE) {
  const ordre = [];
  const vus = new Set();
  const visiter = (chemin) => {
    if (vus.has(chemin)) return;
    vus.add(chemin);
    for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
      const imp = ligne.match(IMPORT);
      if (imp) visiter(resolve(dirname(chemin), imp[2]));
    }
    ordre.push(chemin);
  };
  visiter(entree);
  return ordre;
}

export function embarquer(entree = ENTREE) {
  return [PRELUDE, ...modulesDe(entree).map(transformer)].join("\n\n");
}
