import { expect, mock, test } from "bun:test";

import { getFunctionName } from "convex/server";
import { type ReactNode, StrictMode } from "react";
import { act, create } from "react-test-renderer";

const clients: FakeClient[] = [];
class FakeClient {
  closed = false;
  constructor() {
    clients.push(this);
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}
let pending = true;
let account = {
  name: "検証ユーザー",
  email: "test@example.test",
  providers: ["google"],
  canRevokeApple: false,
  isAnonymous: false,
};
const deletion = mock(async () => "test-receipt");
const signIn = mock(async () => undefined);
mock.module("convex/react", () => ({
  ConvexReactClient: FakeClient,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useAction: () => deletion,
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "accounts:current" ? account : pending,
}));
mock.module("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({
    client,
    children,
  }: {
    client: FakeClient;
    children: ReactNode;
  }) => {
    if (client.closed) {
      throw new Error("Provider received a closed client");
    }
    return children;
  },
  useAuthActions: () => ({ signIn, signOut: async () => undefined }),
}));
const oldUrl = process.env.VITE_CONVEX_URL;
process.env.VITE_CONVEX_URL = "https://test.convex.cloud";
const { default: DeletionClient } =
  await import("../src/components/deletion-client");
if (oldUrl === undefined) {
  delete process.env.VITE_CONVEX_URL;
} else {
  process.env.VITE_CONVEX_URL = oldUrl;
}

function setupBrowser() {
  const oldStorage = globalThis.sessionStorage;
  const oldWindow = globalThis.window;
  const oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const values = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  globalThis.window = { location: { origin: "https://example.test" } };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    globalThis.sessionStorage = oldStorage;
    globalThis.window = oldWindow;
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
  };
}

test("deletion requires confirmation, ignores duplicate clicks, and reports progress without closing the active StrictMode client", async () => {
  const restore = setupBrowser();
  let renderer: ReturnType<typeof create> | undefined;
  deletion.mockClear();
  pending = true;
  account = { ...account, providers: ["google"] };
  try {
    await act(() => {
      renderer = create(
        <StrictMode>
          <DeletionClient />
        </StrictMode>
      );
    });
    const button = renderer!.root.findByProps({
      className: "button button-danger",
    });
    expect(button.props.disabled).toBe(true);
    await act(async () => {
      await button.props.onClick();
    });
    expect(deletion).not.toHaveBeenCalled();
    await act(() => {
      renderer!.root
        .findByType("input")
        .props.onChange({ target: { checked: true } });
    });
    expect(button.props.disabled).toBe(false);
    await act(async () => {
      await Promise.all([button.props.onClick(), button.props.onClick()]);
    });
    expect(deletion).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "削除を受け付けました"
    );
    expect(JSON.stringify(renderer!.toJSON())).not.toContain(
      "削除が完了しました"
    );
    pending = false;
    await act(() => {
      renderer!.update(
        <StrictMode>
          <DeletionClient />
        </StrictMode>
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("削除が完了しました");
    expect(clients.at(-1)?.closed).toBe(false);
  } finally {
    await act(() => {
      renderer?.unmount();
    });
    restore();
  }
  expect(clients.at(-1)?.closed).toBe(true);
});

test("Apple accounts without revocation credentials must reauthenticate before deletion", async () => {
  const restore = setupBrowser();
  let renderer: ReturnType<typeof create> | undefined;
  deletion.mockClear();
  signIn.mockClear();
  account = { ...account, providers: ["apple"], canRevokeApple: false };
  try {
    await act(() => {
      renderer = create(<DeletionClient />);
    });
    expect(renderer!.root.findAllByType("input")).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ className: "button button-danger" })
    ).toHaveLength(0);
    await act(async () => {
      await renderer!.root
        .findByProps({ className: "button button-secondary" })
        .props.onClick();
    });
    expect(signIn).toHaveBeenCalledWith("apple", {
      redirectTo: "https://example.test/account/delete",
    });
    expect(deletion).not.toHaveBeenCalled();
  } finally {
    await act(() => {
      renderer?.unmount();
    });
    restore();
  }
});
