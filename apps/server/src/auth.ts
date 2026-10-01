import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";

import { account, session, user, verification } from "./db/auth-schema";

export type AuthConfig = {
  // Where the apps reach the server; better-auth builds its URLs from it.
  baseURL: string;
  secret: string;
};

/**
 * better-auth on the D1 database, at /api/auth. The apps sign in
 * anonymously and later link Apple or Google; they keep the session token
 * the bearer plugin hands back (set-auth-token) and send it as
 * `Authorization: Bearer …` to Connect calls and sockets.
 */
export const createAuth = (d1: D1Database, { baseURL, secret }: AuthConfig) =>
  betterAuth({
    basePath: "/api/auth",
    baseURL,
    database: drizzleAdapter(drizzle(d1), {
      provider: "sqlite",
      schema: { account, session, user, verification },
    }),
    plugins: [anonymous(), bearer()],
    secret,
  });

export type Auth = ReturnType<typeof createAuth>;
