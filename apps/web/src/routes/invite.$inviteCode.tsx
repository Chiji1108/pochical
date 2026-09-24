import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { StoreLinks } from "../components/store-links";
import { getInvite } from "../lib/invites";
import { pageMeta } from "../lib/site";
export const Route = createFileRoute("/invite/$inviteCode")({
  loader: ({ params }) => getInvite({ data: params.inviteCode }),
  staleTime: 0,
  preload: false,
  head: () =>
    pageMeta(
      "グループへの招待",
      "ポチカレでシフトを共有しましょう。",
      "/invite",
      true
    ),
  component: Invite,
});
function Invite() {
  const invite = Route.useLoaderData();
  const { inviteCode } = Route.useParams();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await router.invalidate();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <main className="invite-page" id="main">
      <img
        alt="ポチカレ"
        className="invite-logo"
        height={80}
        src="/icon.png"
        width={80}
      />
      {invite.status === "valid" ? (
        <>
          <p className="eyebrow">YOU'RE INVITED</p>
          <p className="group-emoji">{invite.groupEmoji}</p>
          <h1>{invite.groupName}</h1>
          <p>
            グループへの招待が届いています。
            <br />
            アプリを開いて、シフトを共有しましょう。
          </p>
          <a
            className="button"
            href={`pochical://invite/${encodeURIComponent(inviteCode)}`}
          >
            アプリで開く <ArrowUpRight aria-hidden="true" size={18} />
          </a>
          <p className="small-note">
            参加はアプリで表示名を確認してから。
            <br />
            このページを開くだけでは参加しません。
          </p>
        </>
      ) : (
        <>
          <p className="eyebrow">GROUP INVITATION</p>
          <h1>
            {invite.status === "invalid"
              ? "この招待リンクは使えません。"
              : "招待を確認できませんでした。"}
          </h1>
          <p>
            {invite.status === "invalid"
              ? "招待リンクが変更されたか、グループが削除された可能性があります。送り主に新しいリンクを確認してください。"
              : "一時的に接続できない可能性があります。少し時間をおいて、もう一度お試しください。"}
          </p>
          {invite.status === "unavailable" ? (
            <button
              className="button"
              disabled={retrying}
              onClick={retry}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} />
              {retrying ? "確認しています…" : "もう一度確認する"}
            </button>
          ) : null}
        </>
      )}
      <div className="invite-download">
        <h2>アプリをまだお持ちでない方へ</h2>
        <StoreLinks />
        <Link className="text-link" to="/">
          ポチカレについて <ArrowUpRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </main>
  );
}
