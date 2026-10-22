import { css, cx } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  alert,
  badge,
  card,
  code,
  Empty,
  numeric,
  page,
  PageHeader,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/support-chats";

// Every user's chat, the latest first, the ones waiting for an answer said.
export const loader = async () => await env.SERVER.supportChats();

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
    <p className={alert} role="alert">
      {`${when(since)} から、${failures.length}件のチャットの行が Slack に届いていません（${whys.join("、")}）。ここでは読んで返信できます。Slack が受け取るようになると、待っている行を順に送ります。`}
    </p>
  );
}

export default function SupportChats({
  loaderData: chats,
}: Route.ComponentProps) {
  const failures = chats.flatMap((chat) => chat.slackFailure ?? []);
  const waiting = chats.filter((chat) => chat.unanswered > 0).length;
  return (
    <main className={page}>
      <PageHeader
        actions={
          waiting === 0 ? null : (
            <span
              className={badge({ tone: "danger" })}
            >{`未返信 ${waiting}`}</span>
          )
        }
        description="ユーザーとのチャット。新しい順です。"
        title="サポート"
      />
      <SlackFailing failures={failures} />
      <div className={card}>
        {chats.length === 0 ? (
          <Empty>チャットはまだありません。</Empty>
        ) : (
          <table className={table}>
            <thead>
              <tr>
                <th>ユーザー</th>
                <th>最新の行</th>
                <th>状態</th>
                <th>最新</th>
              </tr>
            </thead>
            <tbody>
              {chats.map((chat) => (
                <tr key={chat.userId}>
                  <td>
                    <Link
                      className={cx(
                        code,
                        css({
                          _hover: { textDecoration: "underline" },
                          color: "accent.default",
                          fontWeight: 500,
                        })
                      )}
                      to={`/support/${chat.userId}`}
                    >
                      {chat.userId.slice(0, 8)}
                    </Link>
                  </td>
                  <td
                    className={css({
                      color: chat.unsent ? "text.tertiary" : "text.secondary",
                      maxWidth: "480px",
                    })}
                  >
                    <span className={css({ lineClamp: 2 })}>
                      {summaryOf(chat)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={css({
                        alignItems: "flex-start",
                        display: "flex",
                        flexDirection: "column",
                        gap: "1",
                      })}
                    >
                      {chat.unanswered === 0 ? (
                        <span className={badge()}>返信済み</span>
                      ) : (
                        <span className={badge({ tone: "danger" })}>
                          {`未返信（${chat.unanswered}）`}
                        </span>
                      )}
                      {chat.slackFailure === null ? null : (
                        <span className={badge()}>Slack未送信</span>
                      )}
                    </span>
                  </td>
                  <td className={css({ color: "text.tertiary" })}>
                    <span className={numeric}>{when(chat.lastAtMs)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
