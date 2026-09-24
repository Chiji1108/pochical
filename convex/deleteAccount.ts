import { ConvexError, v } from "convex/values";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createAppleClientSecret } from "../convex-lib/appleAuthProvider";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

export const request = action({
  args: { appleAuthorizationCode: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { appleAuthorizationCode }): Promise<string> => {
    const credentials = await ctx.runQuery(
      internal.accountDeletion.credentials,
      {}
    );
    if (credentials.appleSubject) {
      let token = credentials.refreshToken;
      const clientId = appleAuthorizationCode
        ? process.env.AUTH_APPLE_NATIVE_ID
        : credentials.clientId;
      if (!(clientId && (token || appleAuthorizationCode))) {
        throw new ConvexError(
          "Appleで再ログインしてから、アカウント削除をやり直してください"
        );
      }
      const secret = await createAppleClientSecret({
        ...process.env,
        AUTH_APPLE_ID: clientId,
      });
      if (appleAuthorizationCode) {
        token = await exchangeAppleCode(
          appleAuthorizationCode,
          clientId,
          secret,
          credentials.appleSubject
        );
      }
      if (!token) {
        throw new ConvexError("Appleでの本人確認が必要です");
      }
      const response = await fetch("https://appleid.apple.com/auth/revoke", {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          token,
          token_type_hint: "refresh_token",
        }),
      });
      if (!response.ok) {
        throw new ConvexError(
          "Apple連携を解除できませんでした。もう一度お試しください"
        );
      }
    }
    return await ctx.runMutation(internal.accountDeletion.begin, {
      receipt: crypto.randomUUID(),
      expectedUserId: credentials.userId,
    });
  },
});

const exchangeAppleCode = async (
  appleAuthorizationCode: string,
  clientId: string,
  secret: string,
  appleSubject: string
): Promise<string> => {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code: appleAuthorizationCode,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new ConvexError(
      "Appleの本人確認に失敗しました。もう一度お試しください"
    );
  }
  const result: { id_token?: string; refresh_token?: string } =
    await response.json();
  if (!(result.id_token && result.refresh_token)) {
    throw new ConvexError("Appleの本人確認に失敗しました");
  }
  const { payload } = await jwtVerify(result.id_token, appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: clientId,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp"],
  });
  if (payload.sub !== appleSubject) {
    throw new ConvexError("登録されているAppleアカウントを選んでください");
  }
  return result.refresh_token;
};
