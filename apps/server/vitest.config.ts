import { generateKeyPairSync } from "node:crypto";
import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const appleKey = () =>
  generateKeyPairSync("ec", {
    namedCurve: "P-256",
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  }).privateKey;

// A key of the kind a Google service account has, and its public half, for
// tests to check what is signed with it.
const googleKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // test/setup.ts applies these to the test database.
      miniflare: {
        bindings: {
          // A key of the kind Apple gives, for signing what tests send.
          APNS_KEY: appleKey(),
          // A key of the kind Apple gives for Sign in with Apple.
          APPLE_SIGNIN_KEY: appleKey(),
          APPLE_SIGNIN_KEY_ID: "SIWATEST01",
          BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
          BETTER_AUTH_URL: "https://server.test",
          // A Firebase project's service account, as its JSON key holds it.
          FCM_SERVICE_ACCOUNT: JSON.stringify({
            client_email: "fcm@pochical-test.iam.gserviceaccount.com",
            private_key: googleKeys.privateKey,
            private_key_id: "fcm-test-key",
            project_id: "pochical-test",
            token_uri: "https://oauth2.googleapis.com/token",
            type: "service_account",
          }),
          FCM_TEST_PUBLIC_KEY: googleKeys.publicKey,
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
        // takes each call, every message posted at one time; any other
        // host is not there.
        outboundService: (request) =>
          new URL(request.url).host === "slack.com"
            ? Response.json({ ok: true, ts: "1700000000.000000" })
            : new Response(null, { status: 503 }),
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: {
    globalSetup: ["./vitest.stalls.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
