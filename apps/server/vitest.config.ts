import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // test/setup.ts applies these to the test database.
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "migrations")
          ),
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
