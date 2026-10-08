import { textLimits } from "@pochical/design/limits";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { answerSupport, getSupportChat, when } from "../admin";

// One user's chat, oldest first, each of their lines with the app and
// device it came from, the line a reply is to, and the emoji on it; and a
// form to answer as ポチカル.
export const Route = createFileRoute("/support/$userId")({
  component: SupportChat,
  loader: async ({ params }) => await getSupportChat({ data: params.userId }),
});

function SupportChat() {
  const lines = Route.useLoaderData();
  const byId = new Map(lines.map((line) => [line.id, line]));
  const { userId } = Route.useParams();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    setSending(true);
    const kept = await answerSupport({ data: { text: draft, userId } }).catch(
      () => false
    );
    setSending(false);
    setFailed(!kept);
    if (kept) {
      setDraft("");
      await router.invalidate();
    }
  };
  return (
    <main>
      <h1>サポート・{userId.slice(0, 8)}</h1>
      {lines.map((line) => (
        <div
          className="line"
          data-from={line.fromSupport ? "staff" : "user"}
          key={line.id}
        >
          <div className="meta">
            {line.fromSupport ? "ポチカル" : "ユーザー"}・{when(line.atMs)}
            {line.device === null ? "" : `・${line.device}`}
          </div>
          {line.replyTo !== null && (
            <div className="quote">
              {byId.get(line.replyTo)?.text.slice(0, 80) ?? "以前のメッセージ"}
            </div>
          )}
          {line.unsent ? (
            <span className="meta">送信が取り消されました</span>
          ) : (
            line.text
          )}
          {line.reactions.length > 0 && (
            <div className="meta">
              {line.reactions
                .map(
                  ({ emoji, mine, support }) =>
                    `${emoji}${[mine && "ユーザー", support && "ポチカル"].filter(Boolean).join("・")}`
                )
                .join("　")}
            </div>
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="返信"
          maxLength={textLimits.chatMessage}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          rows={4}
          value={draft}
        />
        <button disabled={sending || draft.trim() === ""} type="submit">
          ポチカルとして返信
        </button>
        {failed && <p className="open">返信できませんでした。</p>}
      </form>
    </main>
  );
}
