import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useState } from "react";

import { InviteMark } from "../components/invite-mark";
import { StoreLinks } from "../components/store-links";
import { getInvite } from "../lib/invites";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/invite/$inviteCode")({
  component: Invite,
  // Chat apps build the link's preview card from these tags, so it names
  // the group as the page does.
  head: ({ loaderData, params }) => {
    const path = `/invite/${encodeURIComponent(params.inviteCode)}`;
    if (loaderData?.status !== "valid") {
      return pageMeta(
        "グループへの招待",
        "ポチカルでシフトを共有しましょう。",
        path,
        true
      );
    }
    const group = `${loaderData.groupMark.emoji}「${loaderData.groupName}」`;
    return pageMeta(
      `${group}への招待`,
      "ポチカルでシフトを共有しましょう。",
      path,
      true,
      // Drawn for the group by the site's Worker (src/server.ts).
      { alt: `${group}への招待`, path: `${path}/og.png` }
    );
  },
  // Typed by hand so head, which comes first, can read its result.
  loader: async ({ params }: { params: { inviteCode: string } }) =>
    await getInvite({ data: params.inviteCode }),
  preload: false,
  staleTime: 0,
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
      {invite.status === "valid" ? (
        <>
          {/* The group is what the page is about, so its mark leads, in a
              frame like the app's join screen; the header says ポチカル. */}
          <span aria-hidden="true" className="invite-mark">
            <InviteMark mark={invite.groupMark} size={66} />
          </span>
          <p className="eyebrow">YOU'RE INVITED</p>
          <h1>{invite.groupName}</h1>
          {invite.memberCount > 0 && (
            <p className="invite-members">メンバー {invite.memberCount}人</p>
          )}
          <a
            className="button"
            href={`pochical://invite/${encodeURIComponent(inviteCode)}`}
          >
            アプリで開く <ArrowUpRight aria-hidden="true" size={18} />
          </a>
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
              onClick={() => {
                void retry();
              }}
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
          ポチカルについて →
        </Link>
      </div>
    </main>
  );
}
