# Chat

How chat messages behave beyond sync (spec/sync-protocol.md): which words are links and mentions, how a link's preview is made, when a mention notifies, editing and unsending, and reporting and blocking. Both native apps and the server follow it. The web prototype's `textParts` in `apps/web/src/lib/chat-text.ts` (tested in `apps/web/tests/chat-text.test.ts`) and the chat in `/design` follow this spec.

## Opening a message's menu

A long press on a message (the system's context-menu press: `.contextMenu` on iOS, `combinedClickable`'s long click on Android; a right click on the web) opens its reactions and menu, as LINE and iMessage do. A tap is the message's own: a link or a mention opens, a photo opens large, a shared day or a poll's head does nothing. So scrolling past a line never opens its menu by accident. A long press on a link opens the link's menu instead. With a keyboard or a screen reader, activating the message opens its menu (a photo's activation opens it large; its menu is in the screen reader's actions).

## What is a link

- A link starts with `http://` or `https://` (any case) and runs over the characters a URL is written in (ASCII letters, digits and `-._~:/?#[]@!$&'()*+,;=%`). Any other character ends it, so Japanese written right after a link is not part of it: in `https://example.jp/ここどう？` the link is `https://example.jp/`.
- `.,!?:;'*` at its end belong to the sentence, not the link. So does a closing `)` or `]` with no opening one inside the link (`(https://example.jp)` → `https://example.jp`; `https://example.jp/A_(B)` keeps its bracket).
- A link needs a host; `https://` alone is not one.
- Addresses without a scheme (`example.jp`, `www.example.jp`), mail addresses and phone numbers are not links. Both apps use this rule instead of the platform's own detectors (`NSDataDetector`, `Linkify`), which find different things, so a message has the same links on every phone.

## In a message

- Links are underlined; in others' messages in the accent color, in one's own in the bubble's text color.
- A tap on a link opens it in the system's browser sheet over the chat (`SFSafariViewController`, Custom Tabs).
- A long press on a link (or a right click) opens the link's own small menu under it, リンクを開く and リンクをコピー, as iOS offers on a link in text; the message's menu stays shorter without a link item.

## Previews

A message carries at most one preview, for its first link. It is made while the message is written and sent with it, so everyone sees the same preview and receivers never fetch the page.

- While writing, once the first link has stayed the same for 0.4 seconds, the app asks the server for its preview and shows it above the composer: the site's name, the title (読み込み中… until it arrives) and the picture small at the end, with × to send without it. × holds for that link until the message is sent or the link changes.
- A message sent before its preview arrives goes without one. If the server finds no page, nothing is shown above the composer.
- In the chat, the preview sits inside the message's bubble, under its words: the picture (cropped to 1.91:1), the title (two lines at most) and the site's name. A tap opens the link; a long press opens the message's reactions and menu.

## Pochical's invitation links

A link to `https://pochical.app/invite/{code}` (the host in any case, an optional trailing `/`, query and fragment ignored; `inviteCodeOf` in `apps/web/src/lib/chat-text.ts`) is one of Pochical's own invitations. The chat treats it as part of the app, not as a page:

- A tap on it, in the words or on its card, opens the group's join screen in the app, as reading its QR code does; when you are in the group already, it opens the group. Nothing opens in the browser, and nothing joins until you confirm on the join screen.
- Its card shows the group instead of a page: the group's mark at the hub's size on a tint, its name, and グループへの招待・{n}人 (参加中のグループ once you are in it). A long press opens the message's actions, as on a page's card.
- The card is not made while writing or sent with the message. Each app asks the server's `InviteService.GetInvitePreview` as the message shows, so a link that was remade or whose group was deleted turns into この招待は使えません for everyone, and a renamed group shows its new name. That card opens nothing; a tap on the link's words says the link cannot be used.
- Nothing is shown above the composer for it, and it takes the place of the message's one preview: a message whose first link is an invitation shows no page for later links.

## Reading a page

The server reads the page, so that people's addresses are not sent to the sites, and so both apps get the same result.

