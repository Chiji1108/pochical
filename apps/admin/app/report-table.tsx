import { css } from "@pochical/styled-system/css";
import { Form, Link } from "react-router";

import {
  actions,
  badge,
  button,
  card,
  code,
  Empty,
  fieldStyle,
  meta,
  numeric,
  table,
} from "./ui";
import { when } from "./when";

const REASON_NAMES: Record<string, string> = {
  explicit: "性的・暴力的",
  harassment: "嫌がらせ",
  impersonation: "なりすまし",
  other: "その他",
  spam: "スパム",
};

type ReportState = "open" | "acted" | "dismissed";

/** Where a report stands, as Pochical's people say it, and its badge's tone. */
const STATES: Record<
  ReportState,
  { name: string; tone: "danger" | "accent" | "neutral" }
> = {
  acted: { name: "対応済み", tone: "accent" },
  dismissed: { name: "問題なし", tone: "neutral" },
  open: { name: "未対応", tone: "danger" },
};

type Report = {
  id: string;
  atMs: number;
  reason: string;
  groupId: string;
  reporterId: string;
  targetId: string;
  context: string;
  state: ReportState;
  note: string;
  handled: { atMs: number; by: string } | null;
};

const userLink = css({
  _hover: { textDecoration: "underline" },
  color: "accent.default",
});

/** A member, by the start of their id, to their page. */
function UserLink({ userId }: { userId: string }) {
  return (
    <Link className={userLink} to={`/users/${userId}`}>
      {userId.slice(0, 8)}
    </Link>
  );
}

/**
 * A report's state, and what Pochical's people noted, by whom and when;
 * with `handling`, a form to set them, sent to the 通報 page's action.
 */
function Handling({ handling, report }: { handling: boolean; report: Report }) {
  const state = STATES[report.state];
  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "1.5" })}
    >
      <span>
        <span className={badge({ tone: state.tone })}>{state.name}</span>
      </span>
      {report.note === "" ? null : (
        <span className={css({ fontSize: "xs", whiteSpace: "pre-wrap" })}>
          {report.note}
        </span>
      )}
      {report.handled === null ? null : (
        <span className={meta}>
          {`${when(report.handled.atMs)}・${report.handled.by}`}
        </span>
      )}
      {handling && (
        <details>
          <summary className={css({ cursor: "pointer", fontSize: "xs" })}>
            対応を記録
          </summary>
          <Form
            action="/reports"
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "2",
              marginTop: "2",
              minWidth: "220px",
            })}
            method="post"
          >
            <input name="reportId" type="hidden" value={report.id} />
            <select
              aria-label="状態"
              className={css(fieldStyle, { paddingBlock: "1.5" })}
              defaultValue={report.state}
              name="state"
            >
              {Object.entries(STATES).map(([value, { name }]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
            <textarea
              aria-label="メモ"
              className={css(fieldStyle, { resize: "vertical" })}
              defaultValue={report.note}
              name="note"
              placeholder="メモ（したこと、判断の理由）"
              rows={2}
            />
            <div className={actions}>
              <button className={button()} type="submit">
                保存
              </button>
            </div>
          </Form>
        </details>
      )}
    </div>
  );
}

/**
 * Reports, those waiting first, then the latest, with what each saw and
 * where it stands: the 通報 page's, which sets their state (`handling`),
 * and a user's page's of what they reported and what was reported of them.
 */
export function ReportTable({
  empty,
  handling = false,
  reports,
}: {
  empty: string;
  handling?: boolean;
  reports: Report[];
}) {
  return (
    <div className={card}>
      {reports.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <table className={table}>
          <thead>
            <tr>
              <th>日時</th>
              <th>理由</th>
              <th>グループ</th>
              <th>通報した人</th>
              <th>対象</th>
              <th>内容</th>
              <th>対応</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td className={css({ color: "text.tertiary" })}>
                  <span className={numeric}>{when(report.atMs)}</span>
                </td>
                <td>
                  <span className={badge({ tone: "danger" })}>
                    {REASON_NAMES[report.reason] ?? report.reason}
                  </span>
                </td>
                <td className={code}>{report.groupId.slice(0, 8)}</td>
                <td className={code}>
                  <UserLink userId={report.reporterId} />
                </td>
                <td className={code}>
                  <UserLink userId={report.targetId} />
                </td>
                <td>
                  <pre
                    className={css({
                      background: "fill.quaternary",
                      borderRadius: "xs",
                      color: "text.secondary",
                      fontSize: "xs",
                      minWidth: "240px",
                      paddingBlock: "2",
                      paddingInline: "2.5",
                    })}
                  >
                    {report.context}
                  </pre>
                </td>
                <td>
                  <Handling handling={handling} report={report} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
