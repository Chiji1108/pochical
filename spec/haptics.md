# Haptics

Where the native apps tap back under the finger. The web prototype cannot play haptics, so `/design` shows none of this; both native apps follow this list instead.

Haptics are few on purpose. They answer a finger for what the eye cannot follow under it, and mark the one moment worth feeling: a month filled in. Pochical plays nothing for a celebration beyond that, no confetti or other effect over the screen.

Both apps use the system's own feedback, which follows the device's own setting for touch haptics. There is no setting of Pochical's own.

## Where

| Moment | iOS | Android |
| --- | --- | --- |
| A button of ポチポチ入力's tray is pressed: a pattern, 消す or 翌日へ. The tray is entered like a keyboard, so every key ticks alike. | `.sensoryFeedback(.selection)` | `HapticFeedbackType.VirtualKey` |
| The save sheet opens by itself because a month has just been filled in, by 完了 or by filling the blank days it asked about. Only then: opening the save menu by hand plays nothing. | `.sensoryFeedback(.success)` | `HapticFeedbackType.Confirm` |
| A row is picked up, moved past another and let go, when reordering patterns, people or anything else with handles. | `List`'s `.onMove` plays its own | `GestureThresholdActivate` on pick up, `SegmentFrequentTick` on each move past a row, `GestureEnd` on letting go |
| A long press opens a menu, as on a chat message (spec/chat.md). | `.contextMenu` plays its own | `combinedClickable`'s long click plays its own (`hapticFeedbackEnabled`) |

## Where not

- Turning months or pages by a swipe, switching tabs, opening screens and sheets. These are seen, and the OS plays nothing for its own.
- Switches, pickers and segmented controls beyond what the system's own controls play.
- Sending a chat message, a reaction, saving, and errors. Nothing a finger is not on at that moment buzzes, and a failure is said in words.
