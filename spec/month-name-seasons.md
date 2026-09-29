# おたのしみ: seasons from the month name

The calendar's month name is a button with no chevron. By default a tap opens the month sheet. The カレンダー settings page has 「月名をタップしたとき」: 月を選ぶ (default) or おたのしみ. With おたのしみ, a tap scatters something of the month's season over the screen. The month sheet is not offered then. The setting is there so people who read it find out the name can be tapped at all.

The web prototype (`apps/web/src/components/design-season.tsx`, drawn with canvas-confetti) is the reference. Its numbers are canvas-confetti's, per 60fps frame. Native apps draw the same twelve seasons with their own emitters: `CAEmitterLayer` on iOS, Konfetti (`nl.dionsegijn:konfetti-compose`) on Android. Match the look, not the numbers.

## Rules

- Only in the month view (not while editing, not in the week view).
- With reduced motion (iOS Reduce Motion, Android "Remove animations"), the name opens the month sheet as usual.
- Pieces are drawn over the whole screen, above the calendar and tab bar, below sheets, and never take touches. Tapping again while a season plays adds another round.
- Colors are shift colors (`markColors`, in the viewer's light or dark and the テーマ's vividness). When シフトを色分けする is off, every piece is the テーマ's color.
- Shapes are Phosphor's fill icons, plus our own cherry petal (`apps/web/src/lib/season-shapes.ts`). Draw them at device resolution.
- Pieces fade out over their life, about 1–5 s. The whole season is over within about 5 s.

## The twelve

| Month | Name | Shape | Colors | From | Motion |
| --- | --- | --- | --- | --- | --- |
| 1 | きらきら | sparkle | からし, オレンジ | the month name | three puffs thrown down-right, sinking slowly |
| 2 | 梅 | flower | 赤, ローズ | the month name | two puffs thrown down-right, tumbling as they fall |
| 3 | ちょうちょ | butterfly | すみれ, からし, ラベンダー | the month name | seven let out one by one, fluttering off in different directions, hardly falling |
| 4 | 桜 | petal | ローズ | above the top edge | petals over the whole width, fluttering and swaying as they fall |
| 5 | 若葉 | leaf | テーマ, 青緑 | the left edge | leaves blown across to the right on a breeze |
| 6 | 雨 | drop | 藍, 紺 | above the top edge | fast, straight, upright drops |
| 7 | 天の川 | star | からし, ラベンダー, 紺 | the month name | a stream of stars running down-right across the month |
| 8 | 花火 | circle | 赤, オレンジ, からし, すみれ, 藍 | points over the month | five bursts one after another, each in one color |
| 9 | うさぎ | rabbit | グレー, からし | the left edge, mid-height | four rabbits hopping across in low arcs, one after another |
| 10 | どんぐり | acorn | オレンジ, テラコッタ | above the top edge | acorns dropping quickly, tumbling |
| 11 | 紅葉 | leaf | 赤, オレンジ, からし | above the top edge | leaves tumbling and swaying as they fall |
| 12 | 雪 | snowflake | 藍, ラベンダー, 紺 | above the top edge | slow, upright flakes drifting sideways |

"Tumbling" is canvas-confetti's default 3D flip. The flat ones (sparkle, butterfly, drop, star, circle, rabbit, snowflake) stay upright and do not spin.
