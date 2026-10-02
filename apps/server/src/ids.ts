import { syncLimits } from "@pochical/design/limits";

// The ids the apps make (patterns, coworkers, devices) and the icon names
// they use: kept short, and without spaces, since a day's people are
// coworker ids separated by spaces (spec/sync-protocol.md, Coworkers).

const SPACE = /\s/u;

/** Whether the text can be an id: 1 to syncLimits.idLength, no spaces. */
export const isId = (text: string): boolean =>
  text !== "" && text.length <= syncLimits.idLength && !SPACE.test(text);
