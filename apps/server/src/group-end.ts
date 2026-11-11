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
