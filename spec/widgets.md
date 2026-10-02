# Widgets

What the home and lock screen widgets show, and how it is worked out. Both native apps build one entry per day from the person's own shifts and settings (WidgetKit's `TimelineEntry`, Glance's state), and the widget views draw only from that entry. The web prototype's `widgetEntry` in `apps/web/src/lib/design-widgets.ts` follows this spec, and `/design/widgets` shows the views.

## When an entry is made

- An entry is for one calendar day in the device's time zone and starts at local midnight. The next day's entry is scheduled for the following midnight.
- A new entry is made at once when the person's shifts, patterns or week settings change on the device.
- The widgets show the person's own shifts, with two exceptions picked when editing the widget. 次の休み set to someone from the person's groups, or to a whole group, uses whether each of them is off on each day, and nothing else of their shifts. これから set to someone shows that person's days beside the person's own: each day's pattern (its look, name and hours), whether it is off, and its 早出 and 残業.
- A new entry is also made when the shifts of those picked change.

## Days

Each day in an entry has:

| Field | Meaning |
| --- | --- |
| `date` | The calendar day. |
| `weekday` | Its day-of-week name (日, 月, … 土). |
| `tone` | `holiday` when it is a national holiday of Japan and 祝日 coloring is on, or a Sunday and Sunday coloring is on; else `saturday` when it is a Saturday and Saturday coloring is on; else `plain`. |
| `shift` | The pattern entered on that day, if any. |
| `name` | That pattern's name, as the person named it. |
| `time` | The shift's time range (read aloud, not shown), for patterns with a time: the day's own start and end when set, else the pattern's. It is written as `9:00 – 18:00`, dropping a leading zero from the hour. An end at or before the start reads `翌` before it (`16:30 – 翌9:30`). |
| `change` | The changed hours in words, on a day whose hours differ from its pattern's: `早出 {start}〜` when it starts earlier, `残業 〜{end}` when it ends later, `早出・残業 {start}〜{end}` for both, else `{start}〜{end}`. Absent on an ordinary day. |
| `early`, `late` | 早出 and 残業: the day starts before or ends after the pattern's standard time, counted as the calendar does. |
| `off` | The day's pattern is a day off (休み, 有休). |
| `color` | The pattern's color, whose tint is a day off's tile. |
| `note` | The day's note, if any. |

Days with nothing entered have no `shift`, `name` or `time`. They are shown as nothing entered (予定なし), never as a day off.

## Entry

| Field | Meaning |
| --- | --- |
| `date` | The day the entry is for. |
| `today` | That day. |
| `upcoming` | That day and the six days after it, seven days in order. |
| `twoWeeks` | The week that day is in and the week after, fourteen days from the person's week start. |
| `month.first` | The first day of that day's month. |
| `month.weekdays` | The seven day-of-week names in order from the person's week start, each with its tone (Sunday and Saturday coloring only). |
| `month.days` | Whole weeks from the person's week start that cover the month. Each day has `inMonth`, which is false for the days before and after the month. Days outside the month are left empty in the views. |
| `offs.today` | Today is a day off (set to someone or a group: everyone is off). |
| `offs.next` | The next days off after today, up to `widgetRules.nextOffs`, each with `inDays`, how many days on it is. It looks up to `widgetRules.offLookaheadDays` days ahead and stops at what is entered. Set to someone or a group, only days everyone is off count, and a day anyone has not entered does not. |
| `offs.with` | Who 次の休み is set to: a person's name and picture, or a group's name and mark. |
| `offs.none` | Why nothing is ahead, only when neither today nor any day after is counted: `waiting` with the names of those who have not entered days the person is off and no one who has entered them works; else `apart` when set to someone or a group and the person has entered days; else `notEntered`. |
| `pair` | When これから is set to someone: the person's name and picture, theirs and the shape they draw their marks in, and for each day of `upcoming` their day (absent where they have not entered it) and `together`, both are off. |

## Views

The widgets are views of one entry. They hold no state and open the app when tapped. There are four kinds; a person picks one from the widget gallery in the sizes it offers.

