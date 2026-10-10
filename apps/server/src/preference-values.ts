import { syncLimits } from "@pochical/design/limits";

// What one of a user's preferences may hold (spec/sync-protocol.md,
// Preferences): the server keeps it without reading it, so only its
// length is checked, to syncLimits.preferenceLength.

/** Whether a preference's value is short enough to keep. */
export const fitsPreference = (value: string): boolean =>
  value.length <= syncLimits.preferenceLength;
