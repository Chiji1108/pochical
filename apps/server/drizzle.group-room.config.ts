import { defineConfig } from "drizzle-kit";

// The Group DO's own SQLite. The migrations are bundled into the Worker
// and applied by each Group DO as it starts (src/group-room.ts).
export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  out: "./src/group-room-migrations",
  schema: "./src/group-room-schema.ts",
});
