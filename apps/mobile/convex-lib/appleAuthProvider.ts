import { customFetch } from "@auth/core";
import Apple from "@auth/core/providers/apple";
import { importPKCS8, SignJWT } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_TOKEN_ENDPOINT = `${APPLE_ISSUER}/auth/token`;
const CLIENT_SECRET_LIFETIME_SECONDS = 5 * 60;
const ESCAPED_NEWLINE = /\\n/g;

type AppleEnvironment = Record<string, string | undefined>;

export const createAppleClientSecret = async (
  env: AppleEnvironment = process.env,
  now = Math.floor(Date.now() / 1000)
): Promise<string> => {
  const privateKey = env.AUTH_APPLE_PRIVATE_KEY;
  const teamId = env.AUTH_APPLE_TEAM_ID;
  const keyId = env.AUTH_APPLE_KEY_ID;
  const clientId = env.AUTH_APPLE_ID;

  // Keep existing deployments working until the signing credentials are set.
  if (!(privateKey || teamId || keyId) && env.AUTH_APPLE_SECRET) {
    return env.AUTH_APPLE_SECRET;
  }
  if (!(privateKey && teamId && keyId && clientId)) {
    throw new Error(
      "Apple sign-in requires AUTH_APPLE_PRIVATE_KEY, AUTH_APPLE_TEAM_ID, AUTH_APPLE_KEY_ID and AUTH_APPLE_ID."
    );
  }

  const key = await importPKCS8(
    privateKey.replace(ESCAPED_NEWLINE, "\n"),
    "ES256"
  );
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_SECRET_LIFETIME_SECONDS)
    .sign(key);
};

export const appleAuthProvider = () => {
  const provider = Apple({
    // Auth.js requires a string before its async fetch hook runs. The hook
    // replaces this placeholder immediately before the token request is sent.
    clientSecret: "generated-per-request",
    allowDangerousEmailAccountLinking: false,
    profile: (profile, tokens) => ({
      ...(tokens.refresh_token
        ? {
            appleRefreshToken: tokens.refresh_token,
            appleClientId: process.env.AUTH_APPLE_ID,
          }
        : {}),
      id: profile.sub,
      email: profile.email,
      ...(profile.user?.name
        ? {
            name: `${profile.user.name.firstName} ${profile.user.name.lastName}`.trim(),
          }
        : {}),
    }),
  });
  const appleFetch = provider[customFetch] ?? fetch;

  // Set the symbol on the provider itself: Convex Auth's options merge does
  // not copy symbol keys. Preserve Apple's built-in discovery response fix.
  provider[customFetch] = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.href !== APPLE_TOKEN_ENDPOINT) {
      return await appleFetch(input, init);
    }

    const request = new Request(input, init);
    if (
      request.method !== "POST" ||
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    ) {
      throw new Error("Unexpected Apple token request format");
    }
    const body = new URLSearchParams(await request.text());
    if (
      !process.env.AUTH_APPLE_ID ||
      body.get("client_id") !== process.env.AUTH_APPLE_ID
    ) {
      throw new Error(
        "Apple token request client ID does not match AUTH_APPLE_ID"
      );
    }
    body.set("client_secret", await createAppleClientSecret());
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return await appleFetch(url, {
      ...init,
      method: "POST",
      headers,
      body,
      signal: request.signal,
      redirect: "error",
    });
  };
  return provider;
};
