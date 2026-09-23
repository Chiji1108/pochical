import { createRemoteJWKSet, jwtVerify } from "jose";

export type NativeProvider = "apple" | "google";
const keys = {
  apple: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
  google: createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  ),
};

export const verifyNativeIdentity = async (
  provider: NativeProvider,
  token: string,
  nonce: string,
  audience: string,
  keySet = keys[provider]
) => {
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ["RS256"],
    issuer:
      provider === "apple"
        ? "https://appleid.apple.com"
        : ["https://accounts.google.com", "accounts.google.com"],
    audience,
    requiredClaims: ["sub", "iat", "exp", "nonce"],
  });
  if (!payload.sub || payload.nonce !== nonce) {
    throw new Error("Invalid sign-in token");
  }
  return {
    id: payload.sub,
    ...(typeof payload.email === "string" &&
    (payload.email_verified === true || payload.email_verified === "true")
      ? { email: payload.email }
      : {}),
  };
};
