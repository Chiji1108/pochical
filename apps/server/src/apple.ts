// Sign in with Apple's tokens revoked as an account is deleted, as Apple
// asks apps that offer it (spec/sync-protocol.md, Deleting an account).
// The server keeps none of Apple's tokens, so the app asks Apple for a
// fresh authorization code just before; it is exchanged for the app's
// refresh token, which is revoked. Both calls are signed with a client
// secret: a JWT from the Sign in with Apple key (APPLE_SIGNIN_KEY), for
// the app's bundle id, from the team (APNS_TEAM_ID, the team's one id).

import { signES256 } from "./es256";

const APPLE = "https://appleid.apple.com";

/** How long a client secret is good for: one deletion's two calls. */
const SECRET_SECONDS = 300;

/** What revoking came to. */
export type Revoked = "revoked" | "refused" | "unset";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Apple's form-encoded call, answered in JSON. */
const callApple = async (
  path: string,
  form: Record<string, string>
): Promise<{ ok: boolean; body: unknown }> => {
  const response = await fetch(`${APPLE}${path}`, {
    body: new URLSearchParams(form),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json().catch(() => null);
  return { body, ok: response.ok };
};

/** Who an ID token is of: its `sub`. */
const subjectOf = (idToken: unknown): unknown => {
  const [, body] = typeof idToken === "string" ? idToken.split(".") : [];
  if (body === undefined) {
    return undefined;
  }
  try {
    const claims: unknown = JSON.parse(
      atob(body.replaceAll("-", "+").replaceAll("_", "/"))
    );
    return isRecord(claims) ? claims.sub : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Revokes the app's Apple tokens for the person, from `code`, which must
 * be of the Apple account linked (`subject`): "refused" when Apple takes
 * neither the code nor the token, or the code is another account's;
 * "unset" when this server has no Sign in with Apple key, as a local one
 * may not.
 */
export const revokeApple = async (
  env: Env,
  code: string,
  subject: string
): Promise<Revoked> => {
  const key: string | undefined = env.APPLE_SIGNIN_KEY;
  const keyId: string | undefined = env.APPLE_SIGNIN_KEY_ID;
  if (key === undefined || key === "" || keyId === undefined || keyId === "") {
    return "unset";
  }
  const now = Math.floor(Date.now() / 1000);
  const app = {
    client_id: env.APPLE_APP_ID,
    client_secret: await signES256(key, keyId, {
      aud: APPLE,
      exp: now + SECRET_SECONDS,
      iat: now,
      iss: env.APNS_TEAM_ID,
      sub: env.APPLE_APP_ID,
    }),
  };
  const exchanged = await callApple("/auth/token", {
    ...app,
    code,
    grant_type: "authorization_code",
  });
  const { body } = exchanged;
  const refresh = isRecord(body) ? body.refresh_token : undefined;
  const access = isRecord(body) ? body.access_token : undefined;
  const [hint, token] =
    typeof refresh === "string"
      ? ["refresh_token", refresh]
      : ["access_token", access];
  // Apple answers straight, so its ID token needs no check of its own.
  const sameAccount = isRecord(body) && subjectOf(body.id_token) === subject;
  if (!exchanged.ok || typeof token !== "string" || !sameAccount) {
    return "refused";
  }
  const revoked = await callApple("/auth/revoke", {
    ...app,
    token,
    token_type_hint: hint,
  });
  return revoked.ok ? "revoked" : "refused";
};
