# Chat links

Which words in a chat message are links, and how a link's preview is made and shown. Both native apps and the server follow it. The web prototype's `textParts` in `apps/web/src/lib/chat-links.ts` (tested in `apps/web/tests/chat-links.test.ts`) and the chat in `/design` follow this spec.

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

## Pochical's invitation links

A link to `https://pochical.app/invite/{code}` (the host in any case, an optional trailing `/`, query and fragment ignored; `inviteCodeOf` in `apps/web/src/lib/chat-links.ts`) is one of Pochical's own invitations. The chat treats it as part of the app, not as a page:

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
