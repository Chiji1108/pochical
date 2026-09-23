import { expect, test } from "bun:test";
import { useContext } from "react";
import { act, create } from "react-test-renderer";
import {
  AuthProvider,
  ConvexAuthActionsContext,
  useAuth,
} from "../node_modules/@convex-dev/auth/dist/react/client.js";

const jwt = (sub: string, exp: number) =>
  `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub, exp })).toString("base64url")}.test`;

test("authenticated account switches renew subscriptions, ordinary token refresh does not", async () => {
  const oldWindow = globalThis.window;
  globalThis.window = {};
  const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageValues.set(key, value);
    },
    removeItem: (key: string) => {
      storageValues.delete(key);
    },
  };
  let auth: ReturnType<typeof useAuth>;
  let actions: React.ContextType<typeof ConvexAuthActionsContext>;
  function Probe() {
    auth = useAuth();
    actions = useContext(ConvexAuthActionsContext);
    return null;
  }
  let nextToken = jwt("anonymous|session-a", 100);
  const client = {
    authenticatedCall: async () => ({
      tokens: { token: nextToken, refreshToken: "test-refresh" },
    }),
    unauthenticatedCall: async () => ({
      tokens: { token: nextToken, refreshToken: "test-refresh" },
    }),
  };
  let renderer: ReturnType<typeof create>;
  try {
    await act(async () => {
      renderer = create(
        <AuthProvider
          client={client}
          replaceURL={() => undefined}
          shouldHandleCode={false}
          storage={storage}
          storageNamespace="test"
        >
          <Probe />
        </AuthProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      await actions.signIn("anonymous");
    });
    const anonymousFetch = auth.fetchAccessToken;
    expect(auth.isAuthenticated).toBe(true);
    nextToken = jwt("google-user|session-b", 200);
    await act(async () => {
      await actions.signIn("google-native");
    });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.fetchAccessToken).not.toBe(anonymousFetch);
    expect(await auth.fetchAccessToken({ forceRefreshToken: false })).toBe(
      nextToken
    );
    const googleFetch = auth.fetchAccessToken;
    nextToken = jwt("google-user|session-b", 300);
    await act(async () => {
      await auth.fetchAccessToken({ forceRefreshToken: true });
    });
    expect(auth.fetchAccessToken).toBe(googleFetch);
    expect(await auth.fetchAccessToken({ forceRefreshToken: false })).toBe(
      nextToken
    );
  } finally {
    await act(() => {
      renderer?.unmount();
    });
    globalThis.window = oldWindow;
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment;
  }
});
