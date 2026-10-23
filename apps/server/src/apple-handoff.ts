// Sign in with Apple on Android (spec/sync-protocol.md, Signing in), where
// Apple has no sign-in of its own to ask: the app opens Apple's web page in
// an Auth Tab, Apple posts its answer back to this server, and the server
// hands it on to the app through its own scheme, under a one-time code only
// the app that asked can redeem. The app then holds what iOS gets from
// Apple (an ID token and an authorization code) and goes on as iOS does.
//
// The app's request is bound PKCE's way: it sends the S256 challenge of a
// verifier it keeps, which is also the state Apple echoes, and redeeming
// takes the verifier. A code caught on its way to the app (another app
// claiming the scheme) is of no use without it, and the app takes back
// only the state it sent.
import {
  createAuthorizationURL,
  generateCodeChallenge,
} from "@better-auth/core/oauth2";
import { generateRandomString } from "better-auth/crypto";

import { getAuth } from "./session";

const APPLE_AUTHORIZE_PATH = "/apple/authorize";
const APPLE_CALLBACK_PATH = "/apple/callback";
const APPLE_REDEEM_PATH = "/apple/redeem";

/** Where Apple's answer goes on to, in the app's own scheme. */
const APP_RETURN = "pochical://apple-sign-in";

/** How long the app has to redeem a code: it does so at once. */
const HANDOFF_SECONDS = 120;

/** An S256 challenge: a SHA-256, base64url without padding. */
const CHALLENGE = /^[\w-]{43}$/u;

/** The SHA-256 of the app's nonce in hex, which Apple puts in the ID token. */
const NONCE_HASH = /^[\da-f]{64}$/u;

/** What the app redeems: Apple's answer, as iOS's sign-in gets it. */
type Handoff = {
  challenge: string;
  idToken: string;
  authorizationCode: string;
};

const handoffId = (code: string): string => `apple-handoff:${code}`;

const isHandoff = (value: unknown): value is Handoff =>
  typeof value === "object" &&
  value !== null &&
  "challenge" in value &&
  typeof value.challenge === "string" &&
  "idToken" in value &&
  typeof value.idToken === "string" &&
  "authorizationCode" in value &&
  typeof value.authorizationCode === "string";

/** Back to the app with `params`, which ends its Auth Tab. */
const toApp = (params: Record<string, string>): Response =>
  Response.redirect(
    `${APP_RETURN}?${new URLSearchParams(params).toString()}`,
    303
  );

/**
 * GET, opened by the app: on to Apple's page for the Services ID, asking
 * for the email (linking needs it) with the app's nonce hash and its
 * challenge as the state, for Apple to post its answer back here.
 */
const authorize = async (url: URL, env: Env): Promise<Response> => {
  const challenge = url.searchParams.get("challenge") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  if (!CHALLENGE.test(challenge) || !NONCE_HASH.test(nonce)) {
    return new Response("A challenge and a nonce hash are needed", {
      status: 400,
    });
  }
  const apple = await createAuthorizationURL({
    authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
    id: "apple",
    nonce,
    options: { clientId: env.APPLE_SERVICES_ID },
    redirectURI: new URL(APPLE_CALLBACK_PATH, env.BETTER_AUTH_URL).href,
    responseMode: "form_post",
    responseType: "code id_token",
    scopes: ["email"],
    state: challenge,
  });
  return Response.redirect(apple.href, 302);
};

/**
 * POST, Apple's form: kept under a new one-time code, which goes to the
 * app with the state; or what went wrong, the person cancelling apart.
 * The ID token is checked where it is used, as one from iOS is.
 */
const answered = async (request: Request): Promise<Response> => {
  const form = await request.formData();
  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const state = field("state");
  if (!CHALLENGE.test(state)) {
    return toApp({ error: "failed" });
  }
  const idToken = field("id_token");
  const authorizationCode = field("code");
  if (field("error") === "user_cancelled_authorize") {
    return toApp({ error: "cancelled", state });
  }
  if (idToken === "" || authorizationCode === "") {
    return toApp({ error: "failed", state });
  }
  const code = generateRandomString(43, "a-z", "A-Z", "0-9");
  const handoff: Handoff = { authorizationCode, challenge: state, idToken };
  const { internalAdapter } = await getAuth().$context;
  await internalAdapter.createVerificationValue({
    expiresAt: new Date(Date.now() + HANDOFF_SECONDS * 1000),
    identifier: handoffId(code),
    value: JSON.stringify(handoff),
  });
  return toApp({ code, state });
};

const refused = (): Response =>
  Response.json(
    { code: "HANDOFF_REFUSED", message: "Sign in with Apple again" },
    { status: 400 }
  );

/**
 * POST `{ code, verifier }`: Apple's answer, once. The code goes whether or
 * not the verifier is the one it was asked with, so it cannot be guessed
 * at; one unknown, used or expired is refused alike.
 */
const redeem = async (request: Request): Promise<Response> => {
  const body: unknown = await request.json().catch(() => null);
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? body.code
      : undefined;
  const verifier =
    typeof body === "object" && body !== null && "verifier" in body
      ? body.verifier
      : undefined;
  if (typeof code !== "string" || typeof verifier !== "string") {
    return refused();
  }
  const { internalAdapter } = await getAuth().$context;
  const kept = await internalAdapter.consumeVerificationValue(handoffId(code));
  const handoff: unknown = kept === null ? null : JSON.parse(kept.value);
  if (
    !isHandoff(handoff) ||
    (await generateCodeChallenge(verifier)) !== handoff.challenge
  ) {
    return refused();
  }
  return Response.json({
    authorizationCode: handoff.authorizationCode,
    idToken: handoff.idToken,
  });
};

/** The handoff's own paths; undefined for any other request. */
export const appleHandoff = async (
  request: Request,
  env: Env,
  url: URL
): Promise<Response | undefined> => {
  if (url.pathname === APPLE_AUTHORIZE_PATH && request.method === "GET") {
    return await authorize(url, env);
  }
  if (url.pathname === APPLE_CALLBACK_PATH && request.method === "POST") {
    return await answered(request);
  }
  if (url.pathname === APPLE_REDEEM_PATH && request.method === "POST") {
    return await redeem(request);
  }
  return undefined;
};
