import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  card,
  code,
  codeStyle,
  Empty,
  numeric,
  page,
  PageHeader,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/actions";

// What Pochical's people did on the admin site, the latest first: who,
// when, what, and to whom (spec/admin.md, 記録).
export const loader = async () => await env.SERVER.actions();

const ACTION_NAMES: Record<string, string> = {
  answer: "返信",
  cleanBucket: "棚卸しの削除",
  removeFromGroup: "グループから外す",
  report: "通報の対応",
  reset: "全消去",
  suspend: "ユーザーの停止",
  unsuspend: "停止の解除",
};

// The page of whom or what each action was done to.
const PAGE_OF: Record<string, (target: string) => string> = {
  answer: (userId) => `/support/${userId}`,
  removeFromGroup: (userId) => `/users/${userId}`,
  report: () => "/reports",
  suspend: (userId) => `/users/${userId}`,
  unsuspend: (userId) => `/users/${userId}`,
};

/** Whom an action was done to, to their page where there is one. */
function Target({ action, target }: { action: string; target: string }) {
  if (target === "") {
    return null;
  }
  const to = PAGE_OF[action]?.(target);
  return to === undefined ? (
    <span className={code}>{target.slice(0, 8)}</span>
  ) : (
    <Link
      className={css(codeStyle, {
        _hover: { textDecoration: "underline" },
        color: "accent.default",
      })}
      to={to}
    >
      {target.slice(0, 8)}
    </Link>
  );
}

export default function Actions({ loaderData: actions }: Route.ComponentProps) {
  return (
    <main className={page}>
      <PageHeader
        description="管理サイトでしたこと。新しい順です。"
        title="記録"
      />
      <div className={card}>
        {actions.length === 0 ? (
          <Empty>記録はまだありません。</Empty>
        ) : (
          <table className={table}>
            <thead>
              <tr>
                <th>日時</th>
                <th>した人</th>
                <th>操作</th>
                <th>対象</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={`${action.atMs}-${action.action}-${action.target}`}>
                  <td className={css({ color: "text.tertiary" })}>
                    <span className={numeric}>{when(action.atMs)}</span>
                  </td>
                  <td>{action.by}</td>
                  <td>{ACTION_NAMES[action.action] ?? action.action}</td>
                  <td>
                    <Target action={action.action} target={action.target} />
                  </td>
                  <td className={css({ color: "text.secondary" })}>
                    {action.detail}
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
