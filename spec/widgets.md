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
| `time` | The shift's time range, for patterns with a time: the day's own start and end when set, else the pattern's. It is written as `9:00 – 18:00`, dropping a leading zero from the hour. An end at or before the start reads `翌` before it (`16:30 – 翌9:30`). |
| `early`, `late` | 早出 and 残業: the day starts before or ends after the pattern's standard time, counted as the calendar does. |
| `note` | The day's note, if any. |

Days with nothing entered have no `shift`, `name` or `time`. They are shown as nothing entered (予定なし), never as a day off.

## Entry

| Field | Meaning |
| --- | --- |
| `date` | The day the entry is for. |
| `today` | That day. |
| `upcoming` | That day and the six days after it, seven days in order. |
| `month.first` | The first day of that day's month. |
| `month.weekdays` | The seven day-of-week names in order from the person's week start, each with its tone (Sunday and Saturday coloring only). |
| `month.days` | Whole weeks from the person's week start that cover the month. Each day has `inMonth`, which is false for the days before and after the month. Days outside the month are left empty in the views. |

## Views

The widgets are views of one entry. They hold no state and open the app when tapped.

| Size | iPhone | Android (Pixel 9a launcher) | Shows |
| --- | --- | --- | --- |
| Small | systemSmall | 2×2 | `today`: the date, the mark, its name and time |
| Medium | systemMedium | 4×2 | `today` and the six days after it |
| Large | systemLarge | 4×4 | `month`, with today's shift over it |
| Lock screen | accessoryCircular | – | today's mark and name |
| Lock screen | accessoryRectangular | – | today's name and time, and tomorrow's name |
| Lock screen | accessoryInline | – | today's name and time on one line |

## Colors

- **iPhone**: the widgets use the person's テーマ in the system's light or dark. In the 色合い (tinted) and クリア (clear) looks, the system recolors them itself.
- **Android**: the ground and words use the wallpaper's colors (Material You), as Glance's default colors do, whatever テーマ the app is in. This matches the widgets around them on the home screen.

  | Role | Light | Dark |
  | --- | --- | --- |
  | Ground (`widgetBackground`) | secondary 95 | secondary 20 |
  | Words (`onSurface`) | neutral 10 | neutral 90 |
  | Secondary words (`onSurfaceVariant`) | neutral variant 30 | neutral variant 80 |
  | Today's date (`primary`) | primary 40 | primary 80 |
  | Lines (`outlineVariant`) | neutral variant 80 | neutral variant 30 |

- On both platforms, the shift marks keep the テーマ's colors and the person's シフトの色 setting, because a mark's color carries its meaning.

Screen readers read every day in the medium and large widgets as its date, weekday, shift name (or 予定なし) and time. The marks alone are pictures.
