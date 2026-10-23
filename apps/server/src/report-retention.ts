// Reports outlive the accounts they name only so long (spec/sync-
// protocol.md, Deleting an account): a report made by or about someone
// whose account was deleted goes, with its post in Slack, a year after the
// deletion. Reports among people still here stay as they are.
import { and, eq, inArray, lte, notInArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { deletedAccounts, reports } from "./db/schema";
import { eraseReportPost } from "./slack";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after an account's deletion the reports naming it are kept. */
const REPORT_KEPT_MS = 365 * DAY_MS;

/** How often the sweep runs: `triggers.crons` in wrangler.jsonc. */
const SWEEP_EVERY_MS = DAY_MS;

/**
 * The account noted as deleted at `at`, for the reports naming it to go
 * a year after. Noted again, as a deletion cut off part way is run again,
 * it keeps the first time.
 */
export const noteDeletedAccount = async (
  env: Env,
  userId: string,
  at: Date
): Promise<void> => {
  await drizzle(env.DB)
    .insert(deletedAccounts)
    .values({ deletedAt: at, userId })
    .onConflictDoNothing()
    .run();
};

/**
 * Every report naming an account deleted long enough ago erased by `now`'s
 * sweep: those due before the next sweep comes, so none outlives its year.
 * A report's post in Slack goes first, found there by its metadata when
 * the report does not know it; one Slack does not find or delete yet keeps
 * its report, and its account's note, for the next sweep. Run again, it
 * finds nothing more to do.
 */
export const eraseDueReports = async (env: Env, now: Date): Promise<void> => {
  const db = drizzle(env.DB);
  const due = db
    .select({ userId: deletedAccounts.userId })
    .from(deletedAccounts)
    .where(
      lte(
        deletedAccounts.deletedAt,
        new Date(now.getTime() + SWEEP_EVERY_MS - REPORT_KEPT_MS)
      )
    );
  const naming = or(
    inArray(reports.reporterId, due),
    inArray(reports.targetId, due)
  );
  const erasing = await db
    .select({
      createdAt: reports.createdAt,
      id: reports.id,
      slackTried: reports.slackTried,
      slackTs: reports.slackTs,
    })
    .from(reports)
    .where(naming);
  for (const report of erasing) {
    // oxlint-disable-next-line no-await-in-loop -- Slack takes one at a time
    if (await eraseReportPost(env, report)) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await db.delete(reports).where(eq(reports.id, report.id));
    }
  }
  await db
    .delete(deletedAccounts)
    .where(
      and(
        inArray(deletedAccounts.userId, due),
        notInArray(
          deletedAccounts.userId,
          db.select({ id: reports.reporterId }).from(reports)
        ),
        notInArray(
          deletedAccounts.userId,
          db.select({ id: reports.targetId }).from(reports)
        )
      )
    );
};
