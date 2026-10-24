// Notifications sent to the user's Android phones through Firebase Cloud
// Messaging's HTTP v1 API. It takes an OAuth 2 access token, which Google
// gives for a JWT signed with the Firebase project's service account key
// (RS256): the service account's JSON is the FCM_SERVICE_ACCOUNT secret.

import { signJwt } from "./jwt";
import type { Outcome, Push } from "./push";
import type { Device } from "./push-tokens";

/** What the access token may do: send through FCM, nothing else. */
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** How long the signed JWT asks the token for, the most Google gives. */
const GRANT_SECONDS = 3600;

/**
 * How long before Google's access token expires it is no longer used: a
 * push sent with it just before must still reach FCM in its time.
 */
const EARLY_MS = 60 * 1000;

/** The fields of a service account's JSON key that sending reads. */
type ServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id: string;
  project_id: string;
  token_uri: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAccount = (value: unknown): value is ServiceAccount =>
  isRecord(value) &&
  (
    [
      "client_email",
      "private_key",
      "private_key_id",
      "project_id",
      "token_uri",
    ] as const
  ).every((field) => typeof value[field] === "string" && value[field] !== "");

/** The service account the secret holds, or why there is none. */
const accountOf = (secret: string | undefined): ServiceAccount | string => {
  if (secret === undefined || secret === "") {
    return "no FCM_SERVICE_ACCOUNT";
  }
  try {
    const parsed: unknown = JSON.parse(secret);
    if (isAccount(parsed)) {
      return parsed;
    }
  } catch {
    // Not JSON: not a service account's key either.
  }
  return "FCM_SERVICE_ACCOUNT is not a service account's key";
};

/**
 * The access token this isolate was given last, for the key it was given
 * for, used until just before it expires. The asking is kept as it
 * starts, so pushes sent at once share one token; its end is known once
 * Google answers.
 */
let granted:
  | { keyId: string; token: Promise<string>; until: number }
  | undefined;

/** Asks Google for an access token for a JWT the service account signed. */
const grant = async (
  account: ServiceAccount
): Promise<{ token: string; expiresIn: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    "RS256",
    account.private_key,
    account.private_key_id,
    {
      aud: account.token_uri,
      exp: now + GRANT_SECONDS,
      iat: now,
      iss: account.client_email,
      scope: SCOPE,
    }
  );
  const response = await fetch(account.token_uri, {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    method: "POST",
  });
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !isRecord(body) ||
    typeof body.access_token !== "string" ||
    typeof body.expires_in !== "number"
  ) {
    throw new Error(
      `Google's OAuth answered ${response.status}: ${JSON.stringify(body)}`
    );
  }
  return { expiresIn: body.expires_in, token: body.access_token };
};

/** The access token FCM takes, asked for now or kept from before. */
const accessToken = async (account: ServiceAccount): Promise<string> => {
  const keyId = account.private_key_id;
  if (granted?.keyId === keyId && Date.now() < granted.until) {
    return await granted.token;
  }
  const kept = {
    keyId,
    token: Promise.resolve(""),
    // Not known until Google answers: pushes meanwhile wait for it.
    until: Number.POSITIVE_INFINITY,
  };
  const ask = async (): Promise<string> => {
    const { expiresIn, token } = await grant(account);
    kept.until = Date.now() + expiresIn * 1000 - EARLY_MS;
    return token;
  };
  kept.token = ask();
  granted = kept;
  try {
    return await kept.token;
  } catch (error) {
    // A token Google did not give is asked for again by the next push.
    if (granted === kept) {
      granted = undefined;
    }
    throw error;
  }
};

/**
 * The FCM message: data alone, which the app words and shows itself, as
 * iOS's Notification Service Extension does, so it can show nothing for
 * anyone but the user signed in. A notification goes at high priority, to
 * be shown at once; a withdrawal, which shows nothing, at normal.
 */
const messageOf = (token: string, push: Push): unknown => ({
  message: {
    android: { priority: push.kind === "alert" ? "HIGH" : "NORMAL" },
    data:
      push.kind === "alert"
        ? { alert: JSON.stringify({ ...push.alert, ...push.recipient }) }
        : { withdraw: JSON.stringify(push.withdrawal) },
    token,
  },
});

/** FCM's error code from a refusal's JSON body, else its status, else the body. */
const reasonOf = (body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    const error = isRecord(parsed) ? parsed.error : undefined;
    if (isRecord(error)) {
      const details = Array.isArray(error.details) ? error.details : [];
      for (const detail of details) {
        if (isRecord(detail) && typeof detail.errorCode === "string") {
          return detail.errorCode;
        }
      }
      if (typeof error.status === "string") {
        return error.status;
      }
    }
  } catch {
    // Not FCM's JSON: the body is all there is to say.
  }
  return body;
};

/**
 * Posts `push` to an Android phone. "gone" when FCM says the token is no
 * longer the app's (UNREGISTERED) or not a token (INVALID_ARGUMENT), so it
 * is dropped. A token Google no longer takes (401) is asked for again by
 * the next push.
 */
export const attemptFcm = async (
  env: Env,
  { token }: Extract<Device, { platform: "fcm" }>,
  push: Push
): Promise<Outcome> => {
  const account = accountOf(env.FCM_SERVICE_ACCOUNT);
  if (typeof account === "string") {
    return { reason: account, sent: "failed", status: 0 };
  }
  const authorization = `Bearer ${await accessToken(account)}`;
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      body: JSON.stringify(messageOf(token, push)),
      headers: { authorization, "content-type": "application/json" },
      method: "POST",
    }
  );
  const { status } = response;
  if (response.ok) {
    return { reason: "", sent: "sent", status };
  }
  if (status === 401 && granted?.keyId === account.private_key_id) {
    granted = undefined;
  }
  const reason = reasonOf(await response.text());
  const gone = reason === "UNREGISTERED" || reason === "INVALID_ARGUMENT";
  return { reason, sent: gone ? "gone" : "failed", status };
};
