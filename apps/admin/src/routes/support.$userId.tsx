import { textLimits } from "@pochical/design/limits";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { answerSupport, getSupportChat, when } from "../admin";

// One user's chat, oldest first, each of their lines with the app and
// device it came from, and a form to answer as ポチカル.
export const Route = createFileRoute("/support/$userId")({
  component: SupportChat,
  loader: async ({ params }) => await getSupportChat({ data: params.userId }),
});

function SupportChat() {
  const lines = Route.useLoaderData();
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
          key={line.atMs}
        >
          <div className="meta">
            {line.fromSupport ? "ポチカル" : "ユーザー"}・{when(line.atMs)}
            {line.device === null ? "" : `・${line.device}`}
          </div>
          {line.text}
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
