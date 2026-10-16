import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  globalIgnores([
    "**/.next/",
    "**/node_modules/",
    "**/playwright-report/",
    "**/test-results/",
  ]),
  {
    extends: [...nextCoreWebVitals],
  },
  {
    // eslint-plugin-react-hooks v7 (via eslint-config-next 16) adds React Compiler rules.
    // This app doesn't use the React Compiler and stays on React 18, so they would only
    // flag existing code (68 errors on upgrade) rather than regressions. The classic
    // rules-of-hooks and exhaustive-deps rules stay on.
    rules: {
      "react-hooks/component-hook-factories": "off",
      "react-hooks/config": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/gating": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/static-components": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/use-memo": "off",
    },
  },
]);
