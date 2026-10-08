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

- **サポート**: every user's chat, the latest first, saying which wait for an answer (未返信) and the latest line. A chat shows its lines oldest first, each user's with the app version and device it came from, and a form to answer as ポチカル. An answer is kept (`support_messages`, from Pochical's people) and told to the user at once: their open chat and 設定's row read it again over their socket (`SupportAnswered`, spec/sync-protocol.md), and their devices get a notification, which opens the chat.
- **通報**: what members reported, the latest first: when, why, the group, who reported, who was reported, and what they saw.

## Slack

Pochical's people also read and answer the chats in their Slack channel (`apps/server/src/slack.ts`), through a Slack app of their own.

- Each user's chat is a thread. Their first line starts it, with the app and device and the way to the chat on the admin site; each line after it goes in the thread and shows in the channel too. The thread is kept with the chat (`support_chats.slack_thread_ts`).
- A reply in the thread by one of Pochical's people is an answer, as one from the admin site is: kept, told to the user at once, and marked ✅ in Slack; one that cannot be sent (empty, too long, or with a photo or file, which the chat does not take yet) is answered in the thread with why. One also sent to the channel is an answer all the same. Slack's links, mentions and escapes become plain words first. Slack sends an event again when unsure it arrived: the message's own id keeps it once. Replies by bots, edits, and lines outside a thread or the channel are not answers.
- An answer from the admin site is put in the thread too, so it holds the whole chat. A user's words go to Slack as written, never as a mention or a link.
- A new report is posted in the channel, with the way to the reports on the admin site.
- Slack reaches the server at `api.pochical.app/slack/events` (the Events API, `message.channels` or `message.groups`), each request signed with the app's signing secret and refused otherwise. The app posts with its bot token (`chat:write`, `reactions:write`, and the history scope its event needs).
- The server's secrets `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` and `SLACK_CHANNEL_ID` name them. Without them nothing is posted and no reply is taken; Slack failing never fails what the user did, which is answered first.
