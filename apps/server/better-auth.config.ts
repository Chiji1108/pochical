// For the better-auth CLI only (`mise run auth:schema`): the same options
// as the server, on a stand-in database, so the CLI can read the tables
// better-auth and its plugins need.
import { createAuth } from "./src/auth";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the CLI reads the options and never queries
export const auth = createAuth({} as D1Database, {
  appleAppId: "app.pochical",
  baseURL: "https://api.pochical.app",
  secret: "cli-only",
});
