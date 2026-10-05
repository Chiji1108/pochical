# Calendar

How カレンダー, the person's own month, behaves on screen: what each part shows, when, and what a tap does. The logic it runs on is spec/shift-patterns.md's, pinned by spec/vectors; this is what a screen adds around it, so every platform's screen does the same. /design's calendar (`apps/web/src/components/design-calendar.tsx` and its parts) shows it.

## The month

- A page a month, turned by swiping. 今月 is offered in the heading while another month is shown, and brings this month back.
- Each page keeps room for six weeks, the most a month spans, so what is under the grid stays put as months turn. The days of the months around it show faded, with what they hold.
- Today is framed inside its day, and its date drawn in the accent. While entering (ポチポチ入力), the frame gives way to the day being entered; the accent date stays.
- The day being entered, or the day opened, is framed in the accent, more strongly than today.
- Today moves on at midnight while the screen is open.

## ポチポチ入力

- ポチポチ入力 starts entering on the 1st of the month shown. A month swiped to while entering starts on its 1st; a day tapped is entered next, turning to its month when it is one of the months around.
- The tray holds the day being entered, a button for each pattern in the person's order (pages of `PATTERNS_PER_PAGE` past that many, `design/src/limits.ts`), 消す and 翌日へ. 消す is offered only when the day has a shift, and 翌日へ only before the month's last day.
- A pattern entered moves the selection on as spec/shift-patterns.md (The next day) has it.
- 消す clears the day whole, its memo and people too, as `spec/vectors/entering.json` has it: the tray is a keyboard, and a cleared day is entered again with one tap. This differs on purpose from a day's detail, which asks first (below).
- 完了 ends entering, then asks about the month's blank days before its last entered one (spec/shift-patterns.md, Blanks when entering ends): how many, how the month's days off change, which days, and one button to fill them with the person's first pattern that counts as off.
- With no pattern that counts as off, filling first adds the ready-made 休み to the end of the person's patterns, without asking. At `syncLimits.patterns` patterns nothing can be added, so the blanks are not asked about.

## A day's detail

- Tapping a day, while not entering, opens it: the month folds to its week, the day framed, and the day's detail shows under it. Another day of that week can be tapped. The pages do not turn while a day is open. × in the heading closes it.
- シフト is picked from the person's patterns. Picking another keeps the day's memo and people, as entering does. A day with no shift shows なし.
- 時間 shows for a pattern with hours: the day's own start and end, each kept only where it differs from the pattern's, with the change said in words (早出, 残業, else 変更済み), and 標準に戻す while it differs.
- 一緒に働く人 shows for a pattern with hours too, a shift someone works alongside; a day off or 明け has nobody to note. It unfolds into the person's coworkers, in their order, picked or not, and 追加 while under `COWORKERS_MAX`. Someone added there goes to the end of the list and is on the day too.
- The memo is kept as text fields are (below), up to `textLimits.dayNote`.
- この日のシフトを消す clears the day at once when it holds nothing more than its shift. When a time change, people or a memo would go with it, it asks first and names them: 「一緒に働く人、メモも消えます。」.

## Text fields

Free text (a day's memo, a name) is kept when the field is left or its screen closes, not on each change, so a memo typed is one edit in the outbox (spec/sync-protocol.md, Outbox) rather than one a letter.
