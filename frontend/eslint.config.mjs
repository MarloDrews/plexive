import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated design-sync output. Both are gitignored (frontend/.gitignore), so a CI checkout
    // never contains them, but ESLint does not read .gitignore and walks them here. Without these
    // two lines the same command answers 102 errors / 1249 warnings locally and 88 / 13 in CI, and
    // 1215 of that difference is one vendored react.js. The gate's number has to be reproducible
    // on this machine, so the ignore lives here rather than in the workflow.
    "ds-bundle/**",
    ".ds-sync/**",
  ]),
]);

export default eslintConfig;
