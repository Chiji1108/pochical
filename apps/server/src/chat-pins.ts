import { chatRules } from "@pochical/design/chat";

// Which lines of a chat are pinned (spec/chat.md, Pins), as the group
// keeps them and spec/vectors/chat.json pins pins down.

/** What happens to a chat's pins: one line pinned, unpinned or settled. */
export type PinStep = {
  pin?: string;
  unpin?: string;
  unsend?: string;
  settle?: string;
};

/**
 * The pins, the latest first, after `step`, and the one that made room
 * for a new pin. Pinning a pinned line (or settling a pinned poll) only
 * moves it up; one past `most` takes the place of the oldest; taking a
 * pin off or a line back leaves the others.
 */
export const pinStep = (
  pins: readonly string[],
  step: PinStep,
  most: number = chatRules.maxPins
): { pins: string[]; dropped: string | null } => {
  const added = step.pin ?? step.settle;
  if (added !== undefined) {
    const next = [added, ...pins.filter((id) => id !== added)];
    const dropped = next.length > most ? (next.at(-1) ?? null) : null;
    return { dropped, pins: next.slice(0, most) };
  }
  const gone = step.unpin ?? step.unsend;
  return { dropped: null, pins: pins.filter((id) => id !== gone) };
};
