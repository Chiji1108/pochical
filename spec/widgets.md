# Widgets

What the home and lock screen widgets show, and how it is worked out. Both native apps build one entry per day from the person's own shifts and settings (WidgetKit's `TimelineEntry`, Glance's state), and the widget views draw only from that entry. The web prototype's `widgetEntry` in `apps/web/src/lib/design-widgets.ts` follows this spec, and `/design/widgets` shows the views.

## When an entry is made

- An entry is for one calendar day in the device's time zone and starts at local midnight. The next day's entry is scheduled for the following midnight.
- A new entry is made at once when the person's shifts, patterns or week settings change on the device.
- Only the person's own shifts are used. Group members' shifts are never shown in a widget.

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

## Views

The widgets are views of one entry. They hold no state and open the app when tapped. There are three kinds; a person picks one from the widget gallery in the sizes it offers.

| Kind | Small (iPhone systemSmall, Android 2×2) | Medium (systemMedium, 4×2) | Large (systemLarge, 4×4) |
| --- | --- | --- | --- |
| これから | today (date, mark, any change) and the next three days' marks | `twoWeeks`: this week and the next, seven across from the week start, with days already gone faint and today as its accent date | – |
| カレンダー | the month with days off only, as the calendar's day-off tiles | that month beside today, 明日 and the day after, each with its mark and any change | the month with every day's mark, and today's change if it has one |
| 今日の詳細 | today's mark, any change, note and 一緒に働く人 | today large, beside its note (three lines) and 一緒に働く人 | – |

On the iPhone lock screen: circular (today's mark, and 早出 or 残業 on such a day), rectangular (today and 明日, each with its mark and any change) and inline (today's mark, name and any change).

- **The mark says the shift, and its hours go unsaid.** A shift's hours are the same every time it comes, so an ordinary day shows its mark alone. Only a day whose hours differ from its pattern's shows words, from the entry's `change`: 早出 7:00〜, 残業 〜20:00, 早出・残業 7:00〜20:00, or the new hours (9:00〜17:00) for other changes. A day with nothing entered says 予定なし. The lock screen's inline widget is a line of text, so it names the shift (日勤, then any change), and the round one says 早出 or 残業 under the mark on such a day. Screen readers always hear the name and the hours.
- **Room differs by platform.** The same size is taller on Android's launcher (4×2 is 341×170dp inside) than on the iPhone (306×126pt). Views read their own size (SwiftUI's widget family, Glance's `LocalSize`) and spend extra height on their own spacing instead of stretching: the two weeks stay centered with larger marks and more space between the weeks, and the large month's marks grow.
- **Long memos and many people.** A memo is cut at a number of lines: two in the small 今日の詳細 and three in the medium, or four and five where there is room (Android). 一緒に働く人 take one line, written the longest way that fits: every name joined with ・, then fewer names with ほか and how many more (田中・山本 ほか4人), then the count alone (6人). This is SwiftUI's `ViewThatFits`; on Android, measure the text. Screen readers hear every name.
- **Today's date** is the accent color and heavier, as everywhere in the app. Sunday and holiday dates are red, and Saturday dates are blue, following the person's settings.
- **A day with a memo** has the calendar's stroke under its date (`calendar-note-marker`), where each day has its own date and mark: the two weeks of the medium これから and the large カレンダー. The small month's dates sit in day-off tiles and have no room for it, and 今日の詳細 shows the memo itself. On Android the stroke is neutral variant 88 (dark 30); in the system's one-color looks it is faint, as the day-off tiles are. Screen readers hear メモあり after the day.
- **The system's one-color looks.** When the system draws the widget in one color (iPhone 色合い and クリア, and the lock screen), filled shapes become solid blocks. In those looks, day-off tiles are drawn faint instead (SwiftUI: `widgetRenderingMode` other than `fullColor`).

## Colors

- **iPhone**: the widgets use the person's テーマ in the system's light or dark. In the 色合い (tinted) and クリア (clear) looks, the system recolors them itself.
- **Android**: the ground and words use the wallpaper's colors (Material You), as Glance's default colors do, whatever テーマ the app is in. This matches the widgets around them on the home screen. The ground is `surface`, not Glance's tinted `widgetBackground`: it is nearly white with a faint tint of the wallpaper, like Google's own Digital Wellbeing widget, so the shift colors and the Sunday and Saturday colors stay easy to read on any wallpaper.

  | Role | Light | Dark |
  | --- | --- | --- |
  | Ground (`surface`) | neutral 99 | neutral 10 |
  | Words (`onSurface`) | neutral 10 | neutral 90 |
  | Secondary words (`onSurfaceVariant`) | neutral variant 30 | neutral variant 80 |
  | Today's date (`primary`) | primary 40 | primary 80 |
  | Lines (`outlineVariant`) | neutral variant 80 | neutral variant 30 |

- On both platforms, the shift marks keep the テーマ's colors and the person's シフトの色 setting, because a mark's color carries its meaning.

Screen readers read every day in the medium and large widgets as its date, weekday, shift name (or 予定なし) and time. The marks alone are pictures.
