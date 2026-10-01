# Chat text

Which words in a chat message are links and mentions, how a link's preview is made, and when a mention notifies. Both native apps and the server follow it. The web prototype's `textParts` in `apps/web/src/lib/chat-text.ts` (tested in `apps/web/tests/chat-text.test.ts`) and the chat in `/design` follow this spec.

## What is a link

- A link starts with `http://` or `https://` (any case) and runs over the characters a URL is written in (ASCII letters, digits and `-._~:/?#[]@!$&'()*+,;=%`). Any other character ends it, so Japanese written right after a link is not part of it: in `https://example.jp/ここどう？` the link is `https://example.jp/`.
- `.,!?:;'*` at its end belong to the sentence, not the link. So does a closing `)` or `]` with no opening one inside the link (`(https://example.jp)` → `https://example.jp`; `https://example.jp/A_(B)` keeps its bracket).
- A link needs a host; `https://` alone is not one.
- Addresses without a scheme (`example.jp`, `www.example.jp`), mail addresses and phone numbers are not links. Both apps use this rule instead of the platform's own detectors (`NSDataDetector`, `Linkify`), which find different things, so a message has the same links on every phone.

## In a message

- Links are underlined; in others' messages in the accent color, in one's own in the bubble's text color.
- A tap on a link opens it in the system's browser sheet over the chat (`SFSafariViewController`, Custom Tabs). A tap elsewhere on the message opens its reactions and menu as before.
- A message with a link has リンクをコピー in its menu, after コピー. It copies the first link.

## Previews

A message carries at most one preview, for its first link. It is made while the message is written and sent with it, so everyone sees the same preview and receivers never fetch the page.

- While writing, once the first link has stayed the same for 0.4 seconds, the app asks the server for its preview and shows it above the composer: the site's name, the title (読み込み中… until it arrives) and the picture small at the end, with × to send without it. × holds for that link until the message is sent or the link changes.
- A message sent before its preview arrives goes without one. If the server finds no page, nothing is shown above the composer.
- In the chat, the preview sits inside the message's bubble, under its words: the picture (cropped to 1.91:1), the title (two lines at most) and the site's name. A tap opens the link; a long press opens the message's reactions and menu.

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

- A group chat turned off sends no notifications, except for a line that mentions the reader, which notifies as if the chat were on. There is no setting for this; the chat notification settings say so under the group chats' switches.
- In the chat list, a chat whose unread lines mention the reader shows @ in the accent color before the unread count.
