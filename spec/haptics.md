# Haptics

Where the native apps tap back under the finger. The web prototype cannot play haptics, so `/design` shows none of this; both native apps follow this list instead.

Haptics are few on purpose. They answer a finger for what the eye cannot follow under it, or for what it did out of sight, and mark the one moment worth feeling: a month filled in. Pochical plays nothing for a celebration beyond that, no confetti or other effect over the screen; the one effect over the lines, a reaction's spray (spec/chat.md, Reactions), answers the tap that chose it.

Both apps use the system's own feedback, which follows the device's own setting for touch haptics, but for a reaction's spray, which plays its own with it (Where). There is no setting of Pochical's own.

## Where

| Moment | iOS | Android |
| --- | --- | --- |
| A button of ポチポチ入力's tray is pressed: a pattern, 消す or 翌日へ. The tray is entered like a keyboard, so every key ticks alike. | `.sensoryFeedback(.selection)` | `HapticFeedbackType.VirtualKey` |
| The save sheet opens by itself because a month has just been filled in, by 完了 or by filling the blank days it asked about. Only then: opening the save menu by hand plays nothing. | `.sensoryFeedback(.success)` | `HapticFeedbackType.Confirm` |
| A photo is saved to Photos (a chat's, the invitation's QR code, the month's picture), or words or a link are copied (a message's コピー, a link's リンクをコピー, the invitation's リンクをコピー). What it made is out of sight, in Photos or on the clipboard, so it is felt as well as said. Only once done: a failure plays nothing. | `.sensoryFeedback(.success)` | `HapticFeedbackType.Confirm` |
| A row is picked up, moved past another and let go, when reordering patterns, people or anything else with handles. | `List`'s `.onMove` plays its own | `GestureThresholdActivate` on pick up, `SegmentFrequentTick` on each move past a row, `GestureEnd` on letting go |
| A chat line dragged sideways to reply reaches `chatRules.replySwipe` (spec/chat.md, Replies): once each time it gets there, so the finger knows letting go answers it. | `UIImpactFeedbackGenerator(style: .light)` | `HapticFeedbackType.GestureThresholdActivate` |
| On a chat line's menu, the finger that opened it slides onto a reaction or a menu item (spec/chat.md, Opening a message's menu): a tick each time one lights up under it. | `.sensoryFeedback(.selection)` | `HapticFeedbackType.SegmentTick` |
| The reader's own reaction sprays its emoji (spec/chat.md, Reactions): put on from a line's menu or by a tap on a pill to join it. The haptic is the spray's own and plays with it, so where nothing sprays nothing plays: taking one's own back, others' reactions coming in, and anything with 視差効果を減らす on. | Pow's `.spray` plays its own, five short pulses, growing, over an eighth of a second | the spray plays `HapticFeedbackType.ToggleOn` as it starts |
| A long press opens a menu: a system one plays its own; a chat line's, which the apps draw themselves (spec/chat.md), plays a light one as it opens. | `.contextMenu` plays its own; a line's: `UIImpactFeedbackGenerator(style: .light)` | `combinedClickable`'s long click plays its own (`hapticFeedbackEnabled`) |

## Where not

- Nothing is played in place of motion left out: with 視差効果を減らす on, what would have moved fades (spec/chat.md, Reduced motion), and the haptics above play as ever, but a reaction's, which is its spray's and goes with it. An action taken from a screen reader (a line's 返信 or its menu, spec/chat.md, Screen readers) plays none of a gesture's haptics, the drag reaching `chatRules.replySwipe` and the long press opening a line's menu, as no gesture was made; the screen reader's own sounds answer it.

- Turning months or pages by a swipe, switching tabs, opening screens and sheets. These are seen, and the OS plays nothing for its own.
- Switches, pickers and segmented controls beyond what the system's own controls play.
- Sending a chat message, saving a form, and errors. What they do is seen on the screen, nothing a finger is not on at that moment buzzes, and a failure is said in words.
