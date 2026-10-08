import { generateKeyPairSync } from "node:crypto";
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
          // The admin pages let in a local server's requests, as tests are.
          ADMIN_LOCAL: "1",
          // A key of the kind Apple gives, for signing what tests send.
          APNS_KEY: generateKeyPairSync("ec", {
            namedCurve: "P-256",
          }).privateKey.export({ format: "pem", type: "pkcs8" }),
          BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
          BETTER_AUTH_URL: "https://server.test",
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
