# Admin site

Pochical's people read and answer users' chats with them, and look at what members reported, on a site of their own: `admin.pochical.app` (`apps/admin`). Nothing of it is in the apps: they would grow for everyone, and carry a way in for anyone who looked.

## How it reaches the data

- The site is its own Worker (TanStack Start). Its pages ask the site's server, which asks Pochical's server through a service binding to the server's `AdminEntrypoint` (`apps/server/src/admin-entrypoint.ts`, Workers RPC). The entrypoint has no route: only a Worker bound to it reaches it, so nothing it does is open on the internet, and the server's public API has no admin part.
- What the entrypoint does is what the pages need and no more: list the support chats, read one, answer one, list the reports.

## Who gets in

- Cloudflare Access stands in front of the whole of `admin.pochical.app` and lets in only Pochical's people, by their email. The site also checks Access's token on every request (`Cf-Access-Jwt-Assertion`, RS256, signed by the team's certs, for the application's audience, from the team, not expired), so a request that went around Access is refused. Its `workers.dev` and preview addresses are off.
- The team domain and the audience tag are the site's vars `ACCESS_TEAM_DOMAIN` (like `pochical.cloudflareaccess.com`) and `ACCESS_AUD`. Without them nobody gets in but the dev server on this computer (`mise run admin`).

## What it holds

- **サポート**: every user's chat, the latest first, saying which wait for an answer (未返信) and the latest line. A chat shows its lines oldest first, each user's with the app version and device it came from, and a form to answer as ポチカル. An answer is kept (`support_messages`, from Pochical's people) and told to the user at once: their open chat and 設定's row read it again over their socket (`SupportAnswered`, spec/sync-protocol.md), and their devices get a notification, which opens the chat.
- **通報**: what members reported, the latest first: when, why, the group, who reported, who was reported, and what they saw.

## Telling Pochical's people

A new line in a support chat and a new report are told on Pochical's people's Discord channel, through its webhook (the server's secret `DISCORD_WEBHOOK_URL`), with the way to the page on the admin site. Without the secret nothing is told; a webhook that fails never fails what the user did.
