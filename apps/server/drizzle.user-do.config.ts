import { defineConfig } from "drizzle-kit";

// The User DO's own SQLite. The migrations are bundled into the Worker
// and applied by each User DO as it starts (src/user-do.ts).
export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  out: "./src/user-do-migrations",
  schema: "./src/user-do-schema.ts",
});
