# Text limits

How long the free text people type may be, how the fields hold it to that, and how a long value is shown. Both native apps and the server use these numbers. The web prototype's `textLimits` in `apps/web/src/lib/text-limits.ts` and `LimitedInput` in `apps/web/src/components/design-ui.tsx` follow this spec.

## Limits

| Kind | Fields | Limit |
| --- | --- | --- |
| `shiftName` | A shift pattern's name | 8 |
| `personName` | The profile's name, a group's name for you (when joining, creating a group, or in its settings), a coworker's name (in the list, or added from a day) | 20 |
| `groupName` | A group's name, when creating or editing it | 30 |
| `dayNote` | A day's memo | 100 |
| `chatMessage` | A message in a group chat or a one-to-one chat | 1000 |

Every name of a person has the same limit wherever it is typed, so a name that fits in one place fits in all.

Not limited here: a mark's letter, which already takes one character (a shift's) or two (a group's); search fields, which are not kept; and times, which are picked rather than typed.

## Counting

A limit counts characters as a reader sees them: grapheme clusters, the same as Swift's `String.count` and ICU's character `BreakIterator`. An emoji, a flag or a letter with its accent is one character; a full-width and a half-width letter are one each. Lengths are never counted in UTF-16 code units or bytes.

## Fields

- Typing stops at the limit. Pasted text is cut to the limit.
- A word still being converted with a Japanese keyboard (marked text, a composition) may run past the limit until it is confirmed; it is then cut to the limit. A conversion is never broken off halfway.
- While the field is in use, a count `{used}/{limit}` shows after it. For a limit of 30 or less it shows all the while; for a longer one only once 20 or fewer characters are left, so a memo or a message does not carry a count all the while it is written. It turns to the danger color only while a composition runs past the limit.
- A field too small to show the count, like the chip for adding a person to a day, still stops at the limit and shows no count.

## Showing long text

A value within its limit can still be wider than where it is shown.

- A shift's name in a day (the calendar with シフト名 on, a member's month in a group, the saved image and the style samples) is its **day name**: the name itself up to 4 characters, else its first 3 characters and `…` (日勤リーダー → 日勤リ…). A day's row has room for one line under the mark, and a day's whole width for 4 full-width characters. The limit and the day name are separate on purpose: a name up to the limit shows whole in lists, the editor and messages, and only a day shortens it.
- While a pattern's name is longer than its day name, the editor's preview of the pattern says how a day shows it (カレンダーでは「日勤リ…」), so it is not first found cut short on the calendar.
- In the entering tray's buttons a shift's name is one line, cut short with `…` where it does not fit (about five characters do).
- A person's name in a list row is cut short with `…` so the row's value and arrow stay whole.
- Elsewhere text wraps.

## Server

The server rejects a change whose text is over its limit, counted the same way, so a client that does not hold a field to its limit cannot store a longer value. It never cuts the text itself.
