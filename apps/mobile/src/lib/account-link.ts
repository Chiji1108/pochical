import type { ConvexAuthActionsContext } from "@convex-dev/auth/react";
import { ConvexHttpClient } from "convex/browser";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authStorage } from "./auth-storage";
import { getActiveAuthToken, waitForAuthToken } from "./auth-token";

type PendingLogin = {
  provider: "apple" | "google";
  secret?: string;
  authenticated?: boolean;
};
const KEY = "pendingAccountLogin";
let completing: { code: string; promise: Promise<void> } | undefined;
export const savePendingLogin = (login: PendingLogin) =>
  authStorage.setItem(KEY, JSON.stringify(login));
export const cancelPendingLogin = () => authStorage.removeItem(KEY);
export const hasPendingLink = async () => {
  const raw = await authStorage.getItem(KEY);
  if (!raw) {
    return false;
  }
  const login = JSON.parse(raw) as PendingLogin;
  return Boolean(login.authenticated && login.secret);
};
export const retryPendingLink = async (client: ConvexReactClient) => {
  const raw = await authStorage.getItem(KEY);
  if (!raw) {
    return;
  }
  const login = JSON.parse(raw) as PendingLogin;
  if (!(login.authenticated && login.secret)) {
    return;
  }
  const token = getActiveAuthToken();
  if (!token) {
    throw new Error("ログインしてください");
  }
  const authenticated = new ConvexHttpClient(client.url);
  authenticated.setAuth(token);
  await authenticated.mutation(api.accounts.completeLink, {
    secret: login.secret,
  });
  await cancelPendingLogin();
};
export const finishLogin = (
  code: string,
  signIn: ConvexAuthActionsContext["signIn"],
  client: ConvexReactClient
): Promise<void> => {
  if (completing?.code === code) {
    return completing.promise;
  }
  const promise = (async () => {
    const raw = await authStorage.getItem(KEY);
    if (!raw) {
      throw new Error(
        "ログインの有効期限が切れました。もう一度お試しください。"
      );
    }
    const login = JSON.parse(raw) as PendingLogin;
    if (!login.authenticated) {
      const previousToken = getActiveAuthToken();
      await signIn(login.provider, { code });
      await waitForAuthToken(previousToken);
      await savePendingLogin({ ...login, authenticated: true });
    }
    if (login.secret) {
      await retryPendingLink(client);
    } else {
      await cancelPendingLogin();
    }
  })().catch((error: unknown) => {
    completing = undefined;
    throw error;
  });
  completing = { code, promise };
  return promise;
};

export const finishNativeLogin = async (
  credentials: { idToken: string; challengeId: string; secret: string },
  signIn: ConvexAuthActionsContext["signIn"],
  client: ConvexReactClient
) => {
  const raw = await authStorage.getItem(KEY);
  if (!raw) {
    throw new Error("ログインをもう一度お試しください。");
  }
  const login = JSON.parse(raw) as PendingLogin;
  const previousToken = getActiveAuthToken();
  await signIn(`${login.provider}-native`, credentials);
  await waitForAuthToken(previousToken);
  await savePendingLogin({ ...login, authenticated: true });
  if (login.secret) {
    await retryPendingLink(client);
  } else {
    await cancelPendingLogin();
  }
};