| Kind | Small (iPhone systemSmall, Android 2×2) | Medium (systemMedium, 4×2) | Large (systemLarge, 4×4) |
| --- | --- | --- | --- |
| シンプル | today alone: its weekday, its date large, its mark and any change. A day off with nothing changed says おやすみ (as 次の休み does) | today and tomorrow side by side, each the same way, tomorrow under 明日 | – |
| 次の休み | how soon the next day off comes, large (明日, else the number with 日後), with its date and mark. When today is off, it is not counted: おやすみ, tomorrow's mark, and the app icon's poodle looking up from the corner (今日 small does the same on a day off with nothing else to say) | the next three days off, a line each: the date, its mark and how soon, in the secondary color | – |
| これから | today's mark large beside its date (bold) and any change, the two centered together, over the next three days' weekdays and marks. Set to someone: today and tomorrow in columns, theirs under the person's | five days from today, a column each: the weekday over the date, as the calendar heads its columns, so the date sits right over its mark, then the mark large, and only changed hours under it, short enough for a column (`7:00〜` for 早出, `〜20:00` for 残業, both a line each for other changes). A memo is the calendar's stroke under its date; a day off is its pattern's tile down the whole column, date and all, as the calendar's day, following 休みを塗る and 休みの見せ方 (空白 leaves it empty, told from a day with nothing entered by that day's dash). The month is written small before today's date alone: a run of five days going into the next month says so plainly (29 30 1). Set to someone: theirs under the person's | – |
| カレンダー | – | `twoWeeks`: this week and the next, seven across from the week start, with days already gone faint and today as its accent date | the month with every day's mark, and today's change if it has one |

**次の休み with someone or a group.** Editing the widget (iOS's ウィジェットを編集 through its App Intent; Android's configuration screen) offers 一緒に休む人: nobody, one of the person's groups, or anyone in them, the groups listed before the people. With someone picked, the widget is titled 一緒に休める日 with their picture, and counts only days both are off; with a group, it is titled みんな休み, as the group's own screens call a day everyone is off, with the group's mark, and counts only those days. With nothing to show, it says why, from `offs.none`: who it waits on (あやさんの入力待ち, あやさんほか2人の入力待ち), 重なる休みはまだありません, or まだ入っていません. The choice is about what the widget shows, not how it looks; looks follow the app's settings.

**Words only for what changed.** The widgets show marks and, of words, only changed hours. A memo's words and 一緒に働く人 are the app's: a widget shows only that a day has a memo, with the calendar's stroke under its date. In これから's columns, each weekday sits over its date, in English three capitals (THU): the columns start from today rather than the week's start, so one letter could not tell Tuesday from Thursday. Today's date has no accent, as it is always the first, though a Sunday, Saturday or holiday keeps its color.

**これから with someone.** Editing これから offers 一緒に見る人: nobody, or anyone in the person's groups. With someone picked, the columns become the group's 週ごと in small: the person's row and theirs, each with their face in a first column as wide as a day's, so the columns keep one rhythm. Their marks are drawn in the shape they chose, in the person's テーマ, as in the group's tables. Days off sit on the group tables' tiles in each cell, and a day both are off joins them down its column into one band. Two rows leave room for one line under a mark, so changed hours there are the first line alone. Names under the marks follow the app's 名前 setting for both rows: whoever puts someone on a widget knows their marks. A day they have not entered shows a dash.

On the iPhone lock screen: circular (today's mark, and 早出 or 残業 on such a day), circular 次の休み (休み, or 一緒 with someone, or みんな with a group, over the count), rectangular (today and 明日, each with its mark and any change) and inline (today's mark, name and any change).

- **Shift names, as the calendar shows them.** With the app's 名前 on, a shift's name is its mark's label, as in the calendar's day: the mark a size smaller, the name small under it in the secondary color (shortened as the calendar's), the two one group in the middle wherever there is room. Where days stand in a row (これから's columns and next three days), a day without a name keeps the name's line, so the marks stay level. A name is never said as words beside a mark the way changed hours are, which sit under the name where there is room for both. Beside someone, a column's one line under each mark holds changed hours, else the name.
- **The mark says the shift, and its hours go unsaid.** A shift's hours are the same every time it comes, so an ordinary day shows its mark alone. Only a day whose hours differ from its pattern's shows words, from the entry's `change`: 早出 7:00〜, 残業 〜20:00, 早出・残業 7:00〜20:00, or the new hours (9:00〜17:00) for other changes. A day with nothing entered says 予定なし. The lock screen's inline widget is a line of text, so it names the shift (日勤, then any change), and the round one says 早出 or 残業 under the mark on such a day. Screen readers always hear the name and the hours.
- **Room differs by platform.** The same size is taller on Android's launcher (4×2 is 341×170dp inside) than on the iPhone (306×126pt). Views read their own size (SwiftUI's widget family, Glance's `LocalSize`) and spend extra height on their own spacing instead of stretching: the two weeks stay centered with larger marks and more space between the weeks, and the large month's marks grow.
- **Words in English.** With 月と曜日 set to English, the widgets write their dates as English does (Thu, Sep 24; Thursday over a large date; FRI over a column of days; the month's own title as the calendar's, sep.) and their few words with them (Today, Tomorrow, Next day off, in 3 days, Day off today); changed hours stay as entered.
- **Days off** look as they do in the person's calendar, following its 休みを塗る and 休みの見せ方: on a tile of the pattern's own tint (or of the テーマ in ワントーン), or left empty. In the two weeks a day off left empty comes back faint, as in the calendar's week, to tell it from a day with nothing entered.
- **Today's date** is the accent color and heavier where today sits among other days (the two weeks, the month), as in the calendar. Where a view is about today alone, or its first line is always today under today's date (シンプル, これから), today's date is drawn plain. Sunday and holiday dates are red, and Saturday dates are blue, following the person's settings. Where days stand in columns under their weekdays (the two weeks, the month, これから's five days), the weekdays carry Sunday's and Saturday's colors, and of the dates only a holiday's is red, as in the calendar.
- **A day with a memo** has the calendar's stroke under its date (`calendar-note-marker`), on every day シンプル, これから and カレンダー show, under the date or the word standing for the day (明日 in シンプル, the weekday over each of これから's next three days), and on today's date over おやすみ. 次の休み's days are about being off, and go without it. A memo's words are not shown. It is the calendar's highlighter in the テーマ's tint on both platforms, as the shift marks keep the テーマ's colors on Android too (`derivation.noteMarkerSteps` in `spec/design-tokens.json`; on a day off's tile it is the tile's color a step deeper). In the system's one-color looks it is faint, as the day-off tiles are. Screen readers hear メモあり after the day.
- **The system's one-color looks.** When the system draws the widget in one color (iPhone 色合い and クリア, and the lock screen), filled shapes become solid blocks. In those looks, day-off tiles are drawn faint instead (SwiftUI: `widgetRenderingMode` other than `fullColor`).

## Colors

- **iPhone**: the widgets use the person's テーマ in the system's light or dark. In the 色合い (tinted) and クリア (clear) looks, the system recolors them itself.
- **Android**: the ground and words use the wallpaper's colors (Material You), as Glance's default colors do, whatever テーマ the app is in. This matches the widgets around them on the home screen. The ground is `surface`, not Glance's tinted `widgetBackground`: it is nearly white with a faint tint of the wallpaper, like Google's own Digital Wellbeing widget, so the shift colors and the Sunday and Saturday colors stay easy to read on any wallpaper. Today's accent (its date and frame) keeps the テーマ's color, as the marks do: it is one of the calendar's marks, and a wallpaper's color beside a 墨 frame read as a mistake.

  | Role | Light | Dark |
  | --- | --- | --- |
  | Ground (`surface`) | neutral 99 | neutral 10 |
  | Words (`onSurface`) | neutral 10 | neutral 90 |
  | Secondary words (`onSurfaceVariant`) | neutral variant 30 | neutral variant 80 |
  | Lines (`outlineVariant`) | neutral variant 80 | neutral variant 30 |

- On both platforms, the shift marks keep the テーマ's colors and the person's シフトの色 setting, because a mark's color carries its meaning.

Screen readers read every day in the medium and large widgets as its date, weekday, shift name (or 予定なし) and time. The marks alone are pictures.
