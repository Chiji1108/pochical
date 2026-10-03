import { Code, ConnectError } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import { createAuth } from "./auth";
import type { Auth } from "./auth";

/** The signed-in user a request's session token belongs to. */
export type SessionUser = { id: string; anonymous: boolean; sessionId: string };

let auth: Auth | undefined;

/** better-auth for this Worker's D1, made on first use. */
export const getAuth = (): Auth => {
  auth ??= createAuth(env.DB, {
    baseURL: env.BETTER_AUTH_URL,
    // Its sockets close on the user's DO and their groups'.
    onSessionEnd: async ({ id, userId }) => {
      await env.USERS.getByName(userId).endSession(id);
    },
    secret: env.BETTER_AUTH_SECRET,
  });
  return auth;
};

/**
 * The user behind `Authorization: Bearer <token>`, or null without a valid
 * session. The bearer plugin reads the header, so the apps need no
 * cookies.
 */
export const sessionUser = async (
  headers: Headers
): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers });
  if (!session) {
    return null;
  }
  return {
    anonymous: session.user.isAnonymous === true,
    id: session.user.id,
    sessionId: session.session.id,
  };
};

/** The caller's user, or UNAUTHENTICATED for a missing or stale token. */
export const requireUser = async (
  context: HandlerContext
): Promise<SessionUser> => {
  const user = await sessionUser(context.requestHeader);
  if (!user) {
    throw new ConnectError("Sign in first", Code.Unauthenticated);
  }
  return user;
};
