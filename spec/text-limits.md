# Text limits

How the free text people type is held to its limit and how a long value is shown. Both native apps and the server follow it. The web prototype's `LimitedInput` in `apps/web/src/components/design-fields.tsx` and `apps/web/src/lib/text-limits.ts` follow this spec.

## Limits

The limits themselves, by kind of text and with the fields each covers, are `textLimits` in `design/src/limits.ts`, the one place they are written. The web and the server import them; `mise run gen` writes them out as `TextLimits` for iOS (`Limits.swift`) and Android (`Limits.kt`) and under `limits` in `spec/design-tokens.json`.

Not limited here: search fields, which are not kept; and times, which are picked rather than typed.

## Counting

A limit counts characters as a reader sees them: grapheme clusters, the same as Swift's `String.count` and ICU's character `BreakIterator`. An emoji, a flag or a letter with its accent is one character; a full-width and a half-width letter are one each. Lengths are never counted in UTF-16 code units or bytes.

A mark's emoji (a group's, a shift pattern's) is one emoji, as the pickers and the system keyboards give one: exactly one character that starts as a pictograph (`Extended_Pictographic`) or a flag (a regional indicator), or a keycap (1️⃣, #️⃣), which starts with its plain digit or sign. The server refuses any other (`spec/vectors/text.json`, isEmoji).

## Fields

- Typing stops at the limit. Pasted text is cut to the limit.
- A word still being converted with a Japanese keyboard (marked text, a composition) may run past the limit until it is confirmed; it is then cut to the limit. A conversion is never broken off halfway.
- Sending a chat message while a word is still being converted confirms it and sends it with the rest, as Messages and LINE do, cut to the limit as confirming it would.
- While the field is in use, a count `{used}/{limit}` shows after it. For a limit of `textFields.countAlwaysUpTo` or less it shows all the while; for a longer one only once `textFields.countWhenLeft` or fewer characters are left, so a memo or a message does not carry a count all the while it is written. It turns to the danger color only while a composition runs past the limit.
- A field too small to show the count, like the chip for adding a person to a day, still stops at the limit and shows no count. A mark's letter shows none either: the mark beside it already shows what fits.
- A mark's letter takes its first character, so 夜勤 typed or converted there becomes 夜. While it is being written it may be empty; left empty, it goes back to the letter it had.

## Showing long text

A value within its limit can still be wider than where it is shown.

- A shift's name in a day (the calendar with シフト名 on, a member's month in a group, the saved image and the style samples) is its **day name**: the name itself up to `textFields.dayNameLength` characters, else its first `textFields.dayNameLength - 1` characters and `…` (夜勤明け → 夜勤…). `textFields` is in `design/src/limits.ts`. Four full-width characters would fit a day's width, but run to the edges of a day off's tint and the frame round today. The limit and the day name are separate on purpose: a name up to the limit shows whole in lists, the editor and messages, and only a day shortens it.
- In the entering tray's buttons a shift's name is one line, cut short with `…` where it does not fit (about five characters do).
- A person's name in a list row is cut short with `…` so the row's value and arrow stay whole.
- Elsewhere text wraps.

## Server

The server rejects a change whose text is over its limit, counted the same way, so a client that does not hold a field to its limit cannot store a longer value. It never cuts the text itself.