- The title is the page's `og:title`, else its `<title>`; the site's name is `og:site_name`, else the host without `www.`; the picture is `og:image`. A page with neither title gives its address without the scheme as the title.
- Only `http` and `https` on ports 80 and 443, to hosts that resolve to public addresses (no private, loopback or link-local ranges, checked again after each redirect). At most 3 redirects, 5 seconds, and the first 512 KB of HTML.
- The picture is fetched by the server, shrunk and stored with the preview, and served from Pochical's own storage, so it keeps showing after the site changes or removes it.
- Previews are cached by URL for a day.

## Mentions

A mention names one member of the group in a group chat (全体チャット). One-to-one chats have none.

- A message keeps a mention as `<@id>`, the member's id in the group, and shows it as @ and their name in the group as it is when read, so a later name change shows the new name. Copying a message, a chat's last line in the list, a quote and a notification show the same @name as plain words. A member who has left keeps their last name.
- While writing, an `@` at the end of the message lists the other current members whose name contains what follows it. Picking one writes `@name` and a space; only those picked become mentions when the message is sent, and only while `@name` is still followed by a space or the end. Typing a name by hand mentions no one.
- In a message, a mention is in the name's weight, in others' messages in the accent color; one of the reader looks the same, as the chat list's @ is what finds it. A tap on a mention opens that member's profile, except the reader's own.
- There is no mention of everyone: a group chat's line already reaches everyone, and a member who turned it off chose quiet.

### Notifications

- A group chat turned off sends no notifications, except for a line that mentions the reader, which notifies as if the chat were on. The chat notification settings say so under the group chats' switches, and so does a group's own 通知.
- メンションはいつも通知 (設定 › チャット › メンション, on by default) turns that exception off: off, a chat turned off sends nothing, mentions included, and the notes are not shown. It is one switch for the account, kept by the User DO, not one per group.
- In the chat list, a chat whose unread lines mention the reader shows @ in the accent color before the unread count.

## Editing and unsending

A member can change or take back their own messages, at any time. Others' messages cannot be changed.

