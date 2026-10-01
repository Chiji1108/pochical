import { defineConfig } from "drizzle-kit";

// Only generates migrations; wrangler applies them
// (`wrangler d1 migrations apply pochical`).
export default defineConfig({
  dialect: "sqlite",
  out: "./migrations",
  schema: "./src/db/schema.ts",
});
