import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, bearer } from "better-auth/plugins";
import { eq } from "drizzle-orm";
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

type AuthConfig = {
  // Where the apps reach the server; better-auth builds its URLs from it.
  baseURL: string;
  secret: string;
  // The iOS app's bundle id, which Sign in with Apple's ID tokens are for.
  appleAppId: string;
  // Told when a session ends (signing out, or the user's sessions going
  // with their account), to close what was let in with it.
  onSessionEnd?: (ended: { id: string; userId: string }) => Promise<void>;
};

/**
 * A provider's account as kept: which account of which provider is the
 * user's, and none of its tokens (the ID token carries the person's
 * email), as a session keeps no address.
 */
const withoutTokens = <Row extends object>(row: Row) => ({
  ...row,
  accessToken: null,
  accessTokenExpiresAt: null,
  idToken: null,
  refreshToken: null,
  refreshTokenExpiresAt: null,
});

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
export const createAuth = (
  d1: D1Database,
  { appleAppId, baseURL, onSessionEnd, secret }: AuthConfig
) =>
  betterAuth({
    // Linking Apple or Google keeps the anonymous user, whose email is the
    // anonymous plugin's placeholder, so the provider's never matches it
    // (spec/sync-protocol.md, Signing in).
    account: { accountLinking: { allowDifferentEmails: true } },
    advanced: { ipAddress: { disableIpTracking: true } },
    basePath: "/api/auth",
    baseURL,
    database: drizzleAdapter(drizzle(d1), {
      provider: "sqlite",
      schema: { account, session, user, verification },
    }),
    databaseHooks: {
      account: {
        create: {
          // Linked to Apple or Google, the user is anonymous no more, which
          // better-auth leaves set: still marked, they could be deleted
          // without signing in again (spec/sync-protocol.md, Signing in).
          after: async (created) => {
            await drizzle(d1)
              .update(user)
              .set({ isAnonymous: false })
              .where(eq(user.id, created.userId))
              .run();
          },
          // oxlint-disable-next-line require-await -- better-auth's hooks return a promise
          before: async (created) => ({ data: withoutTokens(created) }),
        },
        update: {
          // oxlint-disable-next-line require-await -- as above
          before: async (updated) => ({ data: withoutTokens(updated) }),
        },
      },
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
        delete: {
          after: async (ended) => {
            try {
              await onSessionEnd?.(ended);
            } catch (error) {
              // Signing out still succeeds; the sockets are refused at
              // their next connect.
              console.error("Closing an ended session's sockets failed", error);
            }
          },
        },
      },
    },
    // An anonymous user is deleted only through DeleteAccount, which takes
    // everything of them with them, never by better-auth alone, which
    // would leave their groups and chats behind (spec/sync-protocol.md,
    // Deleting an account).
    plugins: [anonymous({ disableDeleteAnonymousUser: true }), bearer()],
    rateLimit: { enabled: false },
    secret,
    session: {
      disableSessionRefresh: true,
      expiresIn: COOKIE_SECONDS_MOST,
    },
    // Sign in with Apple in the iOS app: its ID token is checked against
    // the app's bundle id; nothing needs Apple's client secret.
    socialProviders: {
      apple: {
        appBundleIdentifier: appleAppId,
        clientId: appleAppId,
        clientSecret: "",
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
