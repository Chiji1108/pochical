import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

import { ignorePatterns } from "./lint-ignores.ts";

export default defineConfig({
  extends: [core, react],
  ignorePatterns,
  options: { typeAware: true },
  overrides: [
    // apps/web tests run on bun:test, so Vitest rules apply to the server only.
    ...(vitest.overrides ?? []).map((override) => ({
      ...override,
      files: ["apps/server/test/**/*.test.ts"],
    })),
    {
      // Existing findings in apps/web, downgraded until the /design prototype
      // settles. Fix a rule's findings, then delete it from this list.
      files: ["apps/web/**"],
      rules: {
        complexity: "warn",
        "import/newline-after-import": "warn",
        "import/no-cycle": "warn",
        "jsx-a11y/prefer-tag-over-role": "warn",
        "no-await-in-loop": "warn",
        "no-unexpected-multiline": "warn",
        "no-unused-expressions": "warn",
        "no-use-before-define": "warn",
        "no-useless-return": "warn",
        "promise/prefer-await-to-then": "warn",
        "react/hook-use-state": "warn",
        "react/jsx-no-useless-fragment": "warn",
        "react/no-unescaped-entities": "warn",
        "react/refs": "warn",
        "react/set-state-in-effect": "warn",
        "react/style-prop-object": "warn",
        "react/todo": "warn",
        "require-await": "warn",
        "require-unicode-regexp": "warn",
        "sort-keys": "warn",
        "typescript/consistent-return": "warn",
        "typescript/no-confusing-void-expression": "warn",
        "typescript/no-misused-spread": "warn",
        "typescript/no-non-null-assertion": "warn",
        "typescript/no-unsafe-argument": "warn",
        "typescript/no-unsafe-assignment": "warn",
        "typescript/no-unsafe-call": "warn",
        "typescript/no-unsafe-type-assertion": "warn",
        "typescript/prefer-nullish-coalescing": "warn",
        "typescript/strict-boolean-expressions": "warn",
        "typescript/strict-void-return": "warn",
        "unicorn/consistent-function-scoping": "warn",
        "unicorn/no-array-reverse": "warn",
        "unicorn/no-array-sort": "warn",
        "unicorn/prefer-query-selector": "warn",
        "unicorn/prefer-response-static-json": "warn",
      },
    },
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
