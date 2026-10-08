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
  return chat.text === "" ? "📷 写真" : chat.text.slice(0, 80);
}

function SupportChats() {
  const chats = Route.useLoaderData();
  return (
    <main>
      <h1>サポート</h1>
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
                {chat.fromSupport ? (
                  "返信済み"
                ) : (
                  <span className="open">未返信</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
