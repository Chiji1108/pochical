# Admin site

Pochical's people read and answer users' chats with them, and look at what members reported, on a site of their own: `admin.pochical.app` (`apps/admin`). Nothing of it is in the apps: they would grow for everyone, and carry a way in for anyone who looked.

## How it reaches the data

- The site is its own Worker (TanStack Start). Its pages ask the site's server, which asks Pochical's server through a service binding to the server's `AdminEntrypoint` (`apps/server/src/admin-entrypoint.ts`, Workers RPC). The entrypoint has no route: only a Worker bound to it reaches it, so nothing it does is open on the internet, and the server's public API has no admin part.
- What the entrypoint does is what the pages need and no more: list the support chats, read one, answer one, list the reports.

## Who gets in

- Cloudflare Access stands in front of the whole Worker (its Access tab: Protect this Worker behind Access), so every way to it, `admin.pochical.app` and any other, asks Pochical's people to sign in first, by their email. Its `workers.dev` and preview addresses are off besides.
- The site checks nothing more itself: Access's `ctx.access` does not reach a Worker served behind its static assets, as TanStack Start's is.
- Its server functions answer only its own pages (TanStack Start's CSRF middleware), so a page elsewhere cannot send an answer through someone signed in.

## What it holds

- **サポート**: every user's chat, the latest first, saying which wait for an answer (未返信) and the latest line. A chat shows its lines oldest first, each user's with the app version and device it came from, the line a reply is to, the photos (each opening whole), the emoji on each and whose, and the lines taken back; and a form to answer as ポチカル in words. Photos are read from the server's bucket through the AdminEntrypoint (`/photos/{user}/{photo}` on the site). An answer is kept (`support_messages`, from Pochical's people) and told to the user at once: their open chat and 設定's row read it again over their socket (`SupportAnswered`, spec/sync-protocol.md), and their devices get a notification, which opens the chat.
- **通報**: what members reported, the latest first: when, why, the group, who reported, who was reported, and what they saw.

## Slack

Pochical's people also read and answer the chats in their Slack channel (`apps/server/src/slack.ts`), through a Slack app of their own.

- Each user's chat is a thread. Their first line starts it, with the app and device and the way to the chat on the admin site; each line after it goes in the thread and shows in the channel too. The thread is kept with the chat (`support_chats.slack_thread_ts`).
- A reply in the thread by one of Pochical's people is an answer, as one from the admin site is: kept, told to the user at once, and marked ✅ in Slack; one that cannot be sent (empty, too long, or with a photo or file, which the chat does not take yet) is answered in the thread with why. One also sent to the channel is an answer all the same. Slack's links, mentions and escapes become plain words first, and its emoji, which Slack's text writes by name (`:pray:`), the characters its rich text gives; a workspace's own emoji stay as written. Slack sends an event again when unsure it arrived: the message's own id keeps it once. Replies by bots, edits, and lines outside a thread or the channel are not answers.
- An answer from the admin site is put in the thread too, so it holds the whole chat. A user's words go to Slack as written, never as a mention or a link; a reply quotes the start of what it is to. Each line keeps its message in Slack (`support_messages.slack_ts`).
- The user's reactions show on their lines' messages, as Slack's emoji of the same name (the app's six and others common, `apps/server/src/slack.ts`); one Slack has no name for here is said in the thread. A line the user takes back reads 「（ユーザーが送信を取り消しました）」 in Slack.
- An emoji Pochical's people put on a user's line in Slack, or take off, is their reaction in the chat (`reaction_added`, `reaction_removed`), the app's own bot's aside; one with no emoji known here stays in Slack. An answer deleted in Slack is taken back from the user's chat too (`message_deleted`). An answer edited in Slack is not changed in the chat.
- A user's photo is uploaded into their thread as a file of the app's (`files.getUploadURLExternal`, `files.completeUploadExternal`), and its line keeps the message it was shared in (`files.info`). A reply in the thread with images sends each to the user as a photo before its words, as Slack's 1024 pixel picture of it (or the image itself when it has none and fits `chatRules.photoMaxBytes`), at most `chatRules.photosPerSend`; other files, and images past that, are answered in the thread as not sent. An answer deleted in Slack takes back each line it was, its photos with it.
- A new report is posted in the channel, with the way to the reports on the admin site.
- Slack reaches the server at `api.pochical.app/slack/events` (the Events API, not Socket Mode: `message.channels` or `message.groups`, `reaction_added` and `reaction_removed`), each request signed with the app's signing secret and refused otherwise. The app posts with its bot token (`chat:write`, `files:read`, `files:write`, `reactions:read`, `reactions:write`, and the history scope its message event needs).
- The server's secrets `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` and `SLACK_CHANNEL_ID` name them. Without them nothing is posted and no reply is taken; Slack failing never fails what the user did, which is answered first.