- **編集** (text messages only): the message's words go back into the composer, its mentions as @name again, under a bar saying メッセージを編集 with × to stop. The send button becomes ✓ and the photo and day tools are hidden: only the words change. Saving replaces the words for everyone and marks the message 編集済み, shown over its time (on one line with a pin, when it is pinned). A message cannot be saved empty; taking it back is 送信取消. The link's page stays while its first link does; a new first link gets a new preview.
- **送信取消** (any of one's own messages: words, photos, shared days): asked first in a centered alert (送信を取り消しますか？ / メンバー全員のチャットから消えます。 / キャンセル | 取り消す). The message's content and reactions are removed for everyone; in its place a line in the middle says 〇〇がメッセージの送信を取り消しました (メッセージの送信を取り消しました for one's own). A reply that quoted it shows 取り消されたメッセージ, and the chat list's last line says the same as the line.
- In the message's menu, 編集 comes after the other actions and 送信取消 last, apart and in the danger color.
- Neither sends a notification, and neither changes unread counts. Both go through the change log as edits (spec/sync-protocol.md).

## Reporting and blocking

The stores require a way to report what people post and to block someone (App Store Review Guideline 1.2; Google Play's user-generated content policy). Neither is shown to the member concerned, and neither changes anything for the rest of the group.

- **通報** is in the menu of someone else's message (last, apart and in the danger color) and in the ⋯ menu of their profile sheet. A sheet asks the reason, one of 迷惑・スパム / 嫌がらせ・いじめ / 性的・暴力的な内容 / なりすまし / その他, and sends it with ✓. Then a centered alert says 通報しました and offers to block them too (〇〇をブロックしますか？… / しない | ブロック), unless they are already blocked; otherwise the app says 通報しました. The sheet says what is sent, and nothing else of the chat is: 通報すると、このメッセージと前後の数件がポチカルに送られます。 (for a member: 〇〇の名前とアイコン) 相手には知らされません。 It does not say who reads it, so it does not read as the chat being watched.
- **ブロック** is in the ⋯ menu of someone's profile sheet (beside ×, not in sight under their face: it is rarely used, and a family member's profile should not show it in red), asked first (〇〇をブロックしますか？). While blocked, their profile says ブロック中 under the name, and the menu has ブロックを解除. It applies to the account, in every group the two share:
  - their messages in group chats are folded to one line, ブロック中のメンバーのメッセージ, which shows the message for now on a tap; the chat list's last line says the same;
  - their one-to-one chat with you is hidden, cannot be started, and their messages to it are not delivered;
  - their shifts still show: the group exists to share shifts, and leaving the group or taking them out is the step for that.
- A block is undone with ブロックを解除 on their profile, or in 設定 › チャット › ブロック中のメンバー (shown while there is one), asked first.
- The server also filters what is posted for known abusive material before it reaches the group; what it catches is not delivered.

## Unread lines and typing

- A chat opened with unread lines opens on the first of them, under a line saying ここから新着 (a rule either side, in the accent). The line stays where it is while the chat is open and is gone the next time it opens. A chat opened from a shared day (the shift table, the landing page) opens on that day instead. With nothing unread, it opens on the latest line.
- Scrolled up more than half the screen from the latest line, or with unread lines below not yet seen, a round ↓ shows at the foot of the lines; a tap scrolls to the latest. While unread lines (others', from the first unread one) have not yet come on screen, the ↓ carries their count in the unread badge's red, as LINE and Slack count what is below; a line once on screen stays seen.
- Someone writing shows as three dots rising in turn, in a bubble of the others' kind with their picture, under the latest line (from the typing frames in spec/sync-protocol.md). A screen reader hears 〇〇が入力中. A blocked member's typing is not shown. Nobody sees whether you have read their lines.

## Pins

- Any member can pin a line (words, a photo, shared days) from its menu, in a group chat or a one-to-one chat, and anyone can take a pin off (ピン留めを外す). It is the same for everyone in the chat. No line from the app says who pinned it.
- At most 5 lines are pinned at once, as LINE keeps five announcements; a sixth takes the place of the oldest, and the app says so.
- Under the header, a bar shows the latest pinned line: a pin, ピン留め (ピン留め・N件 with more than one) and its words on one line. A tap jumps to the line and rings it. With more than one, ▾ opens all of them under the bar, the latest first, each with who wrote it.
- A long press (or a right click) on the bar, or on a line of its list, offers ピン留めを外す, as a line's long press opens its menu. There is no × on the bar: a pin is everyone's, so taking it off is not left a stray tap away.
- A pinned line has a small pin by its time. Taking a line back (送信取消) takes its pin off too.

## Polls

A group chat can put days to the vote, as LINE's 日程調整 does, for the step after finding days everyone is off.

- A group chat's composer has a third tool, 日にちの投票 (the poll card's calendar-check icon), beside 写真 and 日にちを共有. It opens the same day sheet titled 日にちの投票, with 投票で決める on from the start; until two days are picked, ✓ waits and the note asks for 候補の日を2日以上. Turning the switch off makes it 日にちを共有 again.
- In the day sheet (日にちを共有), once two or more days are picked in a group chat, a switch 投票で決める appears (off). On, the note says 〇日の中から、みんなが行ける日を投票で決めます。 and ✓ sends a poll instead of the days. One-to-one chats have no polls.
- The poll is a card: a head (日にちの投票, and N人が投票) whose long press opens the line's reactions and menu like any line's, then a row per day: the date (in the week's colors), みんな休み under it when everyone's shifts are off, the faces of who can come (three, or two and +N), and a 行ける button that toggles your vote. Anyone in the group votes, on as many days as they like, and can change it until the poll is settled.
- Its writer has 日にちを決める at the card's foot (anyone has it once the writer has left the group, so a poll is never stuck): a sheet lists the days with how many can come; ✓ settles it. The chosen row is marked 決定 on the accent's container, the other days fade, voting ends, and the poll is pinned (Pins) so the day stays found. The app says 〇月〇日(〇)に決めました to the writer. A settled poll's foot is gone, so the day reads as decided; whoever can settle it finds 決め直す in its long-press menu, opening the same sheet on the day chosen. Choosing another moves 決定 to it, and the pin bar follows, for everyone; no line from the app says so.
- A tap on a day's faces lists everyone who can come that day by name, as a reaction's list does.
- In a line of words (quotes, the chat list, the pin bar) a poll reads 📅 日にちの投票：〇月〇日(〇)ほか, and once settled 📅 〇月〇日(〇)に決定.
