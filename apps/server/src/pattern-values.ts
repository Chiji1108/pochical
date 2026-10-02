import { markColors } from "@pochical/design/colors";
import { syncLimits, textLimits } from "@pochical/design/limits";

import type { Pattern } from "./gen/pochical/v1/sync_pb";
import { isId } from "./ids";
import { characterCount, isEmoji } from "./text-limits";

// What a pattern and the patterns' order may hold (spec/shift-patterns.md),
// checked as the owner's edits arrive.

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const isTime = (text: string | undefined): boolean =>
  text === undefined || TIME.test(text);

/** Whether a pattern fits what the apps can show, for the id it has. */
export const fitsPattern = (id: string, pattern: Pattern): boolean => {
  const name = characterCount(pattern.name);
  const timed = pattern.start !== undefined || pattern.end !== undefined;
  return (
    pattern.name.trim() !== "" &&
    name <= textLimits.shiftName &&
    // The mark in each look: one emoji, and 1 to shiftMark letters.
    isEmoji(pattern.emoji) &&
    pattern.symbol.trim() !== "" &&
    characterCount(pattern.symbol) <= textLimits.shiftMark &&
    isId(pattern.icon) &&
    pattern.color < markColors.length &&
    // Both times or neither.
    (!timed || (pattern.start !== undefined && pattern.end !== undefined)) &&
    isTime(pattern.start) &&
    isTime(pattern.end) &&
    // Any other pattern, never itself (spec/shift-patterns.md).
    (pattern.nextDay === undefined ||
      (isId(pattern.nextDay) && pattern.nextDay !== id))
  );
};

/** Whether an order of patterns is ids, each once, and not too many. */
export const fitsOrder = (ids: readonly string[]): boolean =>
  ids.length <= syncLimits.patterns &&
  new Set(ids).size === ids.length &&
  ids.every((id) => isId(id));
