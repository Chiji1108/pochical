# Admin pages

Pochical's people read and answer users' chats with them, and look at what members reported, on pages of their own: `api.pochical.app/admin`, served by the server that holds the data (`apps/server/src/admin.ts`). Nothing of them is in the apps: they would grow for everyone, and carry a way in for anyone who looked.

## Who gets in

- Cloudflare Access stands in front of `api.pochical.app/admin*` and lets in only Pochical's people, by their email. The server checks Access's token on every request (`Cf-Access-Jwt-Assertion`, RS256, signed by the team's certs, for the application's audience, from the team, not expired), so a request that went around Access is refused.
- The team domain and the audience tag are the server's vars `ACCESS_TEAM_DOMAIN` (like `pochical.cloudflareaccess.com`) and `ACCESS_AUD`. Without them nobody gets in, but a server on this computer or under test, told so by `ADMIN_LOCAL=1` (`mise run server` passes it).
- An answer is taken only from a form on the admin pages themselves: its Origin must be theirs.

## What they hold

- **サポート**: every user's chat, the latest first, saying which wait for an answer (未返信) and the latest line. A chat shows its lines oldest first, each user's with the app version and device it came from, and a form to answer as ポチカル. An answer is kept (`support_messages`, from Pochical's people) and told to the user at once: their open chat and 設定's row read it again over their socket (`SupportAnswered`, spec/sync-protocol.md), and their devices get a notification, which opens the chat.
- **通報**: what members reported, the latest first: when, why, the group, who reported, who was reported, and what they saw.

## Telling Pochical's people

A new line in a support chat and a new report are told on Pochical's people's Discord channel, through its webhook (the server's secret `DISCORD_WEBHOOK_URL`), with the way to the admin page. Without the secret nothing is told; a webhook that fails never fails what the user did.
