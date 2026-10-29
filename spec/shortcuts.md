# Shortcuts

Besides the widgets (spec/widgets.md), the system offers a few of the app's places from outside it: on Android, the launcher's shortcuts, a long press on the app's icon away. Each opens the app on its place as a widget's tap does. The iPhone's App Shortcuts (App Intents, offered by Spotlight and Siri) are to take the same names and open the same places once they are built.

| Name | Opens |
| --- | --- |
| 今日のシフト | today, in the calendar on its week with today picked, as a widget's `pochical://day/{yyyy-mm-dd}` opens a day |
| 次の休み | the next day off, today on a day off, the same way: as the 次の休み widget not set to anyone opens it (spec/widgets.md, Opening the app), the first day from today that shows a pattern counting as off, as far as it looks (`offLookaheadDays`); with none ahead, today. `spec/vectors/widgets.json`'s `offs` not set to anyone pin it: the day `expected.today` (0) or else `expected.next`, else today |

Both work out their day as the app's screens open them, from the days as the device holds them then, so a shortcut never opens a day that has gone by or one off that was changed.

## Android

Each shortcut opens the app by a link of its own, in the app's scheme beside the widgets': `pochical://today` and `pochical://next-off`, which name no date and so never go stale. They are dynamic shortcuts, set each time the app opens, rather than declared in the manifest: the system opens a declared shortcut in a new task, clearing the one open with its pages and anything half written, where a dynamic one comes to the app as it is, as a widget's link does. So they appear once the app has been opened.
