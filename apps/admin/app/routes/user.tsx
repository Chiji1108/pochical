import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { data, Link } from "react-router";

import { ReportTable } from "../report-table";
import { SignIns } from "../sign-ins";
import {
  badge,
  button,
  card,
  code,
  Crumbs,
  Empty,
  numeric,
  page,
  PageHeader,
  sectionTitle,
  Stat,
  stats,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/user";

// One user: their account, the groups they are in, their chat with
// Pochical's people, and what they reported and what was reported of them.
export const loader = async ({ params }: Route.LoaderArgs) => {
  const user = await env.SERVER.user(params.userId);
  if (user === null) {
    // React Router answers a loader's thrown response as the page's error.
    // oxlint-disable-next-line typescript/only-throw-error
    throw data("アカウントがありません", { status: 404 });
  }
  return user;
};

const section = css({ display: "flex", flexDirection: "column", gap: "3" });

export default function User({ loaderData: user }: Route.ComponentProps) {
  return (
    <main className={page}>
      <PageHeader
        actions={
          user.supportChat === null ? null : (
            <Link
              className={button({ variant: "outline" })}
              to={`/support/${user.userId}`}
            >
              サポートのチャット
              {user.unanswered > 0 && (
                <span className={badge({ tone: "danger" })}>
                  {`未返信 ${user.unanswered}`}
                </span>
              )}
            </Link>
          )
        }
        crumbs={<Crumbs trail={[{ label: "ユーザー", to: "/users" }]} />}
        description={<span className={code}>{user.userId}</span>}
        title={user.name === "" ? "名前なし" : user.name}
      />
      <div className={stats}>
        <Stat
          detail={<SignIns anonymous={user.anonymous} signIns={user.signIns} />}
          name="登録"
          value={when(user.createdAtMs)}
        />
        <Stat
          detail={`プッシュ通知 ${user.pushTokens} 台`}
          name="サインイン中の端末"
          value={`${user.sessions} 台`}
        />
        <Stat
          detail={`通報した ${user.reportsByCount}、された ${user.reportsAboutCount}`}
          name="グループ"
          value={`${user.groups.filter((group) => group.leftAtMs === null).length}`}
        />
      </div>
      <section className={section}>
        <h2 className={sectionTitle}>グループ</h2>
        <div className={card}>
          {user.groups.length === 0 ? (
            <Empty>グループに入っていません。</Empty>
          ) : (
            <table className={table}>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>グループ</th>
                  <th>参加</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {user.groups.map((group) => (
                  <tr key={group.groupId}>
                    {/* Whole on a narrow screen: the table scrolls instead. */}
                    <td className={css({ whiteSpace: "nowrap" })}>
                      {group.name}
                    </td>
                    <td className={code}>{group.groupId.slice(0, 8)}</td>
                    <td className={css({ color: "text.tertiary" })}>
                      <span className={numeric}>{when(group.joinedAtMs)}</span>
                    </td>
                    <td>
                      {group.leftAtMs === null ? (
                        <span className={badge({ tone: "accent" })}>
                          参加中
                        </span>
                      ) : (
                        <span className={badge()}>
                          {`${when(group.leftAtMs)} に退出`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <section className={section}>
        <h2 className={sectionTitle}>
          {`通報されたもの（${user.reportsAboutCount}、新しい 200 件まで）`}
        </h2>
        <ReportTable empty="通報されていません。" reports={user.reportsAbout} />
      </section>
      <section className={section}>
        <h2 className={sectionTitle}>
          {`通報したもの（${user.reportsByCount}、新しい 200 件まで）`}
        </h2>
        <ReportTable empty="通報していません。" reports={user.reportsBy} />
      </section>
    </main>
  );
}
