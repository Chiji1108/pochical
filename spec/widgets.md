# Widgets

What the home and lock screen widgets show, and how it is worked out. Both native apps build one entry per day from the person's own shifts and settings (WidgetKit's `TimelineEntry`, Glance's state), and the widget views draw only from that entry. The web prototype's `widgetEntry` in `apps/web/src/lib/design-widgets.ts` follows this spec, and `/design/widgets` shows the views. A day's `time` and `change`, and what 次の休み counts (`offs`), are pinned by `spec/vectors/widgets.json`.

## When an entry is made

- An entry is for one calendar day in the device's time zone and starts at local midnight. The next day's entry is scheduled for the following midnight.
- A new entry is made at once when the person's shifts, patterns or week settings change on the device.
- The widgets show the person's own shifts, with two exceptions picked when editing the widget. 次の休み set to someone from the person's groups, or to a whole group, uses whether each of them is off on each day, and nothing else of their shifts. これから set to someone shows that person's days beside the person's own: each day's pattern (its look, name and hours), whether it is off, and its 早出 and 残業.
- A new entry is also made when the shifts of those picked change.
- Someone picked who is no longer in any of the person's groups, or a group the person left or that was deleted, is read as nobody picked: the widget shows the person's own days until it is edited again, as a reference to something gone is (spec/sync-protocol.md, Deleted values).

## Days

Each day in an entry has:

| Field | Meaning |
| --- | --- |
| `date` | The calendar day. |
| `weekday` | Its day-of-week name (日, 月, … 土). |
| `tone` | `holiday` when it is a national holiday of the device's holiday country (`spec/calendar.md`, The month) and 祝日 coloring is on, or a Sunday and Sunday coloring is on; else `saturday` when it is a Saturday and Saturday coloring is on; else `plain`. |
| `shift` | The pattern entered on that day, if any. |
| `name` | That pattern's name, as the person named it. |
| `time` | The shift's time range (read aloud, not shown), for patterns with a time: the day's own start and end when set, else the pattern's. It is written as `9:00 – 18:00`, dropping a leading zero from the hour. An end at or before the start reads `翌` before it (`16:30 – 翌9:30`). |
| `change` | The changed hours in words, on a day whose hours differ from its pattern's: `早出 {start}〜` when it starts earlier, `残業 〜{end}` when it ends later, else `{start}〜{end}`, for both too: the mark's corners say 早出 and 残業, and the hours alone keep to one line. Absent on an ordinary day. |
| `early`, `late` | 早出 and 残業: the day starts before or ends after the pattern's standard time, counted as the calendar does. |
| `off` | The day's pattern is a day off (休み, 有休). |
| `color` | The pattern's color, whose tint is a day off's tile. |
| `noted` | Whether the day has a memo. The entry carries neither a memo's words nor the day's 一緒に働く人, which the widgets never show (Words only for what changed). |

Days with nothing entered have no `shift`, `name` or `time`. They are shown as nothing entered (予定なし), never as a day off.

## Entry

| Field | Meaning |
| --- | --- |
| `date` | The day the entry is for. |
| `nothingEntered` | The person has entered no day at all yet, as on first opening the app (days from a repeating order count as entered). |
| `today` | That day. |
| `upcoming` | That day and the six days after it, seven days in order. |
| `twoWeeks` | The week that day is in and the week after, fourteen days from the person's week start. |
| `month.first` | The first day of that day's month. |
| `month.weekdays` | The seven day-of-week names in order from the person's week start, each with its tone (Sunday and Saturday coloring only). |
| `month.days` | Whole weeks from the person's week start that cover the month. Each day has `inMonth`, which is false for the days before and after the month. Days outside the month are left empty in the views. |
| `offs.today` | Today is a day off (set to someone or a group: everyone is off). |
| `offs.next` | The next day off after today, with `inDays`, how many days on it is. It looks up to `widgetRules.offLookaheadDays` days ahead and stops at what is entered. Set to someone or a group, only days everyone is off count, and a day anyone has not entered does not. |
| `offs.with` | Who 次の休み is set to: a person's name and picture, or a group's name and mark. |
| `offs.none` | Why nothing is ahead, only when neither today nor any day after is counted: `waiting` with the names of those who have not entered days the person is off and no one who has entered them works; else `apart` when set to someone or a group and the person has entered days; else `notEntered`. |
| `pair` | When これから is set to someone: the person's name and picture, theirs and the shape they draw their marks in, and for each day of `upcoming` their day (absent where they have not entered it) and `together`, both are off. |

