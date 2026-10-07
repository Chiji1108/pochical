# Shift patterns

What a person's shift patterns are and how entering them behaves. The web prototype (`apps/web/src/lib/design-patterns.ts`) follows this; the native apps and `proto/` will too.

## A pattern

Each person has their own list of patterns, in their order. ポチポチ入力 shows its buttons in that order, `PATTERNS_PER_PAGE` to a page (`design/src/limits.ts`).

| Field | Meaning |
| --- | --- |
| `id` | Stable id. A day names its shift by this id. |
| `name` | Shown on buttons, in lists and under marks. |
| `emoji`, `symbol`, `icon`, `color` | The mark, in each of the three looks, and its color slot. |
| `time` | Standard start and end (`HH:MM`). None means all-day. An end at or before the start runs past midnight. |
| `countsAsOff` | Counted among the month's days off and marked as one. |
| `nextDay` | Another pattern entered on the following day too, like 明け after 夜勤. Optional. |

The ready-made patterns, the marks offered first in each look and the words that suggest a mark from a name are shared data in `design/src/patterns.ts`, which `mise run gen` writes out for the native apps (`ReadyPatterns`).

There is no fixed catalogue of pattern kinds: whether a day is off, and what follows it, come only from these fields. The ready-made patterns (日勤, 夜勤, 明け, …) are templates copied into the person's list.

A person's patterns sync between their devices as whole values, each last-writer-wins, and their order as one more (spec/sync-protocol.md, On the wire; `pochical.v1.Pattern`).

## A new pattern's mark

- A pattern made from scratch starts with its mark guessed from its name as it is typed: the first of `lookHints` with a word anywhere in the name gives its emoji and icon, else ⭐️ and the letter icon, and its letter is the name's first character (`spec/vectors/patterns.json`, guessLook). A mark picked by hand, in any look, is never guessed again, and renaming a saved pattern never changes its mark.
- Its color is set once, as it is made: the first palette slot no pattern of the person's uses, else their count of patterns modulo the palette's slots (`spec/vectors/patterns.json`, nextColor). The name never changes it.

## The next day

Entering a pattern with a `nextDay` also enters that pattern on the following day, replacing what was there but keeping that day's note and people. Selection then moves on two days. Selection never moves past the month's last day: entering stays there until 完了, even when the next day it filled is the first of the month after.

It goes **one day only**. The following day's own `nextDay` is never followed, so patterns that name each other (夜勤 → 明け, 明け → 夜勤) are allowed and each entry still fills exactly one extra day. Implementations must not chain.

Any pattern may name any other pattern except itself. Clearing a day does not clear the day after it (`spec/vectors/entering.json`, enter).

## A day's memo

A memo is about the day, not its shift: 歯医者 or 旅行 still holds when the shift goes. Entering, picking or clearing a shift, deleting its pattern, and an order taking a day back all leave the day's memo as it is; only editing the memo changes it, and an empty memo clears it (`spec/vectors/own-days.json`, edited). The day's people and its own hours belong to the shift and go with it.

So a day may hold a memo and no shift. It is blank wherever blanks count (Blanks when entering ends), and its memo still shows on the calendar (spec/calendar.md).

## Blanks when entering ends

Many people leave days off blank, moving on with 翌日へ. Rather than stop them while entering, 完了 asks once about the blank days of the month before its last entered day, and fills them with a day off in one tap. Blanks after the last entered day are left alone: those are more likely not decided yet (`spec/vectors/entering.json`, gaps). Someone with no pattern that counts as off leaves days off blank on purpose, so nothing is asked of them.

## Deleting a pattern

- It goes from the list, and nothing that names it is rewritten: the days that have it, of their own or from a repeating order, keep its id and show empty, counting as blank; their memos and people stay. The person is told how many days before confirming (spec/sync-protocol.md, Deleted values; `spec/vectors/patterns.json`, deleted).
- Other patterns that named it as `nextDay` keep the id and fill nothing on the next day.
- A pattern in the repeating order in use cannot be deleted; the order has to change first.

## Repeating orders

A person may follow a repeating order: a sequence of their patterns laid over the days, without end.

- An order has a `start`, the first day it applies, and an `anchor`, a day that falls on its first shift (the start unless set). Each day takes the sequence's shift counted in whole days from the anchor, backwards too (`spec/vectors/repeat.json`, schedule).
- Orders make a timeline: a day follows the latest order that starts on or before it. A new order (a new rotation, a new job) starts on its day and leaves the days before it to the order before; an order that started on or after that day gives way to it entirely, so the newest order is always the one in use (`spec/vectors/repeat.json`, added). An order with an empty sequence ends repeating: from its start, days are entered by hand, as a roster.
- Days are not written out. A day's shift is worked out from its order whenever it is shown; only what the person changes on a day is kept. A day the person entered, or cleared, wins over its order; a day showing its order's own shift keeps none of its own (`spec/vectors/own-days.json`, edited).
- Starting a new order, or correcting the one in use, clears the days' own pattern and times from its start, so the new order shows there; memos and people stay (`spec/vectors/own-days.json`, givenToOrder).
- Everything that reads days reads them this way, the day's own value, else its order's: the month, counting days off, 次の休み, widgets, reminders and a group's tables.

## Holidays

An order with 祝日は休みにする on puts its `holidayShift` on the national holidays of its `holidayCountry` (`design/scripts/holidays.ts`) in place of the sequence's shift.

- `holidayCountry` is the device's region when the order is made, so every device marks the same days whatever its language.
- Turning it on records the person's first pattern with `countsAsOff` at that moment; with none it cannot be turned on, but it can always be turned off. Turning it off shows the sequence on holidays again.
- Days the person changed keep their own value either way, so nothing they entered is overwritten.
- A new order starts with it on when it reads as office hours: a week (seven shifts) with a pattern counting as off on a Saturday or Sunday (`spec/vectors/repeat.json`, holidaysOffByDefault).

## Changing jobs

The kinds of work はじめの設定 and 新しい仕事にする offer, their ready-made patterns and orders, are shared data in `design/src/patterns.ts` (`rosterTemplates`, `rotationTemplates`). Where an order is shown, its days are tiles as its editor draws them, seven a row; a kind of work without an order shows its patterns as ポチポチ入力's keys will. In 新しい仕事にする the answers are rows of one list, as the settings pages around them are; はじめの設定, with no list around it, shows them as large cards.

The new job's patterns replace the list, and its repeating order starts on the day of the switch. An old pattern still on a day before the switch, of its own or from an earlier order, stays in the list, so those days keep their marks.

A new job's ready-made pattern can share an id with one the person already has. If theirs differs (they renamed it, changed its time or mark…) and is still on a day before the switch, theirs keeps the id and the new job's gets a fresh one; the new order and any `nextDay` links use the fresh id. Past days never change meaning because of a job change (`spec/vectors/patterns.json`, newJob).

## Days everyone is off

In a group, a day everyone is off (みんな休み) is one on which every member's pattern counts as a day off. A day someone has not entered never counts. A month's count also says whether more may yet come: when no one who has entered a day works but someone has not entered it, the group's screens say 未入力の日あり rather than that there are none (`spec/vectors/together.json`).
