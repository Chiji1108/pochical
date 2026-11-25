import { GROUP_END_NOTICE_HOURS } from "@pochical/design/limits";

const HOUR_MS = 60 * 60 * 1000;

/**
 * When a group's chat says it ends soon and its members are notified
 * (spec/sync-protocol.md, A group's end; spec/vectors/group-end.json,
 * noticeAt): `noticeHours` before its end, or as the end is set (`setAt`)
 * when that is already past, so no end comes without it.
 */
export const endNoticeAt = (
  endsAt: number,
  setAt: number,
  noticeHours: number = GROUP_END_NOTICE_HOURS
): number => Math.max(endsAt - noticeHours * HOUR_MS, setAt);

/**
 * Whether a member is to be notified that the group ends at `endsAt`
 * (spec/sync-protocol.md, A group's end), having last been notified of
 * `told`: unless that end is no later and still to come, so an end moved
 * later, or back and forth, notifies no one again, and one moved sooner
 * than they were told notifies them of the new day.
 */
export const isToldAnew = (
  endsAt: number,
  told: number | null,
  now: number
): boolean => told === null || told <= now || endsAt < told;
