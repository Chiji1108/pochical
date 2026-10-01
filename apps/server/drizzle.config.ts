import { defineConfig } from "drizzle-kit";

// Only generates migrations; wrangler applies them
// (`wrangler d1 migrations apply pochical`).
export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  // auth-schema.ts is better-auth's, written by `mise run auth:schema`.
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
});
