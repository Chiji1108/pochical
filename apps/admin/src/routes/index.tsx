import { createFileRoute, Link } from "@tanstack/react-router";

import { getSupportChats, when } from "../admin";

// Every user's chat, the latest first, the ones waiting for an answer said.
export const Route = createFileRoute("/")({
  component: SupportChats,
  loader: async () => await getSupportChats(),
});

/** A chat's latest line, as its row shows it. */
function summaryOf(chat: { text: string; unsent: boolean }): string {
  if (chat.unsent) {
    return "（送信取消）";
  }
  return chat.text.slice(0, 80);
}

type Failure = { sinceMs: number; why: string };

/**
 * The chats whose lines have not reached Slack, said once over the list:
 * since the earliest, and each reason Slack gave.
 */
function SlackFailing({ failures }: { failures: Failure[] }) {
  if (failures.length === 0) {
    return null;
  }
  const since = Math.min(...failures.map((failure) => failure.sinceMs));
  const whys = [...new Set(failures.map((failure) => failure.why))];
  return (
    <p className="alert" role="alert">
      {`${when(since)} から、${failures.length}件のチャットの行が Slack に届いていません（${whys.join("、")}）。ここでは読んで返信できます。Slack が受け取るようになると、待っている行を順に送ります。`}
    </p>
  );
}

function SupportChats() {
  const chats = Route.useLoaderData();
  const failures = chats.flatMap((chat) => chat.slackFailure ?? []);
  return (
    <main>
      <h1>サポート</h1>
      <SlackFailing failures={failures} />
      <table>
        <thead>
          <tr>
            <th>最新</th>
            <th>ユーザー</th>
            <th>最新の行</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {chats.map((chat) => (
            <tr key={chat.userId}>
              <td>{when(chat.lastAtMs)}</td>
              <td>
                <Link params={{ userId: chat.userId }} to="/support/$userId">
                  {chat.userId.slice(0, 8)}
                </Link>
              </td>
              <td>{summaryOf(chat)}</td>
              <td>
                {chat.unanswered === 0 ? (
                  "返信済み"
                ) : (
                  <span className="open">未返信（{chat.unanswered}）</span>
                )}
                {chat.slackFailure === null ? null : (
                  <div className="meta">Slack未送信</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
