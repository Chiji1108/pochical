import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { Form, Link, redirect } from "react-router";

import { SignIns } from "../sign-ins";
import {
  badge,
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
// what ?q= holds; one found alone opens their page, as ⌘K jumps to them.
export const loader = async ({ url }: Route.LoaderArgs) => {
  const query = url.searchParams.get("q")?.trim() ?? "";
  const users = await env.SERVER.users(query);
  const [only] = users;
  if (query !== "" && users.length === 1 && only !== undefined) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router's redirect
    throw redirect(`/users/${only.userId}`);
  }
  return { query, users };
};

export default function Users({
  loaderData: { query, users },
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
                    <SignIns
                      anonymous={user.anonymous}
                      signIns={user.signIns}
                    />
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
    </main>
  );
}
