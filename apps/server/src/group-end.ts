import { GROUP_END_NOTICE_DAYS } from "@pochical/design/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a group's chat says it ends soon (spec/sync-protocol.md, A group's
 * end; spec/vectors/group-end.json, noticeAt): `noticeDays` days of 24
 * hours before its end, or null when the end was set (`setAt`) inside
 * them, as the line of its setting has just said it.
 */
export const endNoticeAt = (
  endsAt: number,
  setAt: number,
  noticeDays: number = GROUP_END_NOTICE_DAYS
): number | null => {
  const at = endsAt - noticeDays * DAY_MS;
  return at > setAt ? at : null;
};
