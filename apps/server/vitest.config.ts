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
          // A key of the kind Apple gives, for signing what tests send.
          APNS_KEY: generateKeyPairSync("ec", {
            namedCurve: "P-256",
          }).privateKey.export({ format: "pem", type: "pkcs8" }),
          // A key of the kind Apple gives for Sign in with Apple.
          APPLE_SIGNIN_KEY: generateKeyPairSync("ec", {
            namedCurve: "P-256",
          }).privateKey.export({ format: "pem", type: "pkcs8" }),
          APPLE_SIGNIN_KEY_ID: "SIWATEST01",
          BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
          BETTER_AUTH_URL: "https://server.test",
          // Pochical's people's Slack, as tests answer for it.
          SLACK_BOT_TOKEN: "xoxb-test",
          SLACK_CHANNEL_ID: "C-SUPPORT",
          SLACK_SIGNING_SECRET: "slack-signing-secret",
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(import.meta.dirname, "migrations")
          ),
        },
        // Tests never reach the internet: what a test does not answer with
        // its own vi.spyOn(globalThis, "fetch") is answered here. Slack
        // takes each call and gives back nothing to keep; any other host
        // is not there.
        outboundService: (request) =>
          new URL(request.url).host === "slack.com"
            ? Response.json({ ok: true })
            : new Response(null, { status: 503 }),
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
