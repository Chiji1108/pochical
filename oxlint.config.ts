import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

import { ignorePatterns } from "./lint-ignores.ts";

export default defineConfig({
  extends: [core, react, vitest],
  ignorePatterns,
  options: { typeAware: true },
  rules: {
    // Match the existing codebase, which declares object shapes with `type`.
    "typescript/consistent-type-definitions": ["error", "type"],
    // Components and helpers are hoisted function declarations placed below
    // their callers; converting them to arrow constants would break hoisting.
    "func-style": "off",
    "react/function-component-definition": "off",
    "no-use-before-define": ["error", { functions: false }],
    // Autofixes that change meaning: TypeScript requires the explicit
    // `undefined` in calls like useRef<T>(undefined), and the assertion check
    // misses literal widening inside .map() callbacks.
    "unicorn/no-useless-undefined": "off",
    "typescript/no-unnecessary-type-assertion": "off",
  },
  overrides: [
    {
      files: ["apps/server/**"],
      globals: { WebSocketPair: "readonly" },
    },
  ],
});
