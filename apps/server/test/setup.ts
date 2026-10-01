import { applyD1Migrations } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

// vitest.config.ts passes the migrations in as a binding. Env is declared
// by `wrangler types` as a global interface, so only merging can extend it.
declare global {
  // oxlint-disable-next-line typescript/no-namespace -- merges into wrangler's Cloudflare.Env
  namespace Cloudflare {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
