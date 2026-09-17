// Lint de Nexora Auto — périmètre limité à l'espace Auto (le reste du dépôt
// n'a pas encore de configuration ESLint : `npm run lint` n'est pas concerné).
//
//   npm run lint:auto
//
// Règles : ESLint recommandé, TypeScript (fichiers .ts/.tsx), React, Hooks
// React (dont le compilateur React), Next.js. Exceptions : voir la section
// « Lint » de docs/architecture/nexora-auto-suivi.md ; chacune est écrite à
// l'endroit du code avec sa raison (`eslint-disable-next-line … -- raison`).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

export const PERIMETRE_AUTO = [
  "components/auto/**/*.{js,jsx}",
  "lib/auto/**/*.{js,jsx,mjs}",
  "app/auto/**/*.{ts,tsx}",
  "app/api/auto/**/*.{ts,tsx}",
  "scripts/recette/factures/**/*.mjs",
  "scripts/recette/{acces-croises,audit-ecrans,audit-texte-agrandi,beta,compte-auto,stockage-auto,telephone}.mjs",
];

export default [
  { files: PERIMETRE_AUTO, ...js.configs.recommended },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["app/auto/**/*.{ts,tsx}", "app/api/auto/**/*.{ts,tsx}"] })),
  {
    files: PERIMETRE_AUTO,
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks, "@next/next": next },
    settings: { react: { version: "19" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];
