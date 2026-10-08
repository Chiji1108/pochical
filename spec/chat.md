# Chat

How chat messages behave beyond sync (spec/sync-protocol.md): which words are links and mentions, how a link's preview is made, when a mention notifies, editing and unsending, and reporting and blocking. Both native apps and the server follow it. The web prototype's `textParts` in `apps/web/src/lib/chat-text.ts` (tested in `apps/web/tests/chat-text.test.ts`) and the chat in `/design` follow this spec.

The numbers named `chatRules.*` here are in `design/src/chat.ts`, the one place they are written; `mise run gen` gives the apps the same values.

## Opening a message's menu

A long press on a message (a right click on the web) opens its reactions and menu, as LINE, WhatsApp and iMessage do: the rest of the screen dims, the message stays where it was, lifted a little, with the reactions in a bar over it and the menu under it, or over the bar when there is no room under it, as LINE turns it; only when neither fits are they all moved together to stay on the screen (a message too tall for the room drawn smaller about its top corner by the writer, as the system's context menu draws a tall preview, down to half its size and past that cut short at its end), and the message's place in the chat left empty meanwhile. A tap outside closes it; a pick closes it, then acts. On the phones the finger that opened it may stay down and slide onto a reaction or a menu item, which lights up under it with a light tick; lifting there picks it, and lifting anywhere else leaves it open for a tap, as the system's context menu does. The apps draw it themselves rather than the system's context menu, which puts reactions inside the menu. The press gives a little under the finger and a light haptic marks it opening. A tap is the message's own: a link or a mention opens, a photo opens large, a shared day or a poll's head does nothing. So scrolling past a line never opens its menu by accident. A long press on a link opens the link's menu instead. With a keyboard or a screen reader, activating the message opens its menu (a photo's activation opens it large; its menu is in the screen reader's actions).

## What is a link

- A link starts with `http://` or `https://` (any case) and runs over the characters a URL is written in (ASCII letters, digits and `-._~:/?#[]@!$&'()*+,;=%`). Any other character ends it, so Japanese written right after a link is not part of it: in `https://example.jp/ここどう？` the link is `https://example.jp/`.
- `.,!?:;'*` at its end belong to the sentence, not the link. So does a closing `)` or `]` with no opening one inside the link (`(https://example.jp)` → `https://example.jp`; `https://example.jp/A_(B)` keeps its bracket).
- A link needs a host; `https://` alone is not one.
- Addresses without a scheme (`example.jp`, `www.example.jp`), mail addresses and phone numbers are not links. Both apps use this rule instead of the platform's own detectors (`NSDataDetector`, `Linkify`), which find different things, so a message has the same links on every phone.

## In a message

- A message's bubble is round all over, but the first of a run of one writer's (and a reply, and someone writing's dots): its top corner by the writer's side is drawn in, by their face and name, as LINE and WhatsApp draw one, so it says whose words follow. Others' bubbles are on the left, one's own on the right. The face and the name stay at the top of the run. A run's lines sit close (`chatRules.lineGap`), and more room comes before a run's first line, a day's title and ここから新着 (`chatRules.runGap`), so each turn reads as one, as iMessage and LINE space them. The words are at body size, as Messages draws them. A line's time shows beside it, but for a line the next goes on the run of, sent in the same minute: that minute shows once, by the last of them, as LINE does. 編集済み and the pin stay on each line.
- Links are underlined; in others' messages in the accent color, in one's own in the bubble's text color.
- A tap on a link opens it in the system's browser sheet over the chat (`SFSafariViewController`, Custom Tabs).
- A long press on a link (or a right click) opens the link's own small menu under it, リンクを開く and リンクをコピー, as iOS offers on a link in text; the message's menu stays shorter without a link item.

## Large emoji

A message of nothing but 1 to `chatRules.largeEmojiMax` emoji shows them large and without a bubble, as iMessage does: drawn at `chatRules.largeEmojiSize` (points on iOS, sp on Android) at the reader's default text size, growing with it as body does. Each one is an emoji as a mark's is (spec/text-limits.md, `isEmoji`); a space, a line break or any other character among them keeps the message an ordinary bubble, and so does a reply, as the line it answers sits inside its bubble. `spec/vectors/chat-text.json` (largeEmoji) pins which messages count.

- Only how the message is drawn changes: it is sent and kept as words like any other, so an edit that leaves only emoji, or adds words to them, redraws it at once. The chat list's last line, a quote of it and its notification show it at the usual size.
- The time sits beside it, its reactions under it and its long press opens its reactions and menu, as on a bubble; a jump to it rings the emoji.

## Previews

A message carries at most one preview, for its first link. It is made while the message is written and sent with it, so everyone sees the same preview and receivers never fetch the page.

- While writing, once the first link has stayed the same for `chatRules.linkPreviewSettleMs`, the app asks the server for its preview and shows it above the composer: the site's name, the title (読み込み中… until it arrives) and the picture small at the end, with × to send without it. × holds for that link until the message is sent or the link changes.
- A message sent before its preview arrives goes without one. If the server finds no page, nothing is shown above the composer.
- In the chat, the preview sits inside the message's bubble, under its words: the picture (cropped to `chatRules.linkPreviewAspect`, width over height), the title (two lines at most) and the site's name. A tap opens the link; a long press opens the message's reactions and menu.

## Pochical's invitation links

A link to `https://pochical.app/invite/{code}` (the host in any case, an optional trailing `/`, query and fragment ignored; `inviteCodeOf` in `apps/web/src/lib/chat-text.ts`) is one of Pochical's own invitations. The chat treats it as part of the app, not as a page:

- A tap on it, in the words or on its card, opens the group's join screen in the app, as reading its QR code does; when you are in the group already, it opens the group. Nothing opens in the browser, and nothing joins until you confirm on the join screen.
- Its card shows the group instead of a page: the group's mark at the hub's size on a tint, its name, and グループへの招待・{n}人 (参加中のグループ once you are in it). A long press opens the message's actions, as on a page's card.
- The card is not made while writing or sent with the message. Each app asks the server as the message shows (`GroupService.GetInvite`, which also says whether the reader is in the group), so a link that was remade or whose group was deleted turns into この招待は使えません for everyone, and a renamed group shows its new name. That card opens nothing; a tap on the link's words says the link cannot be used.
- Nothing is shown above the composer for it, and it takes the place of the message's one preview: a message whose first link is an invitation shows no page for later links.

## Reading a page

The server reads the page, so that people's addresses are not sent to the sites, and so both apps get the same result.

- The title is the page's `og:title`, else its `<title>`; the site's name is `og:site_name`, else the host without `www.`; the picture is `og:image`. A page with neither title gives its address without the scheme as the title.
- Only `http` and `https` on ports 80 and 443, to hosts that resolve to public addresses (no private, loopback or link-local ranges, checked again after each redirect). At most 3 redirects, 5 seconds, and the first 512 KB of HTML.
- The picture is fetched by the server (an image of at most 2 MB, as the site serves it) and stored with the preview, served to signed-in users from Pochical's own storage (`GET /v1/previews/{id}`), so it keeps showing after the site changes or removes it. A larger picture is left out.
- The server asks `ChatService.GetLinkPreview` with the link; the preview goes with the message (`ChatSend.preview`), and an edit says whether its first link stayed (`ChatChange.keeps_preview`) or gives the new link's page.
- Previews are cached by URL for a day.

## Mentions

A mention names one member of the group in a group chat (全体チャット). One-to-one chats have none.

- A message keeps a mention as `<@id>`, the member's id in the group, and shows it as @ and their name in the group as it is when read, so a later name change shows the new name. Copying a message, a chat's last line in the list, a quote and a notification show the same @name as plain words. A member who has left keeps their last name.
- While writing, an `@` (or the full-width `＠` a Japanese keyboard types) at the end of the message lists the other current members whose name contains what follows it (`spec/vectors/chat-text.json`, mentionQuery). Picking one writes `@name` and a space; only those picked become mentions when the message is sent, and only while `@name` is still followed by a space or the end. Typing a name by hand mentions no one.
- In a message, a mention is in the name's weight, in others' messages in the accent color; one of the reader looks the same, as the chat list's @ is what finds it. A tap on a mention opens that member's profile, except the reader's own.
- There is no mention of everyone: a group chat's line already reaches everyone, and a member who turned it off chose quiet.

### Notifications

- A group chat turned off sends no notifications, except for a line that mentions the reader, which notifies as if the chat were on. The chat notification settings say so under the group chats' switches, and so does a group's own 通知.
- Each chat's notifications turn off and on in its menu (通知をオフにする, 通知をオンにする, saying so as it changes); a group's chat also on 設定 › 通知 › チャット and in the group's own 通知. That page lists the one-to-one chats turned off as it opens, to turn back on, and those turned on again stay until it is left. A chat turned off shows a crossed-out bell after its name in the chat list and its title. Turning a chat on asks for the system's permission first, if not yet asked, and the page shows a card while notifications are not allowed: to ask, or once refused, to open the system's settings.
- メンションはいつも通知 (設定 › 通知 › チャット › メンション, on by default) turns that exception off: off, a chat turned off sends nothing, mentions included, and the notes are not shown. It is one switch for the account, kept by the User DO, not one per group.
- In the chat list, a chat whose unread lines mention the reader shows @ in the accent color before the unread count.

## Editing and unsending

A member can change or take back their own messages, at any time. Others' messages cannot be changed.

- **編集** (text messages only): the message's words go back into the composer, its mentions as @name again, under a bar saying メッセージを編集 with × to stop. The send button becomes ✓ and the photo and day tools are hidden: only the words change. Saving replaces the words for everyone and marks the message 編集済み, shown over its time (on one line with a pin, when it is pinned). A message cannot be saved empty; taking it back is 送信取消. The link's page stays while its first link does; a new first link gets a new preview (`spec/vectors/chat.json`, edited).
- **送信取消** (any of one's own messages: words, photos, shared days): asked first in a centered alert (送信を取り消しますか？ / メンバー全員のチャットから消えます。 / キャンセル | 取り消す). The message's content and reactions are removed for everyone; in its place a line in the middle says 〇〇がメッセージの送信を取り消しました (メッセージの送信を取り消しました for one's own). A reply that quoted it shows 取り消されたメッセージ, and the chat list's last line says the same as the line.
- In the message's menu, 編集 comes after the other actions and 送信取消 last, apart and in the danger color.
- Neither sends a notification, and neither changes unread counts. Both go through the change log as edits (spec/sync-protocol.md).

## Replies

- **返信** is the first item in every line's menu, one's own and others', words, photos, shared days and polls alike. It stops editing, quotes the line over the composer (〇〇に返信, the line in one line of words, a photo small beside it, × 返信をやめる) and goes to the composer. The quote goes with the first line sent then (shared days, then each photo, then the words), and is gone from the composer.
- A reply keeps the line it answers by its place in the chat (`reply_to`, the seq): the group keeps it only for a line of the same chat the writer can see, not taken back, and else takes the line without it, as when the line was taken back meanwhile. Taking the reply back drops it.
- In the chat, a reply's words or photo sit in a bubble under the quote: the writer's name and the line in one line of words, in the bubble's own color, over a thin rule across it; shared days and polls show none. A reply starts a run. A tap on the quote goes to the line, asking for earlier lines until it is held, and rings it, as a pin does.
- The quote reads as the line does in a line of words (quotes, below), 取り消されたメッセージ once taken back, and ブロック中のメンバーのメッセージ for a blocked member's. While the device does not hold the line yet (an earlier page), it says 以前のメッセージ.
- A reply notifies and counts as any line does.

## Reactions

- Any member reacts to any line (not one taken back) with an emoji, from the bar over it on a long press: 👍 ❤️ 😂 👀 🙏 🎉, the reader's own on the accent's container, then + for any other, from the system's emoji keyboard (Opening a message's menu). Several emoji may be on a line, and one member may choose several.
- Under the line, each emoji sits with the faces of who chose it, in the order they did, past three two faces and +N, in a pill on the card's ground; the reader's own on the accent's container, edged in the accent. A tap puts yours on or takes it back; a long press lists everyone who chose it by name.
- Emoji keep the order they were first chosen in, and one nobody holds any more goes. Taking a line back (送信取消) takes its reactions off. A reaction sends no notification and changes no unread count.
- A reaction is the member's edit of the line (`ChatReact`, on or off), which the group takes only for one emoji (spec/text-limits.md, isEmoji). The line comes again with every reaction on it, so a device simply shows the latest.

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

- A chat opened with unread lines opens on the first of them, under a line saying ここから新着 (a rule either side, in the accent); the app's own lines and the reader's are not counted (`spec/vectors/chat.json`, firstUnread). The line stays where it is while the chat is open and is gone the next time it opens. A chat opened from a shared day (the shift table, the landing page) opens on that day instead. With nothing unread, it opens on the latest line. Which lines are unread is known once the group's catch-up has arrived (the `Pong` to a `Ping` sent after `Welcome`, spec/sync-protocol.md, Keepalive), so a chat opened as the app starts, as from a notification, waits for it, at most a moment, before choosing where to open.
- Scrolled up more than half the screen from the latest line, or with unread lines below not yet seen, a round ↓ shows at the foot of the lines; a tap scrolls to the latest. While unread lines (others', from the first unread one) have not yet come on screen, the ↓ carries their count in the unread badge's red, as LINE and Slack count what is below; a line once on screen stays seen.
- A count of unread lines stands for what notifies: every unread line of a chat that is on, and in a chat turned off only those that mention the reader, while メンションはいつも通知 is on (`spec/vectors/unread.json`). A group's icon in the list of groups shows its chats' count, and the グループ tab all groups'. Each chat in a group's chat list still shows all its own unread lines. The 設定 tab counts the answers from Pochical's people not read yet, which a chat on its row in settings also shows; opening that chat reads them.
- Someone writing shows as three dots rising in turn, in a bubble of the others' kind with their picture, under the latest line (from the typing frames in spec/sync-protocol.md). A screen reader hears 〇〇が入力中. A blocked member's typing is not shown. Nobody sees whether you have read their lines.

## Pins

- Any member can pin a line (words, a photo, shared days) from its menu, in a group chat or a one-to-one chat, and anyone can take a pin off (ピン留めを外す). It is the same for everyone in the chat. No line from the app says who pinned it.
- At most `chatRules.maxPins` lines are pinned at once, as LINE keeps five announcements; one more takes the place of the oldest, and the app says so. Pinning a line already pinned only moves it up (`spec/vectors/chat.json`, pins).
- Under the header, a bar shows the latest pinned line: a pin, ピン留め (ピン留め・N件 with more than one) and its words on one line. A tap jumps to the line and rings it. With more than one, ▾ opens all of them under the bar, the latest first, each with who wrote it.
- A long press (or a right click) on the bar, or on a line of its list, offers ピン留めを外す, as a line's long press opens its menu. There is no × on the bar: a pin is everyone's, so taking it off is not left a stray tap away.
- A pinned line has a small pin by its time. Taking a line back (送信取消) takes its pin off too.

## Polls

A group chat can put days to the vote, as LINE's 日程調整 does, for the step after finding days everyone is off.

- The day sheet (日にちを共有, from the composer's calendar tool) has 共有 | 投票 at its top in a group chat, on 共有 as it opens, so a poll is seen from the start; one-to-one chats have neither. On 投票 the title reads 日にちの投票, ✓ waits until two days are picked (the note asks for 候補の日を2日以上), and then says 〇日の中から、みんなが行ける日を投票で決めます。; ✓ sends a poll instead of the days. Both share one way in, as their sheet is the same.
- The poll is a card: a head (日にちの投票, and N人が投票) whose long press opens the line's reactions and menu like any line's, then a row per day: the date (in the week's colors), みんな休み under it when everyone's shifts are off, the faces of who can come (three, or two and +N), and a 行ける button that toggles your vote. Anyone in the group votes, on as many days as they like, and can change it until the poll is settled.
- Its writer has 日にちを決める at the card's foot (anyone has it once the writer has left the group, so a poll is never stuck): a sheet lists the days with how many can come; ✓ settles it. The chosen row is marked 決定 on the accent's container, the other days fade, voting ends, and the poll is pinned (Pins) so the day stays found. The app says 〇月〇日(〇)に決めました to the writer. A settled poll's foot is gone, so the day reads as decided; whoever can settle it finds 決め直す in its long-press menu, opening the same sheet on the day chosen. Choosing another moves 決定 to it, and the pin bar follows, for everyone; no line from the app says so.
- A tap on a day's faces lists everyone who can come that day by name, as a reaction's list does.
- In a line of words (quotes, the chat list, the pin bar) a poll reads 📅 日にちの投票：〇月〇日(〇)ほか, and once settled 📅 〇月〇日(〇)に決定.

## Photos

- The composer's photo tool opens the system's photo picker, `chatRules.photosPerSend` photos at most; past them it says 写真は一度に{n}枚まで送れます, and a photo the phone cannot read is left out with 開けない写真がありました. Picked photos wait above the composer, 64pt squares each with × ({n}枚目の写真を外す), until sent; words written with them go after them as a line of their own.
- Each photo is its own line, with no words. The phone shrinks it first, as chat apps send them: its longer side to `chatRules.photoMaxEdge` pixels, as JPEG within `chatRules.photoMaxBytes`, turned upright and written again from its pixels, so its location and other metadata never leave the phone.
- In the chat a photo has no bubble: rounded at `lg` with a hairline edge, the size it was sent at within 220×260 points, cropped at its ends when wider than 2:1 or taller than 1:2. While it uploads it is dimmed with 送信中. A tap opens it large on black, whole, with × and 保存, and a pull down closes it. Its menu has 保存 and ピン留め, and 送信取消 for its sender; no コピー or 編集. Saving says 写真を保存しました.
- In a line of words (quotes, the pin bar) it reads 📷 写真; the chat list says 写真を送りました (自分：写真を送りました for one's own).
- Photos are kept by the server under their group, readable by its members alone through the server, never by a public address. Taking a photo's line back deletes the photo for everyone.
- A photo that cannot be uploaded (refused, gone from the phone, or failing five tries a few seconds apart) leaves its line waiting, marked: a red ! beside it and 送れませんでした under it, and the lines after it go on. A tap on the ! opens 送れなかった写真: もう一度送る sends it again after the rest, 削除 takes it away with the photo kept for it.

## Long messages and shared days

A message may be as long as `textLimits.chatMessage` and share up to `SHARED_DAYS_MAX` days (`design/src/limits.ts`), but the chat keeps either from filling the screen.

- A message's words longer than `chatRules.foldLines` lines are cut at the last with `…`, and 続きを読む under them, in the color the bubble's links take, opens the rest in place, as LINE's 全文表示 does. Whether words run past it is measured as they are laid out, not guessed from their length. Opened stays opened while the chat is open.
- A card of shared days shows `chatRules.dayCardRows` of them, a week, in rows (or `chatRules.dayCardColumns` across when its people do not fit across, as it turns), and ほか{n}日 under them; シフト表で見る under the card shows them all.
- Choosing days to share stops at `SHARED_DAYS_MAX`: a day past it stays unpicked and a problem toast says 一度に送れるのは{n}日までです. The server refuses a message with more.

## The chat with Pochical's people

設定 has a chat with the people who make Pochical (作っている人とチャット), over ポチカルについて: a small wish or trouble is easier written in a chat than a mail, and the answer comes back in the same place. Its row is drawn as a chat in the chats' list: the app's icon, the latest line and the answers not read yet. Its head says who it reaches and everything that does: what is written there, and the app's version and the device, sent with each line.

- Each user's chat is their own, kept by the server (`proto/pochical/v1/support.proto`, D1's `support_messages` and `support_chats`), so Pochical's people can read every user's in one place. Pochical's people answer under the app's name and icon.
- A line is the user's words, up to `textLimits.chatMessage`, sent with an id of the app's so a send tried again is kept once; past `SUPPORT_LIMIT` (wrangler.jsonc) it waits. A line not sent stays faint, with a way to send it again.
- Opening the chat reads its answers; until then they are counted on its row.
- For now in words only. Photos, reactions, 返信 and 送信取消, as /design has them, and answering from the admin page, with a notification on the person's device, come next.
