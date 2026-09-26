import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import {
  ConvexReactClient,
  useAction,
  useConvexAuth,
  useQuery,
} from "convex/react";
import { Check, LockKeyhole, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/convex-api";
import { site } from "../lib/site";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const receiptKey = `pochical:deletion:${convexUrl ?? "unconfigured"}`;
const readReceipt = (): string | null => {
  try {
    return sessionStorage.getItem(receiptKey);
  } catch {
    return null;
  }
};

export default function DeletionClient() {
  if (!convexUrl) {
    return (
      <div>
        <LockKeyhole aria-hidden="true" size={24} />
        <h2>削除はサポートでも受け付けています</h2>
        <p>
          オンラインでの本人確認は現在準備中です。削除をご希望の場合は、下記の窓口へご連絡ください。
        </p>
        <a
          className="button"
          href={`mailto:${site.email}?subject=${encodeURIComponent("ポチカル アカウント削除の依頼")}`}
        >
          削除を依頼する
        </a>
      </div>
    );
  }
  return <ConnectedDeletion url={convexUrl} />;
}
function ConnectedDeletion({ url }: { url: string }) {
  const [client, setClient] = useState<ConvexReactClient>();
  useEffect(() => {
    const connection = new ConvexReactClient(url);
    setClient(connection);
    return () => {
      connection.close().catch(() => undefined);
    };
  }, [url]);
  if (!client) {
    return <p aria-live="polite">本人確認の準備をしています…</p>;
  }
  return (
    <ConvexAuthProvider client={client} storage={sessionStorage}>
      <DeletionFlow />
    </ConvexAuthProvider>
  );
}
function DeletionFlow() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [receipt, setReceipt] = useState(readReceipt);
  const onAccepted = (value: string) => {
    setReceipt(value);
    try {
      sessionStorage.setItem(receiptKey, value);
    } catch {
      /* The receipt remains visible when browser storage is unavailable. */
    }
  };
  if (receipt) {
    return <DeletionReceipt receipt={receipt} />;
  }
  if (isLoading) {
    return <p aria-live="polite">ログイン状態を確認しています…</p>;
  }
  if (!isAuthenticated) {
    return <SignIn />;
  }
  return <ConfirmDeletion onAccepted={onAccepted} />;
}
function SignIn() {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const login = async (provider: "apple" | "google") => {
    setBusy(true);
    setError("");
    try {
      await signIn(provider, {
        redirectTo: `${window.location.origin}/account/delete`,
      });
    } catch {
      setError(
        "ログインを開始できませんでした。時間をおいて再度お試しいただくか、サポートへお問い合わせください。"
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="eyebrow">STEP 01 / VERIFY</p>
      <h2>ご本人であることを確認します</h2>
      <p>
        ポチカルで連携したアカウントを選んでください。
        <br />
        ログインしただけでは削除されません。
      </p>
      <div className="login-buttons">
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => login("apple")}
          type="button"
        >
          Appleで続ける
        </button>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => login("google")}
          type="button"
        >
          <img alt="" height={18} src="/google.png" width={18} />
          Googleで続ける
        </button>
      </div>
      {busy ? <p aria-live="polite">ログイン画面を開いています…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
function ConfirmDeletion({
  onAccepted,
}: {
  onAccepted: (receipt: string) => void;
}) {
  const account = useQuery(api.accounts.current);
  const requestDeletion = useAction(api.deleteAccount.request);
  const { signIn, signOut } = useAuthActions();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const mustVerifyApple =
    account?.providers.includes("apple") && !account.canRevokeApple;
  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      setError("ログアウトできませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };
  const verifyApple = async () => {
    setBusy(true);
    try {
      await signIn("apple", {
        redirectTo: `${window.location.origin}/account/delete`,
      });
    } catch {
      setError("Appleでの本人確認を開始できませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(confirmed && account) || running.current || mustVerifyApple) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const receipt = await requestDeletion({});
      onAccepted(receipt);
    } catch {
      setError(
        "削除を受け付けられませんでした。再度ログインしてお試しください。解決しない場合はサポートへご連絡ください。"
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  if (account === undefined) {
    return <p aria-live="polite">アカウントを確認しています…</p>;
  }
  if (!account || account.isAnonymous) {
    return (
      <>
        <h2>アカウントを確認できませんでした</h2>
        <p>
          アプリで連携したAppleまたはGoogleアカウントでログインしてください。
        </p>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={logout}
          type="button"
        >
          ログインし直す
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">STEP 02 / CONFIRM</p>
      <h2>削除するアカウントを確認</h2>
      <div className="account-identity">
        <strong>{account.name ?? "ログイン中のアカウント"}</strong>
        {account.email ? <span>{account.email}</span> : null}
        <span>
          {account.providers
            .filter((provider) => provider === "apple" || provider === "google")
            .map((provider) => (provider === "apple" ? "Apple" : "Google"))
            .join("・")}
          で連携
        </span>
      </div>
      <button
        className="text-button"
        disabled={busy}
        onClick={logout}
        type="button"
      >
        <LogOut aria-hidden="true" size={14} />
        別のアカウントを使う
      </button>
      {mustVerifyApple ? (
        <div className="notice">
          <p>Apple連携を解除するため、Appleで再度本人確認をしてください。</p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={verifyApple}
            type="button"
          >
            Appleで本人確認
          </button>
        </div>
      ) : (
        <>
          <label className="confirmation">
            <input
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              削除される内容を確認しました。アカウントと関連データを削除し、元に戻せないことに同意します。
            </span>
          </label>
          <button
            className="button button-danger"
            disabled={!confirmed || busy}
            onClick={remove}
            type="button"
          >
            {busy ? "削除を受け付けています…" : "アカウントとデータを削除する"}
          </button>
        </>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
function DeletionReceipt({ receipt }: { receipt: string }) {
  const pending = useQuery(api.accountDeletion.pending, { receipt });
  return (
    <div aria-live="polite" className="receipt">
      <span className="success-icon">
        <Check aria-hidden="true" size={25} />
      </span>
      <h2>
        {pending === false ? "削除が完了しました" : "削除を受け付けました"}
      </h2>
      <p>
        {pending === false
          ? "サーバー上のアカウントと関連データの削除処理が完了しました。ポチカルをご利用いただき、ありがとうございました。"
          : "サーバー上のデータを順次削除しています。このページを閉じても処理は続きます。"}
      </p>
      <p className="small-note">
        オフラインの端末や、他の人が保存したコピーの消去を示すものではありません。
      </p>
      <p className="receipt-number">
        受付番号
        <br />
        <code>{receipt}</code>
      </p>
    </div>
  );
}
