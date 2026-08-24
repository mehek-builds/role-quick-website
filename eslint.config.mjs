import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This handwritten WebGL engine is JavaScript by design. TypeScript checks the import sites,
    // while the file keeps its explicit @ts-nocheck boundary until it is migrated independently.
    files: ["components/cinema/paperRollEngine.js"],
    rules: { "@typescript-eslint/ban-ts-comment": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Checked-in third-party PDF.js worker bundle. Its minified source is not first-party lint scope.
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
