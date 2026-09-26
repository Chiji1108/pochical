import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

import { ignorePatterns } from "./lint-ignores.ts";

export default defineConfig({
  extends: [core, react, vitest],
  ignorePatterns,
  options: { typeAware: true },
  overrides: [
    {
      files: ["apps/server/**"],
      globals: { WebSocketPair: "readonly" },
      rules: {
        // The runtime calls these Durable Object handlers on the instance.
        "class-methods-use-this": [
          "error",
          {
            exceptMethods: [
              "alarm",
              "fetch",
              "webSocketClose",
              "webSocketError",
              "webSocketMessage",
            ],
          },
        ],
      },
    },
  ],
  rules: {
    // switch-exhaustiveness-check already covers union switches, and a
    // default case would hide newly added union members from it.
    "default-case": "off",
    // Components and helpers are hoisted function declarations placed below
    // their callers; converting them to arrow constants would break hoisting.
    "func-style": "off",
    "no-use-before-define": ["error", { functions: false }],
    "react/function-component-definition": "off",
    // Match the existing codebase, which declares object shapes with `type`.
    "typescript/consistent-type-definitions": ["error", "type"],
    // Autofixes that change meaning: the assertion check misses literal
    // widening inside .map() callbacks, and TypeScript requires the explicit
    // `undefined` in calls like useRef<T>(undefined).
    "typescript/no-unnecessary-type-assertion": "off",
    "unicorn/no-useless-undefined": "off",
  },
});
