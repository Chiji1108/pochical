import { readyPatterns } from "@pochical/design/patterns";
import { createContext, useContext } from "react";

import type { Look } from "../components/shift-mark";

// A shift pattern, as the person made it: its name, its mark, its standard
// time, and what it means for the days it is on. Each person has their own
// list, in their order; a day names its pattern by id. Kept apart from the
// calendar so the shift marks can read them without importing it back.
export type Pattern = Look & {
  id: string;
  name: string;
  // Start and end, "HH:MM". Without one it is all-day, with no time to
  // change.
  time?: readonly [string, string];
  // Counted among the month's days off, and marked as one.
  countsAsOff: boolean;
  // Another pattern entered on the following day too, like 明け after 夜勤.
  nextDay?: string;
};

// A pattern's id, as a day names its shift.
export type Shift = string;

// Patterns by id, to look up a day's. A day may name one since deleted.
export type PatternBook = Partial<Record<string, Pattern>>;

// The patterns ポチカル offers ready-made (design/src/patterns.ts), to
// start from or add with a tap. A person's copy keeps the id, so the
// samples can name them.
const presets = readyPatterns;
export type PresetShift = keyof typeof presets;

export const presetPatterns = Object.fromEntries(
  Object.entries(presets).map(([id, preset]) => [
    id,
    { countsAsOff: false, ...preset, id },
  ])
) as Record<PresetShift, Pattern>;

// The ready-made patterns, in the order given.
export function presetList(ids: readonly PresetShift[]): Pattern[] {
  return ids.map((id) => presetPatterns[id]);
}

export function bookOf(list: readonly Pattern[]): PatternBook {
  return Object.fromEntries(list.map((pattern) => [pattern.id, pattern]));
}

// The patterns marks are drawn from: the person's own inside their
// calendar, over the ready-made ones that samples and templates name.
export const PatternsContext = createContext<PatternBook>(presetPatterns);

export function usePatterns() {
  return useContext(PatternsContext);
}

// The person's own patterns in their order, for samples of how their
// calendar would look. A page with no one in view shows ready-made ones.
export const OwnPatternsContext = createContext<readonly Pattern[]>(
  presetList(["day", "night", "after", "off"])
);

// Whether two patterns would show and count a day the same way.
function samePattern(a: Pattern, b: Pattern) {
  return (
    a.name === b.name &&
    a.emoji === b.emoji &&
    a.symbol === b.symbol &&
    a.icon === b.icon &&
    a.color === b.color &&
    a.countsAsOff === b.countsAsOff &&
    a.nextDay === b.nextDay &&
    a.time?.[0] === b.time?.[0] &&
    a.time?.[1] === b.time?.[1]
  );
}

// The patterns after changing jobs (spec/shift-patterns.md, Changing
// jobs): the new job's take over, and an old one still on a day before
// the switch (`usedBefore`) stays, so those days keep their marks. A
// ready-made one the person has changed, still on those days, keeps its
// id; the new job's then comes in under a fresh one (`newId`), which its
// order and next days use.
export function patternsForJob({
  own,
  incoming,
  sequence,
  usedBefore,
  newId,
}: {
  own: readonly Pattern[];
  incoming: readonly Pattern[];
  sequence: readonly Shift[];
  usedBefore: (id: Shift) => boolean;
  newId: () => Shift;
}): { patterns: Pattern[]; sequence: Shift[] } {
  const renamed = new Map<Shift, Shift>();
  for (const pattern of incoming) {
    const theirs = own.find((item) => item.id === pattern.id);
    if (theirs && usedBefore(theirs.id) && !samePattern(theirs, pattern)) {
      renamed.set(pattern.id, newId());
    }
  }
  const renameOf = (id: Shift) => renamed.get(id) ?? id;
  const coming = incoming.map((pattern) => ({
    ...pattern,
    id: renameOf(pattern.id),
    nextDay: pattern.nextDay && renameOf(pattern.nextDay),
  }));
  const kept = own.filter(
    (pattern) =>
      !coming.some((next) => next.id === pattern.id) && usedBefore(pattern.id)
  );
  return { patterns: [...coming, ...kept], sequence: sequence.map(renameOf) };
}

export function isDayOff(pattern: Pattern | undefined) {
  return pattern?.countsAsOff === true;
}
