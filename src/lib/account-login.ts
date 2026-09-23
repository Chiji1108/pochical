import type { ConvexAuthActionsContext } from "@convex-dev/auth/react";
import type { ConvexReactClient } from "convex/react";
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import { openAuthSessionAsync } from "expo-web-browser";
import { api } from "../../convex/_generated/api";
import {
  cancelPendingLogin,
  finishLogin,
  finishNativeLogin,
} from "./account-link";
import { getNativeIdentityToken, usesNativeLogin } from "./native-login";

export const authenticateAccount = async (
  provider: "apple" | "google",
  signIn: ConvexAuthActionsContext["signIn"],
  client: ConvexReactClient
) => {
  if (usesNativeLogin(provider)) {
    const secret = `${randomUUID()}${randomUUID()}`;
    const nonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, secret);
    const challengeId = await client.mutation(api.nativeAuth.prepare, {
      provider,
      nonce,
    });
    const idToken = await getNativeIdentityToken(provider, nonce);
    if (!idToken) {
      await cancelPendingLogin();
      return;
    }
    await finishNativeLogin({ idToken, challengeId, secret }, signIn, client);
    return;
  }
  const redirectTo = "pochical://auth";
  const result = await signIn(provider, { redirectTo });
  if (!result.redirect) {
    throw new Error("ログイン画面を開けませんでした");
  }
  const session = await openAuthSessionAsync(
    result.redirect.toString(),
    redirectTo
  );
  if (session.type !== "success") {
    await cancelPendingLogin();
    return;
  }
  const code = new URL(session.url).searchParams.get("code");
  if (!code) {
    throw new Error("ログインを完了できませんでした");
  }
  await finishLogin(code, signIn, client);
};
