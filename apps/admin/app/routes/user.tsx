import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { ReportTable } from "../report-table";
import { SignIns } from "../sign-ins";
import { staffOf } from "../staff";
import {
  actions,
  actionsStyle,
  alert,
  badge,
  button,
  card,
  code,
  Crumbs,
  dialog,
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

// What Pochical's people do to the user (spec/admin.md, ユーザー), by
// whoever Access let in: suspend them or let them back (suspend=on|off),
// or take them out of a group (removeFrom=groupId); then the page again
// (Post/Redirect/Get).
export const action = async ({ params, request, url }: Route.ActionArgs) => {
  const form = await request.formData();
  const by = staffOf(request);
  const suspend = form.get("suspend");
  const removeFrom = form.get("removeFrom");
  let done: Promise<boolean>;
  if (suspend === "on" || suspend === "off") {
    done = env.SERVER.suspend(params.userId, suspend === "on", by);
  } else if (typeof removeFrom === "string" && removeFrom !== "") {
    done = env.SERVER.removeFromGroup(params.userId, removeFrom, by);
  } else {
    return data(
      { error: "何をするのかが分かりませんでした。" },
      { status: 400 }
    );
  }
  if (!(await done.catch(() => false))) {
    return data({ error: "変えられませんでした。" }, { status: 502 });
  }
  return redirect(url.pathname);
};

const section = css({ display: "flex", flexDirection: "column", gap: "3" });

export default function User({
  actionData,
  loaderData: user,
}: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const suspended = user.suspendedAtMs !== null;
  const name = user.name === "" ? "名前なし" : user.name;
  return (
    <main className={page}>
      <PageHeader
        actions={
          <div className={actions}>
            {user.supportChat === null ? null : (
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
            )}
            {suspended ? (
              <Form method="post">
                <input name="suspend" type="hidden" value="off" />
                <button
                  className={button({ variant: "outline" })}
                  disabled={busy}
                  type="submit"
                >
                  停止を解除
                </button>
              </Form>
            ) : (
              <button
                className={button({ variant: "danger" })}
                command="show-modal"
                commandfor="suspend"
                disabled={busy}
                type="button"
              >
                停止する
              </button>
            )}
          </div>
        }
        crumbs={<Crumbs trail={[{ label: "ユーザー", to: "/users" }]} />}
        description={<span className={code}>{user.userId}</span>}
        title={
          <span
            className={css({ alignItems: "center", display: "flex", gap: "2" })}
          >
            {name}
            {suspended && user.suspendedAtMs !== null && (
              <span className={badge({ tone: "danger" })}>
                {`${when(user.suspendedAtMs)} から停止中`}
              </span>
            )}
          </span>
        }
      />
      {actionData?.error === undefined ? null : (
        <p className={alert} role="alert">
          {actionData.error}
        </p>
      )}
      {/* Closed again once the suspension has loaded the page anew. */}
      <dialog className={dialog} id="suspend" key={String(suspended)}>
        <h2 className={sectionTitle}>このユーザーを停止しますか？</h2>
        <p className={css({ color: "text.secondary" })}>
          すべての端末でログアウトされ、Apple や Google
          でもう一度ログインしようとしても断られます。グループやデータは消えず、停止を解除すれば元どおり使えます。匿名のユーザーは、アプリを入れ直すと別の新しいユーザーとして使えてしまいます。
        </p>
        <Form
          className={css(actionsStyle, { justifyContent: "flex-end" })}
          method="post"
        >
          <input name="suspend" type="hidden" value="on" />
          <button
            className={button({ variant: "outline" })}
            command="close"
            commandfor="suspend"
            type="button"
          >
            キャンセル
          </button>
          <button
            className={button({ variant: "danger" })}
            disabled={busy}
            type="submit"
          >
            停止する
          </button>
        </Form>
      </dialog>
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
                        <span
                          className={css({
                            alignItems: "center",
                            display: "flex",
                            gap: "2",
                          })}
                        >
                          <span className={badge({ tone: "accent" })}>
                            参加中
                          </span>
                          <RemoveFromGroup busy={busy} group={group} />
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

/**
 * グループから外す for one group, asked first: the group's members see
 * 〇〇がグループから外されました, and the user leaves it as if a member took
 * them out.
 */
function RemoveFromGroup({
  busy,
  group,
}: {
  busy: boolean;
  group: { groupId: string; name: string };
}) {
  const id = `remove-${group.groupId}`;
  return (
    <>
      <button
        className={css(button.raw({ variant: "outline" }), {
          height: "7",
          paddingInline: "2.5",
        })}
        command="show-modal"
        commandfor={id}
        type="button"
      >
        外す
      </button>
      <dialog className={dialog} id={id}>
        <h2 className={sectionTitle}>{`「${group.name}」から外しますか？`}</h2>
        <p className={css({ color: "text.secondary" })}>
          グループのチャットに、このグループでのその人の名前で「〇〇がグループから外されました」と出ます。シフトなど、このグループでのその人のものはグループから消えます。また招待されれば、入り直せます。
        </p>
        <Form
          className={css(actionsStyle, { justifyContent: "flex-end" })}
          method="post"
        >
          <input name="removeFrom" type="hidden" value={group.groupId} />
          <button
            className={button({ variant: "outline" })}
            command="close"
            commandfor={id}
            type="button"
          >
            キャンセル
          </button>
          <button
            className={button({ variant: "danger" })}
            disabled={busy}
            type="submit"
          >
            外す
          </button>
        </Form>
      </dialog>
    </>
  );
}
