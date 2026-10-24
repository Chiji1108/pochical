// A JWT signed with a PKCS #8 private key from its PEM text, through jose
// (MIT): one of Apple's .p8 keys (ES256), as APNs takes for its provider
// token and Sign in with Apple for the app's client secret, or a Google
// service account's RSA key (RS256), as Google's OAuth takes for FCM's
// access token.
import { importPKCS8, SignJWT } from "jose";
import type { JWTPayload } from "jose";

/** `claims` signed as `alg` with the PEM key `key`, whose id is `keyId`. */
export const signJwt = async (
  alg: "ES256" | "RS256",
  key: string,
  keyId: string,
  claims: JWTPayload
): Promise<string> =>
  await new SignJWT(claims)
    .setProtectedHeader({ alg, kid: keyId })
    .sign(await importPKCS8(key, alg));
