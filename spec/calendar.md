# Calendar

How カレンダー, the person's own month, behaves on screen: what each part shows, when, and what a tap does. The logic it runs on is spec/shift-patterns.md's, pinned by spec/vectors; this is what a screen adds around it, so every platform's screen does the same. /design's calendar (`apps/web/src/components/design-calendar.tsx` and its parts) shows it.

## The month

- A page a month, turned by swiping. 今月 is offered in the heading while another month is shown, and brings this month back.
- The heading follows the pages as they move, by a finger or on their own: the month rolls within its line toward the one coming in, the next up from below and the one before down from above, and the year only when it changes; 今月 (今週 in a day's week) fades in as the pages leave this month and out as they come back to it. With reduced motion the names just change.
- Each page keeps room for six weeks, the most a month spans, so what is under the grid stays put as months turn. The days of the months around it show faded, with what they hold.
- Today is framed inside its day, and its date drawn in the accent. While entering (ポチポチ入力), the frame gives way to the day being entered; the accent date stays.
- The day being entered, or the day opened, is framed in the accent, more strongly than today.
- A day with a memo has a highlighter stroke under its date, shift or not (spec/shift-patterns.md, A day's memo).
- Today moves on at midnight while the screen is open.
- Marks are drawn in the person's スタイル (設定, kept on the device): icons filled or outlined, emoji, or letters on a tile; and for each shape its own options, kept as each was left: the shift's name under its mark, days off on a tint of their color, and days off left blank (休みの見せ方 空白), which come back faint while entering and in a day's week, where they are what is being looked at.
- The screens are drawn in the person's テーマ (設定 > スタイル, kept on the device), in light or dark as 外観 says (the phone's by default, or always one of them), but for the テーマ drawn dark whatever 外観 says, which turns the screens dark. シフトの色 ワントーン draws every shift in the テーマ's own color, the palette's first; emoji keep theirs.
- スタイル shows this week and the next in the look being set, and each テーマ on a card; カレンダー shows this week under the month's heading. Their days are a made-up run of the person's own patterns (each working one with what follows it, like 明け after 夜勤, and a day off after every second one), the same whatever they have entered, so a change shows in the same places every time; no memo, 早出 or 残業 shows there. ☀︎ / ☾ on the preview's edge shows it and the テーマ cards in the other of light and dark, without touching 外観; a テーマ drawn dark keeps its preview dark, its ☾ on and not to be turned. Every preview of the calendar has its own ☀︎ / ☾, and no other place does.
- The week starts on the day the person sets (設定 > カレンダー, kept on the device). Saturdays and Sundays color the weekdays' heading and holidays their date, in Sunday's red, each unless the person turns it off.

## ポチポチ入力

- ポチポチ入力 starts entering on the month's first blank day, the 1st when none is blank. A month swiped to while entering starts on its first blank day the same way; a day tapped is entered next, turning to its month when it is one of the months around.
- The tray holds the day being entered, a button for each pattern in the person's order (pages of `PATTERNS_PER_PAGE` past that many, `design/src/limits.ts`), 消す and 翌日へ. 消す is offered only when the day has a shift, and 翌日へ only before the month's last day.
- A pattern entered moves the selection on as spec/shift-patterns.md (The next day) has it.
- 消す clears the day's shift, with its own hours and people; its memo stays (spec/shift-patterns.md, A day's memo). The tray is a keyboard, so it asks nothing.
- 完了 ends entering, then asks about the month's blank days before its last entered one (spec/shift-patterns.md, Blanks when entering ends): how many, how the month's days off change, that the month is then complete when no blank would be left, which days, and one button to fill them. Closing it leaves them blank, by the sheet's own close (× on iOS, with nothing else to say the same). With more than one pattern that counts as off, chips pick which; the first is picked to begin with. While days off are shown, 休みの日は空白で見せる is offered beside it, for those who would rather leave them blank. With no pattern that counts as off, nothing is asked.

## A day's detail

- Tapping a day, while not entering, opens it: the month folds to its week, the day framed, and the day's detail shows under it. The month folds as one sheet, as the Calendar apps' does: it moves up to bring the week to the top while its other weeks fade, and unfolds back the same way, the detail going at once. The month shown stays while the week is one of its rows, a faded day's too.
- Another day of that week can be tapped, and ‹ and › beside the day's date open the day before and after, past a week's end too, so days can be gone through one after another. Swiping moves a week, the weeks before and after sliding in with the finger as the months do, and opens the same weekday a week on or back once it settles; 今週 is offered while another week is open. Pulling the week down unfolds the month again, as × in the heading does, the month following the finger: let go past a third of the way, or flicked down, it unfolds, else it folds back.
- シフト is picked from the person's patterns. Picking another keeps the day's memo and people, as entering does. A day with no shift shows なし.
- 時間 shows for a pattern with hours: the day's own start and end, each kept only where it differs from the pattern's, with the change said in words (早出, 残業, else 変更済み), and 標準に戻す while it differs.
- 一緒に働く人 shows for a pattern that does not count as off, naming those on the day (なし for none). How they are picked follows each platform's own way of choosing several: on Android and /design it unfolds into the person's coworkers as filter chips, in their order, picked or not, and 追加, staying unfolded as another day is opened, for noting people day after day; on iOS the row opens the coworkers as a list to check them in, as the Clock app's 繰り返し picks days, with 人を追加… at its foot and 完了. Either adds while under `COWORKERS_MAX`, else says 一緒に働く人は{n}人までです; someone added there goes to the end of the list and is on the day too.
- The memo can be written on any day, shift or not, up to `textLimits.dayNote`, and is kept as text fields are (below). While it holds words, a clear button in the field empties it at once and keeps that, as a one-line field's does: the memo alone goes, the shift stays.
- この日のシフトを消す, with a shift, clears it with its own hours and people; the memo stays. When a time change or people would go with it, it asks first and names them: 「一緒に働く人も消えます。」.

## Text fields

Free text (a day's memo, a name) is kept when the field is left, its screen closes or the app goes to the background, not on each change, so a memo typed is one edit in the outbox (spec/sync-protocol.md, Outbox) rather than one a letter.
