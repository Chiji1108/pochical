// A notification held to the size its push service takes, by construction
// (spec/sync-protocol.md, Push): APNs takes a payload of 4096 bytes, FCM
// as much data. The words a notification carries are cut by characters
// (spec/chat.md), and a character may take many bytes, so the payload is
// measured as each service words it and its words are cut to fit.
import type { Alert } from "./push";

/** The most bytes of a payload APNs takes, and of data FCM takes. */
export const PAYLOAD_BYTES_MAX = 4096;

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });
const encoder = new TextEncoder();

/** `alert` with the argument at `index` of its `part` in place of the one there. */
const withArgument = (
  alert: Alert,
  part: "title" | "body",
  index: number,
  argument: string
): Alert => ({
  ...alert,
  [part]: {
    ...alert[part],
    args: alert[part].args.map((each, at) => (at === index ? argument : each)),
  },
});

/**
 * `alert` with the argument at `index` of its `part` cut to the most
 * characters with which it `fits`, none if even the rest is too large.
 */
const cutArgument = (
  alert: Alert,
  part: "title" | "body",
  index: number,
  fits: (alert: Alert) => boolean
): Alert => {
  const characters = [...graphemes.segment(alert[part].args[index] ?? "")].map(
    ({ segment }) => segment
  );
  const cut = (count: number): Alert =>
    withArgument(alert, part, index, characters.slice(0, count).join(""));
  let [low, high] = [0, characters.length];
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(cut(middle))) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return cut(low);
};
/**
 * `alert` with its words cut, between characters as people see them,
 * until `payload` words it within PAYLOAD_BYTES_MAX: the body's arguments
 * from the last, a message's own words, then the title's, each cut no
 * more than it must be. What is left, ids and keys, always fits.
 */
export const fitted = (
  alert: Alert,
  payload: (alert: Alert) => string
): Alert => {
  const fits = (each: Alert): boolean =>
    encoder.encode(payload(each)).length <= PAYLOAD_BYTES_MAX;
  const places = [
    ...alert.body.args.map((_, index) => ["body", index] as const).toReversed(),
    ...alert.title.args
      .map((_, index) => ["title", index] as const)
      .toReversed(),
  ];
  let fitting = alert;
  for (const [part, index] of places) {
    if (fits(fitting)) {
      return fitting;
    }
    fitting = cutArgument(fitting, part, index, fits);
  }
  return fitting;
};
