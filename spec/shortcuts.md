# Shortcuts

Besides the widgets (spec/widgets.md), the system offers a few of the app's places from outside it: on Android, the launcher's shortcuts, a long press on the app's icon away. On the iPhone, its App Shortcuts (App Intents), offered by Siri, Spotlight, the Shortcuts app and the Action button. Each opens the app on its place as a widget's tap does, and the same names open the same places on both.

| Name | Opens |
| --- | --- |
| 今日のシフト | today, in the calendar on its week with today picked, as a widget's `pochical://day/{yyyy-mm-dd}` opens a day |
| 次の休み | the next day off, today on a day off, the same way: as the 次の休み widget not set to anyone opens it (spec/widgets.md, Opening the app), the first day from today that shows a pattern counting as off, as far as it looks (`offLookaheadDays`); with none ahead, today. `spec/vectors/widgets.json`'s `offs` not set to anyone pin it: the day `expected.today` (0) or else `expected.next`, else today |

Both work out their day as they are used, from the days as the device holds them then (on Android as the app opens the link, on the iPhone as the shortcut runs), so a shortcut never opens a day that has gone by or one off that was changed.

## Android

Each shortcut opens the app by a link of its own, in the app's scheme beside the widgets': `pochical://today` and `pochical://next-off`, which name no date and so never go stale. They are dynamic shortcuts, set each time the app opens, rather than declared in the manifest: the system opens a declared shortcut in a new task, clearing the one open with its pages and anything half written, where a dynamic one comes to the app as it is, as a widget's link does. So they appear once the app has been opened.

## iPhone

Each is an App Shortcut that answers as well as opens, as Siri is asked a question: it says the answer in the words the widgets are read aloud in (spec/widgets.md), shows the day under it (its mark in the person's テーマ and marks, its date, its shift and hours), and brings the app to the front on its place. Both read the widgets' entry, from the database in the App Group and the device's settings, so a shortcut and a widget never disagree. The place 次の休み opens is the one the 次の休み widget's tap opens, worked out by the same function (`WidgetOffs.opensInDays`), which PochicalKit's tests check against the `offs` vectors.

| Name | Phrases (ポチカル is the app's name) | Says |
| --- | --- | --- |
| 今日のシフト | ポチカルで今日のシフト, ポチカルで今日のシフトを教えて, ポチカルの今日のシフト | today as シンプル is read aloud: 今日、10月29日(木)、日勤、9:00 – 18:00 (メモあり on a day with a memo, never its words); before anything is entered, シフトを入れると出ます |
| 次の休み | ポチカルで次の休み, ポチカルで次の休みはいつ, ポチカルの次の休み | as the 次の休み widget is read aloud: 次の休み、3日後、11月1日(日)、公休, 今日 on a day off, or why none is ahead (`offs.none`) |

In the Shortcuts app, 次の休み takes 一緒に休む人 as the widget's editing offers it: someone (一緒に休める日) or a group (みんな休み). It then says those days and opens the group's table at the day, as the widget set so does; one whose group either has left says 一緒に休む人を選び直してください and opens the group's top.

The app's controls, for Control Center, the lock screen and the Action button, open the same places. Like the shortcuts, each works out its day as it is tapped.

| Control | Shows | Opens |
| --- | --- | --- |
| 今日を開く | its name | today |
| 次の休み | the date of the day 次の休み opens (today's on a day off), or why none is ahead | that day, else today |

次の休み's value is the date rather than how soon (3日後): the system keeps a control's value until it asks for it again, and a date stays true as days go by until that day has passed. The app asks for the controls' values again whenever it asks the widgets for new entries (spec/widgets.md, When an entry is made). The controls open the app through the intent ポチカルを開く (今日 or 次の休み), which the Shortcuts app offers too. It is built into the widgets as well as the app, and so is no App Shortcut: the system looks for an App Shortcut's intent in every target that has it. The two App Shortcuts are the app's alone.

The widgets have no buttons of their own (`Button(intent:)`): what they show is read, and acting on a day is the app's, which a tap opens.
