import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { anonymous, bearer } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { account, session, user, verification } from "./db/auth-schema";
import { SignInProvider } from "./gen/pochical/v1/user_pb";
import { linkedProvider } from "./sign-in-providers";
import { isSuspended } from "./suspension";

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
  // The Google OAuth clients whose ID tokens are taken: the Web client,
  // which the apps ask Google's tokens for (serverClientID), and the iOS
  // client.
  googleClientIds: string[];
  // Told when a session ends (signing out, or the user's sessions going
  // with their account), to close what was let in with it.
  onSessionEnd?: (ended: { id: string; userId: string }) => Promise<void>;
};

/** The code better-auth answers a suspended user's sign-in with (403). */
export const USER_SUSPENDED = "USER_SUSPENDED";

/** The code linking a user linked already is answered with (400). */
export const ALREADY_LINKED = "ALREADY_LINKED";

/**
 * Refuses a provider's ID token sent without the nonce the app asked
 * with: better-auth checks the nonce only when one is sent, and the nonce
 * is what keeps a token taken from elsewhere from being sent again.
 */
// oxlint-disable-next-line require-await -- better-auth's hooks return a promise
const requireNonce = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/link-social" && ctx.path !== "/sign-in/social") {
    return;
  }
  const body: unknown = ctx.body;
  const idToken =
    typeof body === "object" && body !== null && "idToken" in body
      ? body.idToken
      : undefined;
  const nonce =
    typeof idToken === "object" && idToken !== null && "nonce" in idToken
      ? idToken.nonce
      : undefined;
  if (idToken !== undefined && (typeof nonce !== "string" || nonce === "")) {
    throw new APIError("BAD_REQUEST", {
      code: "NONCE_REQUIRED",
      message: "An ID token comes with its nonce",
    });
  }
});

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
  { appleAppId, baseURL, googleClientIds, onSessionEnd, secret }: AuthConfig
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
          // One provider a user (spec/sync-protocol.md, Signing in): one
          // linked already links no other, by /link-social or TakeAccount.
          before: async (created) => {
            const linked = await linkedProvider(d1, created.userId);
            if (linked !== SignInProvider.UNSPECIFIED) {
              throw new APIError("BAD_REQUEST", {
                code: ALREADY_LINKED,
                message: "The user is linked already",
              });
            }
            return { data: withoutTokens(created) };
          },
        },
        update: {
          // oxlint-disable-next-line require-await -- better-auth's hooks return a promise
          before: async (updated) => ({ data: withoutTokens(updated) }),
        },
      },
      session: {
        create: {
          // A suspended user signs in nowhere (spec/admin.md, ユーザー):
          // with Apple or Google, or by switching to their account, they are
          // refused with USER_SUSPENDED, which the apps say as such.
          before: async (created) => {
            if (await isSuspended(d1, created.userId)) {
              throw new APIError("FORBIDDEN", {
                code: USER_SUSPENDED,
                message: "This account is suspended",
              });
            }
            return {
              data: {
                ...created,
                expiresAt: neverExpires(),
                ipAddress: null,
                userAgent: null,
              },
            };
          },
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
    hooks: { before: requireNonce },
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
    // The apps sign in with Apple and Google by their ID tokens alone,
    // never through a redirect, so neither takes a client secret. Apple's
    // are checked against the iOS app's bundle id, Google's against the
    // OAuth clients' ids (its audience).
    socialProviders: {
      apple: {
        appBundleIdentifier: appleAppId,
        clientId: appleAppId,
        clientSecret: "",
      },
      google: { clientId: googleClientIds },
    },
    // When Pochical's people suspended the user (spec/admin.md, ユーザー);
    // null while they are not. Set on the admin site alone, never by a
    // sign-in or an update the apps send.
    user: {
      additionalFields: {
        suspendedAt: { input: false, required: false, type: "date" },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
