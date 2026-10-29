# Shortcuts

Besides the widgets (spec/widgets.md), the system offers a few of the app's places from outside it: on Android, the launcher's shortcuts, a long press on the app's icon away; on the iPhone, App Shortcuts (App Intents), which Spotlight and Siri offer. Each opens the app on its place as a widget's tap does, the same names on both.

| Name | Opens |
| --- | --- |
| 今日のシフト | today, in the calendar on its week with today picked, as a widget's `pochical://day/{yyyy-mm-dd}` opens a day |
| 次の休み | the next day off, today on a day off, the same way: as the 次の休み widget not set to anyone opens it (spec/widgets.md, Opening the app), the first day from today that shows a pattern counting as off, as far as it looks (`offLookaheadDays`); with none ahead, today |

Both work out their day as the app opens, from the days as the device holds them then, so a shortcut never opens a day that has gone by or one off that was changed.

## Android

The shortcuts are static (`res/xml/shortcuts.xml`, under the launcher's activity), so they are there from the install, before the app first opens. Each opens the app by a link of its own, in the app's scheme beside the widgets': `pochical://today` and `pochical://next-off`. The links name no date, so they never go stale.
