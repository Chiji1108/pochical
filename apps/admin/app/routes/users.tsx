import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { Form, Link, redirect } from "react-router";

import { SignIns } from "../sign-ins";
import {
  badge,
  button,
  card,
  codeStyle,
  Empty,
  field,
  numeric,
  page,
  PageHeader,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/users";

// Every user, the latest signed up first, or those whose id starts with
// what ?q= holds, a page at a time (?afterAt=&afterId=, where the page
// before ended); one found alone opens their page, as ⌘K jumps to them.
export const loader = async ({ url }: Route.LoaderArgs) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const afterAt = Number(url.searchParams.get("afterAt"));
  const afterId = url.searchParams.get("afterId");
  const after =
    Number.isInteger(afterAt) && afterAt > 0 && afterId !== null
      ? { createdAtMs: afterAt, userId: afterId }
      : null;
  const { next, users } = await env.SERVER.users(query, after);
  const [only] = users;
  if (
    query !== "" &&
    after === null &&
    users.length === 1 &&
    only !== undefined
  ) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router's redirect
    throw redirect(`/users/${only.userId}`);
  }
  const nextPage =
    next === null
      ? null
      : `?${new URLSearchParams({
          afterAt: String(next.createdAtMs),
          afterId: next.userId,
          q: query,
        })}`;
  return { nextPage, query, users };
};

export default function Users({
  loaderData: { nextPage, query, users },
}: Route.ComponentProps) {
  return (
    <main className={page}>
      <PageHeader
        description="アカウントのあるユーザー。新しい順です。"
        title="ユーザー"
      />
      {/* A GET of the page, with or without JavaScript. */}
      <search>
        <Form className={css({ maxWidth: "420px" })} method="get">
          <input
            aria-label="ユーザー ID の始まり"
            autoComplete="off"
            className={field}
            defaultValue={query}
            key={query}
            name="q"
            placeholder="ユーザー ID の始まりで探す"
            type="search"
          />
        </Form>
      </search>
      <div className={card}>
        {users.length === 0 ? (
          <Empty>
            {query === ""
              ? "ユーザーはまだいません。"
              : `「${query}」で始まる ID のユーザーはいません。`}
          </Empty>
        ) : (
          <table className={table}>
            <thead>
              <tr>
                <th>ユーザー</th>
                <th>サインイン</th>
                <th>サポート</th>
                <th>登録</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <Link
                      className={css(codeStyle, {
                        _hover: { textDecoration: "underline" },
                        color: "accent.default",
                        fontWeight: 500,
                      })}
                      to={`/users/${user.userId}`}
                    >
                      {user.userId.slice(0, 8)}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={css({
                        display: "inline-flex",
                        flexWrap: "wrap",
                        gap: "1",
                      })}
                    >
                      <SignIns
                        anonymous={user.anonymous}
                        signIns={user.signIns}
                      />
                      {user.suspendedAtMs !== null && (
                        <span className={badge({ tone: "danger" })}>
                          停止中
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    {user.unanswered > 0 && (
                      <span className={badge({ tone: "danger" })}>
                        {`未返信（${user.unanswered}）`}
                      </span>
                    )}
                  </td>
                  <td className={css({ color: "text.tertiary" })}>
                    <span className={numeric}>{when(user.createdAtMs)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {nextPage === null ? null : (
        <Link
          className={css(button.raw({ variant: "outline" }), {
            alignSelf: "center",
          })}
          to={nextPage}
        >
          次のページ
        </Link>
      )}
    </main>
  );
}
