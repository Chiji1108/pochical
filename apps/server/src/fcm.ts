// Notifications sent to the user's Android phones through Firebase Cloud
// Messaging's HTTP v1 API. It takes an OAuth 2 access token, which Google
// gives for a JWT signed with the Firebase project's service account key
// (RS256): the service account's JSON is the FCM_SERVICE_ACCOUNT secret.

import { fitted } from "./alert-size";
import { signJwt } from "./jwt";
import type { Alert, Outcome, Push, Recipient } from "./push";
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

/** An access token as this isolate keeps it, for the key it was given for. */
type Granted = { keyId: string; token: Promise<string>; until: number };

/**
 * The access token this isolate was given last, used until just before it
 * expires. The asking is kept as it starts, so pushes sent at once share
 * one token; its end is known once Google answers.
 */
let granted: Granted | undefined;

/** How long Google's OAuth may take to answer before the push fails. */
const GRANT_TIMEOUT_MS = 10 * 1000;

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
  // Bounded, as every push of the isolate waits on the one asking.
  const response = await fetch(account.token_uri, {
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    method: "POST",
    signal: AbortSignal.timeout(GRANT_TIMEOUT_MS),
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
const grantFor = (account: ServiceAccount): Granted => {
  const keyId = account.private_key_id;
  if (granted?.keyId === keyId && Date.now() < granted.until) {
    return granted;
  }
  const kept: Granted = {
    keyId,
    token: Promise.resolve(""),
    // Not known until Google answers: pushes meanwhile wait for it.
    until: Number.POSITIVE_INFINITY,
  };
  const ask = async (): Promise<string> => {
    try {
      const { expiresIn, token } = await grant(account);
      kept.until = Date.now() + expiresIn * 1000 - EARLY_MS;
      return token;
    } catch (error) {
      // A token Google did not give is asked for again by the next push.
      if (granted === kept) {
        granted = undefined;
      }
      throw error;
    }
  };
  kept.token = ask();
  granted = kept;
  return kept;
};

/** The data of an alert's message, its words cut to the size FCM takes. */
const alertData = (alert: Alert, recipient: Recipient): { alert: string } => {
  const data = (each: Alert) => ({
    alert: JSON.stringify({ ...each, ...recipient }),
  });
  // FCM counts the data's keys and values.
  const size = (each: Alert): string => {
    const { alert: value } = data(each);
    return `alert${value}`;
  };
  return data(fitted(alert, size));
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
        ? alertData(push.alert, push.recipient)
        : { withdraw: JSON.stringify(push.withdrawal) },
    token,
  },
});

/** What FCM's refusal says: its error code, and the fields it found wrong. */
type Refusal = { reason: string; fields: string[] };

/**
 * FCM's refusal from its JSON body: the error code of its FcmError, else
 * its status, else the body; and the fields its BadRequest names.
 */
const refusalOf = (body: string): Refusal => {
  try {
    const parsed: unknown = JSON.parse(body);
    const error = isRecord(parsed) ? parsed.error : undefined;
    if (isRecord(error)) {
      const details: unknown[] = Array.isArray(error.details)
        ? error.details
        : [];
      const code = details.find(
        (detail) => isRecord(detail) && typeof detail.errorCode === "string"
      );
      const fields = details.flatMap((detail) =>
        isRecord(detail) && Array.isArray(detail.fieldViolations)
          ? detail.fieldViolations.flatMap((violation: unknown) =>
              isRecord(violation) && typeof violation.field === "string"
                ? [violation.field]
                : []
            )
          : []
      );
      if (isRecord(code) && typeof code.errorCode === "string") {
        return { fields, reason: code.errorCode };
      }
      if (typeof error.status === "string") {
        return { fields, reason: error.status };
      }
    }
  } catch {
    // Not FCM's JSON: the body is all there is to say.
  }
  return { fields: [], reason: body };
};

/**
 * Whether FCM's refusal is of the token, no longer the app's: unregistered,
 * of another Firebase project (SENDER_ID_MISMATCH, as APNs'
 * DeviceTokenNotForTopic), or not a token, INVALID_ARGUMENT naming the
 * token as the field. INVALID_ARGUMENT naming any other field, or none, is
 * of the message, and keeps the token.
 */
const isGone = ({ fields, reason }: Refusal): boolean =>
  reason === "UNREGISTERED" ||
  reason === "SENDER_ID_MISMATCH" ||
  (reason === "INVALID_ARGUMENT" && fields.includes("message.token"));

/**
 * Posts `push` to an Android phone, "gone" when FCM says the token is no
 * longer the app's, so it is dropped. An access token FCM no longer takes
 * (401) is asked for again by the next push.
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
  const using = grantFor(account);
  const authorization = `Bearer ${await using.token}`;
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
  // Only the token refused: one asked for since stays.
  if (status === 401 && granted === using) {
    granted = undefined;
  }
  const refusal = refusalOf(await response.text());
  return {
    reason: refusal.reason,
    sent: isGone(refusal) ? "gone" : "failed",
    status,
  };
};