## Views

The widgets are views of one entry. They hold no state and open the app on what they show when tapped (Opening the app). There are four kinds; a person picks one from the widget gallery in the sizes it offers.

| Kind | Small (iPhone systemSmall, Android 2×2) | Medium (systemMedium, 4×2) | Large (systemLarge, 4×4) |
| --- | --- | --- | --- |
| シンプル | today alone: its date large (9月24日, no weekday: one day needs none), its mark and any change; a day off by its mark as any day, which says which day off it is (公休, 有給), おやすみ and the poodle being 次の休み's | today and tomorrow side by side, each its date (明日 for tomorrow), its mark and any change; a day off shows its mark as any day does | – |
| 次の休み | how soon the next day off comes, large (明日, else the number with 日後), with its date and mark. When today is off, it is not counted: おやすみ, tomorrow's mark, and the app icon's poodle looking up from the corner. No medium: the answer is one number, and the days off after it are the calendar's and これから's to show | – | – |
| これから | today's mark large beside its date (bold) and any change, the two centered together, over the next three days' weekdays and marks. Today goes without its weekday, as a weather forecast heads now apart from the days it names: it is today. Set to someone: today and tomorrow in columns, theirs under the person's | five days from today, a column each: the weekday over the date, as the calendar heads its columns, so the date sits right over its mark, then the mark large, and only changed hours under it, short enough for a column (`7:00〜` for 早出, `〜20:00` for 残業, `7:00〜20:00` on one line where both moved or for other changes). A memo is the calendar's stroke under its date; a day off is its pattern's tile down the whole column, date and all, as the calendar's day, following 休みを塗る and 休みの見せ方 (空白 leaves it empty, told from a day with nothing entered by that day's dash). The month is written small before today's date alone: a run of five days going into the next month says so plainly (29 30 1). Set to someone: theirs under the person's | – |
| カレンダー | – | `twoWeeks`: this week and the next, seven across from the week start, with days already gone faint and today as its accent date | the month with every day's mark, and today's change if it has one |

**次の休み with someone or a group.** Editing the widget (iOS's ウィジェットを編集 through its App Intent; Android's configuration screen) offers 一緒に休む人: nobody, or from each of the person's groups, in the order the app lists them under the group's name as a heading, the group itself (みんな休み) and then its members, the person aside. Someone in two of the person's groups is listed under each, by the name and picture they have there: people know them by the group they are thinking of, and the same person may be ママ in one group and ゆかり in another. Either gives the same days, which are the same in every group; the choice is kept as the group and the member in it, so the widget shows them by that group's name and picture and a tap opens that group (Opening the app). A choice whose group the person or the member has left says 一緒に休む人を選び直してください (Pick who again), in the secondary color in the middle of its room, rather than turning to another group they share: what the widget shows changes only when the person changes it. On the lock screen the round 次の休み, too small for that, says 未設定 (Unset) in place of its count. With someone picked, the widget is titled 一緒に休める日 with their picture, and counts only days both are off; with a group, it is titled みんな休み, as the group's own screens call a day everyone is off, with the group's mark, and counts only those days. With nothing to show, it says why, from `offs.none`: who it waits on (あやさんの入力待ち, あやさんほか2人の入力待ち), 重なる休みはまだありません, or まだ入っていません. The choice is about what the widget shows, not how it looks; looks follow the app's settings.

**Words only for what changed.** The widgets show marks and, of words, only changed hours. Of a day, a widget says in words only what the person's groups see too, its shift and hours; a memo's words and 一緒に働く人 stay with their owner, as sync never pushes them to groups (`spec/sync-protocol.md`), and a home screen is seen by whoever is beside the phone. A widget shows only that a day has a memo, with the calendar's stroke under its date, and the memo is the app's to show when the day is opened. Should people ask for their memos on their own widgets, it would be theirs to turn on. Words keep to one line under a mark, whatever moved: a day of 早出 and 残業 is its hours alone (7:00〜20:00), and where that is too wide for a column it shrinks, down to 8pt, then goes without its :00 (7〜20). A column's words and their shorter form are pinned in `spec/vectors/widgets.json`; when to write them shorter is each platform's, by measuring. In これから's columns, each weekday sits over its date, in English three capitals (THU): the columns start from today rather than the week's start, so one letter could not tell Tuesday from Thursday. Today's date has no accent, as it is always the first, though a Sunday, Saturday or holiday keeps its color.

**これから with someone.** Editing これから offers 一緒に見る人: nobody, or the members of each of the person's groups, under the group's name, as for 次の休み (without the groups themselves), kept as the group and the member and shown by that group's name and picture; once either has left that group, it says 一緒に見る人を選び直してください (Pick who again). With someone picked, the columns become the group's 週ごと in small: the person's row and theirs, each with their face in a first column as wide as a day's, so the columns keep one rhythm. Their marks are drawn in the shape they chose, in the person's テーマ, as in the group's tables. Days off sit on the group tables' tiles in each cell, and a day both are off joins them down its column into one band. Two rows leave room for one line under a mark, so changed hours there are the first line alone. Names under the marks follow the app's 名前 setting for both rows: whoever puts someone on a widget knows their marks. A day they have not entered shows a dash.

On the iPhone lock screen: circular (today's mark, and 早出 or 残業 on such a day), circular 次の休み (休み, or 一緒 with someone, or みんな with a group, over the count), rectangular (five days from today, as これから's medium, each weekday over its mark, today drawn as the others since it is always the first: the days ahead for anyone, whether or not their hours ever change, a day of 早出 or 残業 showing on its mark's sides as in the calendar and no words; weekdays as これから's (金, or FRI); seven left each day a cramped 23pt; a day off as in the calendar's week, faint where 休みの見せ方 is 空白; no memo stroke, which at this size reads as a line through the weekday) and inline (today's mark and name, after the system's date over the clock, so it reads as the date's own: 10月3日(土) 日勤. No changed hours, which would run past the date's room; 早出 and 残業 show on the mark's sides).

- **Shift names, as the calendar shows them.** With the app's 名前 on, a shift's name is its mark's label, as in the calendar's day: the mark a size smaller, the name small under it in the secondary color (shortened as the calendar's), the two one group in the middle wherever there is room. Where days stand in a row (これから's columns and next three days, the lock screen's five days), a day without a name keeps the name's line, so the marks stay level. A name is never said as words beside a mark the way changed hours are, which sit under the name where there is room for both. Beside someone, a column's one line under each mark holds changed hours, else the name.
- **The mark says the shift, and its hours go unsaid.** A shift's hours are the same every time it comes, so an ordinary day shows its mark alone. Only a day whose hours differ from its pattern's shows words, from the entry's `change`: 早出 7:00〜, 残業 〜20:00, or the hours alone (7:00〜20:00) where both ends moved or for other changes. A day with nothing entered says 予定なし. The lock screen's inline widget is a line of text, so it names the shift (日勤) and leaves the hours to the mark, and the round one says 早出 or 残業 under the mark on such a day. Screen readers always hear the name and the hours.
- **Room differs by platform.** The same size is taller on Android's launcher (4×2 is 341×170dp inside) than on the iPhone (306×126pt). Views read their own size (SwiftUI's widget family, Glance's `LocalSize`) and spend extra height on their own spacing instead of stretching: the two weeks stay centered with larger marks and more space between the weeks, and the large month's marks grow.
- **Words in English.** With 月と曜日 set to English, the widgets write their dates as English does (Thu, Sep 24; Thursday over a large date; FRI over a column of days; the month's own title as the calendar's, sep.) and their few words with them (Today, Tomorrow, Next day off, in 3 days, Day off today); changed hours stay as entered. A word set large where 明日 fits (Tomorrow on 次の休み's small) shrinks to the widget's width rather than running off its edge, and keeps the full size where it fits: SwiftUI's `minimumScaleFactor`, and on Android, where Glance's text does not shrink by itself, a size worked out from `LocalSize`'s width. On the lock screen, the round 次の休み says Off, Together or Everyone over Today, tomorrow's weekday (Fri, as under the small one's おやすみ) or the number, the count kept clear of the round edge (Today a little smaller); 早出, 残業 and 予定なし stay as they are, as on the home screen.
- **Days off** look as they do in the person's calendar, following its 休みを塗る and 休みの見せ方: on a tile of the pattern's own tint (or of the テーマ in ワントーン), or left empty. In the two weeks a day off left empty comes back faint, as in the calendar's week, to tell it from a day with nothing entered.
- **Today's date** is the accent color and heavier where today sits among other days (the two weeks, the month), as in the calendar. Where a view is about today alone, or its first line is always today under today's date (シンプル, これから), today's date is drawn plain. Sunday and holiday dates are red, and Saturday dates are blue, following the person's settings. Where days stand in columns under their weekdays (the two weeks, the month, これから's five days), the weekdays carry Sunday's and Saturday's colors, and of the dates only a holiday's is red, as in the calendar.
- **A day with a memo** has the calendar's stroke under its date (`calendar-note-marker`), on every day シンプル, これから and カレンダー show, under the date or the word standing for the day (明日 in シンプル, the weekday over each of これから's next three days). 次の休み's days, おやすみ included, are about being off, and go without it. A memo's words are not shown. It is the calendar's highlighter in the テーマ's tint on both platforms, as the shift marks keep the テーマ's colors on Android too (`derivation.noteMarkerSteps` in `spec/design-tokens.json`; on a day off's tile it is the tile's color a step deeper). In the system's one-color looks it is faint, as the day-off tiles are. Screen readers hear メモあり after the day.
- **The system's one-color looks.** When the system draws the widget in one color (iPhone 色合い and クリア, and the lock screen), filled shapes become solid blocks. In those looks, day-off tiles are drawn faint instead (SwiftUI: `widgetRenderingMode` other than `fullColor`), and the poodle on a day off is drawn desaturated (`widgetAccentedRenderingMode(.desaturated)`), so its lines stay rather than it turning one white shape.
- **Before anything is entered** (`nothingEntered`), each home screen widget, whatever its kind and size, says only where its days will come from, in the secondary color in the middle of its room: シフトを入れると / ここに出ます (Shifts you enter / show here). No app icon or name: the system shows the app's name under the widget, and Apple's guidance keeps a logo out of it. On the lock screen the rectangular one says the same, the inline one シフトを入れると出ます (Enter shifts to see them) after the date, and the round ones stay as on a day with nothing entered, a dash. Set to someone or a group, it is the same: the person's own days come first.

## Opening the app

A tap opens the app on what the widget shows, so it can be checked there, as a notification opens on what it says (`/design/flows`). A day opens the calendar on its week with that day picked: `pochical://day/{yyyy-mm-dd}`, in the app's own scheme as `pochical://invite/{code}` is. Set to someone or a group, a day opens that group's table at the day instead, where whose days make it count can be seen: `pochical://group/{groupId}/day/{yyyy-mm-dd}`, the group someone was picked under. A widget asking for someone to be picked again opens the group it was set under, at its top (`pochical://group/{groupId}`), where who is in it now can be seen; once the person has left that group themselves, the グループ tab, on the first of their groups, or with none left on its way to start or join one. Picking again is the widget's own editing, which neither platform lets an app open, so the app shows why instead.

| Widget | Opens |
| --- | --- |
| シンプル | small: today. Medium: today or tomorrow, whichever half is tapped |
| 次の休み | the day off it counts (today on a day off), alone in the calendar, set to someone or a group in the group's table; with none ahead, today |
| これから | small: today. Medium: the day of the column tapped. Set to someone: in the group's table |
| カレンダー | the day tapped; elsewhere, today |
| Lock screen | today; the round 次の休み as 次の休み does |

Before anything is entered, every widget opens the calendar on today, where days are entered. On the iPhone a small widget and the lock screen's take one link for the whole widget (WidgetKit's `widgetURL`), and a medium or large one a link for each day (`Link`). Android could set one for every element, but its widgets open the same places as the iPhone's, its small ones as a whole too, so the two behave alike.

## In the widget gallery

Each kind is one widget in the gallery, offering the sizes in the table above; on the iPhone the lock screen's are sizes of the same kinds. Its name and description are what the gallery lists (WidgetKit's `configurationDisplayName` and `description`; Android's `android:label` and `android:description`).

| Kind | Sizes | Name | Description |
| --- | --- | --- | --- |
| シンプル | small, medium; lock screen round (today's mark) and inline | シンプル | 今日のシフトを大きく。中は明日も。 |
| 次の休み | small; lock screen round | 次の休み | 次の休みまであと何日か。一緒に休む人も選べます。 |
| これから | small, medium; lock screen rectangular | これから | 今日からの数日のシフト。一緒に見る人も選べます。 |
| カレンダー | medium, large (Android 4×2, 4×4) | カレンダー | 2週間と、1か月のシフト。 |

What a gallery shows of a kind before it is placed: on the iPhone the person's own entry once they have entered days (WidgetKit's snapshot), else the sample week /design/widgets shows on an ordinary day (ふつう), which is also the placeholder while an entry loads. Android's picker shows the sample, as a generated preview where the launcher supports it (Android 15), else as a picture of it.

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
