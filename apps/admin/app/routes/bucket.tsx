import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { data, Form, useNavigation } from "react-router";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { sizeOf } from "../size";
import {
  actions,
  actionsStyle,
  alert,
  badge,
  button,
  card,
  cardStyle,
  code,
  codeStyle,
  dialog,
  Empty,
  meta,
  numeric,
  page,
  PageHeader,
  sectionTitle,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/bucket";

// The photos bucket held up against what names each object (棚卸し): run
// as the page loads, so again after 消す and on 再実行. Only 消す deletes.
export const loader = async () => await env.SERVER.bucketAudit();

export const action = async ({ request }: Route.ActionArgs) => {
  // As of the audit shown, so what passed the grace since stays.
  const form = await request.formData();
  const asOfMs = Number(form.get("asOfMs"));
  if (!Number.isInteger(asOfMs) || asOfMs <= 0) {
    return data({ failed: true as const }, { status: 400 });
  }
  return await env.SERVER.cleanBucket(asOfMs).then(
    (cleanup) => ({ cleanup }),
    () => data({ failed: true as const }, { status: 502 })
  );
};

// The audit runs again after 消す, whether it deleted or failed part way;
// not after an asOfMs refused before anything ran.
export const shouldRevalidate = ({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) =>
  actionStatus === 502 || defaultShouldRevalidate;

type Verdict = Route.ComponentProps["loaderData"]["rows"][number]["verdict"];

const VERDICT_NAMES: Record<Verdict, string> = {
  expired: "期限切れのキャッシュ",
  groupGone: "グループがない",
  notUsual: "いつもの写真ではない",
  recent: "新しいので判定しない",
  referenced: "使われている",
  sentUnnamed: "送信済みだが、どの行にもない",
  takenBack: "取り消し済み",
  unclaimed: "使われなかったアップロード",
  unknown: "サーバーが書かないキー",
  unlinked: "どのプレビューにもない",
  unnoted: "グループに記録がない",
  userGone: "アカウントがない",
};

export default function BucketAudit({
  actionData,
  loaderData: audit,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const cleaning = navigation.formMethod === "POST";
  const total = { bytes: 0, count: 0 };
  for (const { bytes, count } of audit.deletable) {
    total.bytes += bytes;
    total.count += count;
  }
  const cleanup =
    actionData !== undefined && "cleanup" in actionData
      ? actionData.cleanup
      : null;
  return (
    <main className={page}>
      <PageHeader
        actions={
          <div className={actions}>
            {/* A GET of the page is the audit again, with or without JavaScript. */}
            <Form method="get">
              <button
                className={button({ variant: "outline" })}
                disabled={busy}
                type="submit"
              >
                再実行
              </button>
            </Form>
            <button
              className={button({ variant: "danger" })}
              command="show-modal"
              commandfor="confirm"
              disabled={busy || total.count === 0}
              type="button"
            >
              {`${total.count} 件（${sizeOf(total.bytes)}）を消す`}
            </button>
          </div>
        }
        description="写真のバケットを、それぞれを指すものと突き合わせます。棚卸しは読むだけです。"
        title="棚卸し"
      />
      <div
        className={css({
          display: "grid",
          gap: "3",
          gridTemplateColumns: { base: "1fr", md: "repeat(3, 1fr)" },
        })}
      >
        <Stat
          detail={sizeOf(audit.orphans.bytes)}
          label="どこからも指されないもの"
          value={`${audit.orphans.count} 件`}
        />
        <Stat
          detail={`Group DO ${audit.groupsAsked}、User DO ${audit.usersAsked}`}
          label="聞いた持ち主"
          value={`${audit.groupsAsked + audit.usersAsked}`}
        />
        <Stat
          detail={`${audit.graceMs / 3_600_000} 時間以内に置かれたものは判定しません`}
          label="時点"
          value={when(audit.atMs)}
        />
      </div>
      {/* Each audit closes the dialog: a new one starts closed. */}
      <dialog
        className={dialog}
        id="confirm"
        key={audit.atMs}
        onCancel={(event) => {
          if (cleaning) {
            event.preventDefault();
          }
        }}
      >
        <h2 className={sectionTitle}>
          {`${total.count} 件（${sizeOf(total.bytes)}）を消します`}
        </h2>
        <p className={css({ color: "text.secondary" })}>元に戻せません。</p>
        <div className={card}>
          <table className={table}>
            <thead>
              <tr>
                <th>判定</th>
                <th>件数</th>
                <th>容量</th>
              </tr>
            </thead>
            <tbody>
              {audit.deletable.map(({ bytes, count, verdict }) => (
                <tr key={verdict}>
                  <td>{VERDICT_NAMES[verdict]}</td>
                  <td className={numeric}>{count}</td>
                  <td className={numeric}>{sizeOf(bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={meta}>
          {`${VERDICT_NAMES.unknown}と、${audit.graceMs / 3_600_000} 時間以内に置かれたものは残します。グループの写真と自分の写真は、消す前に持ち主にもう一度聞き、その間に使われたものは飛ばします。`}
        </p>
        <Form
          className={css(actionsStyle, { justifyContent: "flex-end" })}
          method="post"
        >
          <input name="asOfMs" type="hidden" value={audit.atMs} />
          <button
            className={button({ variant: "outline" })}
            command="close"
            commandfor="confirm"
            disabled={cleaning}
            type="button"
          >
            キャンセル
          </button>
          <button
            className={button({ variant: "danger" })}
            disabled={cleaning}
            type="submit"
          >
            消す
          </button>
        </Form>
      </dialog>
      {actionData !== undefined && "failed" in actionData && (
        <p className={alert} role="alert">
          消せませんでした。
        </p>
      )}
      {cleanup !== null && (
        <section
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "3",
          })}
        >
          <div>
            <h2 className={sectionTitle}>削除</h2>
            <p
              className={meta}
            >{`${when(cleanup.atMs)} に消しました。失敗したものは、もう一度消すと消せます。`}</p>
          </div>
          <div className={card}>
            <table className={table}>
              <thead>
                <tr>
                  <th>判定</th>
                  <th>消した</th>
                  <th>飛ばした</th>
                  <th>失敗</th>
                </tr>
              </thead>
              <tbody>
                {cleanup.rows.map((row) => (
                  <tr key={row.verdict}>
                    <td>{VERDICT_NAMES[row.verdict]}</td>
                    <td
                      className={numeric}
                    >{`${row.deleted.count} 件、${sizeOf(row.deleted.bytes)}`}</td>
                    <td
                      className={numeric}
                    >{`${row.skipped.count} 件、${sizeOf(row.skipped.bytes)}`}</td>
                    <td className={numeric}>
                      {row.failed.count > 0 ? (
                        <span className={badge({ tone: "danger" })}>
                          {`${row.failed.count} 件、${sizeOf(row.failed.bytes)}`}
                        </span>
                      ) : (
                        `${row.failed.count} 件、${sizeOf(row.failed.bytes)}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section
        className={css({ display: "flex", flexDirection: "column", gap: "3" })}
      >
        <h2 className={sectionTitle}>場所と判定</h2>
        <div className={card}>
          {audit.rows.length === 0 ? (
            <Empty>バケットは空です。</Empty>
          ) : (
            <table className={table}>
              <thead>
                <tr>
                  <th>場所</th>
                  <th>判定</th>
                  <th>件数</th>
                  <th>容量</th>
                  <th>例</th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((row) => (
                  <tr key={`${row.prefix}-${row.verdict}`}>
                    <td className={code}>
                      {row.prefix === "" ? "その他" : row.prefix}
                    </td>
                    <td>
                      <span
                        className={badge({
                          tone: row.orphan ? "danger" : "neutral",
                        })}
                      >
                        {VERDICT_NAMES[row.verdict]}
                      </span>
                    </td>
                    <td className={numeric}>{row.count}</td>
                    <td className={numeric}>{sizeOf(row.bytes)}</td>
                    <td>
                      {row.orphan ? (
                        <details>
                          <summary
                            className={css({
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            })}
                          >
                            {`${row.sample.length} 件`}
                          </summary>
                          <pre
                            className={css(codeStyle, {
                              fontSize: "xs",
                              marginTop: "2",
                            })}
                          >
                            {row.sample.join("\n")}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

/** One figure of the audit: what it is, it, and what it is made of. */
function Stat({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className={css(cardStyle, {
        display: "flex",
        flexDirection: "column",
        gap: "1",
        paddingBlock: "4",
        paddingInline: "5",
      })}
    >
      <span className={meta}>{label}</span>
      <span
        className={css({
          fontSize: "xl",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          letterSpacing: "-0.01em",
        })}
      >
        {value}
      </span>
      <span className={meta}>{detail}</span>
    </div>
  );
}
