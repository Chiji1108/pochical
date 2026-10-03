import { markColors } from "@pochical/design/colors";
import { syncLimits, textLimits } from "@pochical/design/limits";

import { isTime } from "./day-values";
import type { Pattern } from "./gen/pochical/v1/sync_pb";
import { isId, isIdList } from "./ids";
import { fitsText, isEmoji } from "./text-limits";

// What a pattern and the patterns' order may hold (spec/shift-patterns.md),
// checked as the owner's edits arrive.

const fitsTime = (text: string | undefined): boolean =>
  text === undefined || isTime(text);

/** Whether a pattern fits what the apps can show, for the id it has. */
export const fitsPattern = (id: string, pattern: Pattern): boolean => {
  const timed = pattern.start !== undefined || pattern.end !== undefined;
  return (
    fitsText(pattern.name, textLimits.shiftName) &&
    // The mark in each look: one emoji, and 1 to shiftMark letters.
    isEmoji(pattern.emoji) &&
    fitsText(pattern.symbol, textLimits.shiftMark) &&
    isId(pattern.icon) &&
    pattern.color < markColors.length &&
    // Both times or neither.
    (!timed || (pattern.start !== undefined && pattern.end !== undefined)) &&
    fitsTime(pattern.start) &&
    fitsTime(pattern.end) &&
    // Any other pattern, never itself (spec/shift-patterns.md).
    (pattern.nextDay === undefined ||
      (isId(pattern.nextDay) && pattern.nextDay !== id))
  );
};

/** Whether an order of patterns is ids, each once, and not too many. */
export const fitsOrder = (ids: readonly string[]): boolean =>
  isIdList(ids, syncLimits.patterns);
