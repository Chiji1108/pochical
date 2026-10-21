import migrations from "../src/group-do-migrations/migrations.js";

// chat_lines as 0035 and 0036 left it: what a line was said by which of
// its columns were set.
const OLD_CHAT_LINES = [
  `CREATE TABLE chat_lines (
    author_id text NOT NULL, created_cursor integer NOT NULL,
    cursor integer NOT NULL, edited integer DEFAULT false NOT NULL,
    op_id text NOT NULL, sent_at integer NOT NULL, seq integer NOT NULL,
    text text NOT NULL, thread_id text NOT NULL,
    unsent integer DEFAULT false NOT NULL, pinned_at integer, days text,
    decided text, poll integer DEFAULT false NOT NULL, preview text,
    hidden_from text, reply_to integer, notice text, device text, photos text,
    PRIMARY KEY(thread_id, seq))`,
  "CREATE UNIQUE INDEX chat_lines_cursor ON chat_lines (cursor)",
  "CREATE UNIQUE INDEX chat_lines_op ON chat_lines (op_id)",
  'CREATE INDEX chat_lines_photos ON chat_lines (thread_id, seq) WHERE "chat_lines"."photos" is not null',
];

/** A line of 全体チャット as those columns kept it; its writer, cursor and op_id by its seq unless given. */
export type OldLine = {
  seq: number;
  authorId?: string;
  cursor?: number;
  opId?: string;
  sentAt?: number;
  text?: string;
  edited?: boolean;
  unsent?: boolean;
  days?: string[];
  poll?: boolean;
  decided?: string;
  preview?: object;
  notice?: object;
  photos?: object[];
  replyTo?: number;
  pinnedAt?: number;
};

const jsonOr = (value: object | undefined): string | null =>
  value === undefined ? null : JSON.stringify(value);

/**
 * Puts chat_lines back as migration `idx` (36 or 37) found it, holding
 * `lines`, with the migrations from `idx` on forgotten, for the Group DO
 * to run them again over those rows.
 */
export const chatLinesBefore = (
  sql: SqlStorage,
  idx: number,
  lines: OldLine[]
): void => {
  const from = migrations.journal.entries.find(
    (entry) => entry.idx === idx
  )?.when;
  sql.exec("DROP TABLE chat_lines");
  for (const statement of OLD_CHAT_LINES) {
    sql.exec(statement);
  }
  sql.exec("DELETE FROM __drizzle_migrations WHERE created_at >= ?", from);
  for (const line of lines) {
    sql.exec(
      `INSERT INTO chat_lines (author_id, created_cursor, cursor, edited, op_id,
        sent_at, seq, text, thread_id, unsent, pinned_at, days, decided, poll,
        preview, reply_to, notice, photos)
      VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, 'group', ?8, ?9, ?10, ?11, ?12,
        ?13, ?14, ?15, ?16)`,
      line.authorId ?? "u1",
      line.cursor ?? line.seq,
      line.edited === true ? 1 : 0,
      line.opId ?? `op-${line.seq}`,
      line.sentAt ?? 0,
      line.seq,
      line.text ?? "",
      line.unsent === true ? 1 : 0,
      line.pinnedAt ?? null,
      jsonOr(line.days),
      line.decided ?? null,
      line.poll === true ? 1 : 0,
      jsonOr(line.preview),
      line.replyTo ?? null,
      jsonOr(line.notice),
      jsonOr(line.photos)
    );
  }
};
