# Shift patterns

What a person's shift patterns are and how entering them behaves. The web prototype (`apps/web/src/lib/design-patterns.ts`) follows this; the native apps and `proto/` will too.

## A pattern

Each person has their own list of patterns, in their order. ポチポチ入力 shows its buttons in that order, ten to a page.

| Field | Meaning |
| --- | --- |
| `id` | Stable id. A day names its shift by this id. |
| `name` | Shown on buttons, in lists and under marks. |
| `emoji`, `symbol`, `icon`, `color` | The mark, in each of the three looks, and its color slot. |
| `time` | Standard start and end (`HH:MM`). None means all-day. An end at or before the start runs past midnight. |
| `countsAsOff` | Counted among the month's days off and marked as one. |
| `nextDay` | Another pattern entered on the following day too, like 明け after 夜勤. Optional. |

There is no fixed catalogue of pattern kinds: whether a day is off, and what follows it, come only from these fields. The ready-made patterns (日勤, 夜勤, 明け, …) are templates copied into the person's list.

A person's patterns sync between their devices as whole values, each last-writer-wins, and their order as one more (spec/sync-protocol.md, On the wire; `pochical.v1.Pattern`).

## The next day

Entering a pattern with a `nextDay` also enters that pattern on the following day, replacing what was there but keeping that day's note and people. Selection then moves on two days.

It goes **one day only**. The following day's own `nextDay` is never followed, so patterns that name each other (夜勤 → 明け, 明け → 夜勤) are allowed and each entry still fills exactly one extra day. Implementations must not chain.

Any pattern may name any other pattern except itself. Clearing a day does not clear the day after it.

## Deleting a pattern

- The days that have it are cleared too. The person is told how many before confirming.
- Other patterns that named it as `nextDay` lose that link.
- A pattern in the repeating order in use cannot be deleted; the order has to change first.

## Holidays

When a repeating order has 祝日は休みにする on, holidays get the person's first pattern with `countsAsOff`. The order records which pattern that was. Turning the switch off puts back only holidays still showing that recorded pattern, whatever the person's patterns are by then; turning it on uses whichever day-off pattern is first at that moment. With no day-off pattern it cannot be turned on, but it can always be turned off.

## Changing jobs

The new job's patterns replace the list. An old pattern still on a day before the switch stays in the list, so those days keep their marks.

A new job's ready-made pattern can share an id with one the person already has. If theirs differs (they renamed it, changed its time or mark…) and is still on a day before the switch, theirs keeps the id and the new job's gets a fresh one; the new order and any `nextDay` links use the fresh id. Past days never change meaning because of a job change.
