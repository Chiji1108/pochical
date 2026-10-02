import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, bearer } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";

import { account, session, user, verification } from "./db/auth-schema";

// A session lasts for good: an anonymous user's token is their only key,
// so an expiry would only lock out someone who did not open the app for a
// while. It ends when they sign out or delete their account
// (spec/sync-protocol.md, Signing in). better-auth also sets the token as
// a cookie, which may last at most 400 days, from `expiresIn`; so that is
// 400 days, and each session is stored to expire a century on and never
// refreshed, which would cut it back to 400 days.
const COOKIE_SECONDS_MOST = 400 * 24 * 60 * 60;
const SESSION_YEARS = 100;

const neverExpires = (): Date => {
  const at = new Date();
  at.setUTCFullYear(at.getUTCFullYear() + SESSION_YEARS);
  return at;
};

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
 *
 * Pochical keeps no one's address or device: a session is its token and
 * its user, without the IP address and user agent better-auth would note,
 * and sign-ins are held back by Cloudflare's rate limiting (src/index.ts)
 * rather than better-auth's, which would key on the address it keeps.
 */
export const createAuth = (d1: D1Database, { baseURL, secret }: AuthConfig) =>
  betterAuth({
    advanced: { ipAddress: { disableIpTracking: true } },
    basePath: "/api/auth",
    baseURL,
    database: drizzleAdapter(drizzle(d1), {
      provider: "sqlite",
      schema: { account, session, user, verification },
    }),
    databaseHooks: {
      session: {
        create: {
          // oxlint-disable-next-line require-await -- better-auth's hooks return a promise
          before: async (created) => ({
            data: {
              ...created,
              expiresAt: neverExpires(),
              ipAddress: null,
              userAgent: null,
            },
          }),
        },
      },
    },
    plugins: [anonymous(), bearer()],
    rateLimit: { enabled: false },
    secret,
    session: {
      disableSessionRefresh: true,
      expiresIn: COOKIE_SECONDS_MOST,
    },
  });

export type Auth = ReturnType<typeof createAuth>;
