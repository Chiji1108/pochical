# Sync protocol

How clients and Durable Objects keep shifts, groups and chat in sync. `apps/server` implements signing in, groups, the sockets' handshake and keepalive, a user's own days and patterns between their devices, and their projection into groups (Shifts); the rest is the agreed design and will move into `proto/pochical/v1/sync.proto` as it is built.

## Ownership

| Data | Source of truth | Client storage |
| --- | --- | --- |
| A user's own shifts, patterns, repeating orders and coworkers | That user's User DO | `my_shifts`: writable, changes go through the outbox |
| Members' shifts shown in a group | Projection held by the Group DO, fed by each member's User DO | `member_shifts`: read-only cache |
| Groups, members, chat, read states | Group DO | Read-only cache |

Clients never write to another user's data. A Group DO never edits shifts; it only stores what User DOs push to it.

## Signing in

Every user is signed in, from the first launch: anonymously at first, so nobody has to make an account to use groups, and later linked to Apple or Google to keep the same user on a new phone. better-auth (`apps/server/src/auth.ts`) serves this at `/api/auth/*` in its own JSON shapes, the one part of the server not defined in `proto/`.

- A client signs in with `POST /api/auth/sign-in/anonymous`, sending `Content-Type: application/json` and the body `{}` (better-auth answers 415 without them), and keeps the session token from the response's `set-auth-token` header: iOS in the Keychain and Android in Block Store, so a reinstall comes back as the same user, and so does a new phone the old one is moved to (an encrypted backup or Quick Start on iOS, Block Store's restore on Android). It is not synced to the person's other devices (iCloud Keychain on iOS): those come in by linking Apple or Google, as one person's Apple ID may be shared by a family.
- It sends the token as `Authorization: Bearer <token>` on every Connect call and socket, and on its own calls to `/api/auth/*`, which send no cookie: better-auth sets its session as a cookie too, and a call carrying one without an `Origin` it refuses as a browser's from another site (403), so the apps neither keep nor send it. Calls without a valid one fail with `UNAUTHENTICATED`; sockets get 401. `UserService.GetMe` says whose token it is.
- A session lasts for good, until the user signs out or deletes their account. An anonymous user's token is their only key, so an expiry would only lock out someone who did not open the app for a while (a widget is enough to keep using it). better-auth puts a session's lifetime on its cookie too, which may last at most 400 days, so the server stores each session to expire a century on and never refreshes it (`apps/server/src/auth.ts`); the apps use the token, not the cookie.
- Each user has a User DO named by their user id. It records the groups they are in.
- A session keeps its token and its user only: better-auth's IP address and user agent are left empty, so the server holds no one's address or device.
- Linking Apple or Google keeps the user: the app gets the provider's ID token (Sign in with Apple; Google through Credential Manager or Google Sign-In) and sends it on the signed-in session to `POST /api/auth/link-social` (`{ provider, idToken: { token, nonce } }`). An anonymous user's email is a placeholder, never the provider's, so the server allows linking a different email (`account.accountLinking.allowDifferentEmails`); the provider must still give an email, or `/link-social` answers `USER_EMAIL_NOT_FOUND`: an ID token carries one only when the app asks for the email scope, which Sign in with Google through Credential Manager does by default and Sign in with Apple does not, so both apps ask for it. The server reads the email to link and keeps none of it (below). The user id stays, and with it their User DO, groups and messages; the user is no longer anonymous once linked. better-auth leaves `isAnonymous` set, so the server clears it as the provider's account is linked, in the same change that builds linking: a linked user still marked anonymous could be deleted through the anonymous plugin's `/delete-anonymous-user` without signing in again, and the switch below would keep the device's anonymous user, as the plugin deletes it only when the account switched to is not anonymous. better-auth's way for an anonymous user to sign in with a provider (`/sign-in/social`), which makes a new user and deletes the anonymous one, is used only to switch to the account's data, below. Sign in with Apple's ID tokens are checked against the iOS app's bundle id (`APPLE_APP_ID`, `apps/server/wrangler.jsonc`), and the app sends the nonce it asked Apple with, Apple's token carrying its SHA-256. The iOS app offers Apple alone for now; Google comes with the Android app.
- When the provider's account belongs to another user already, `/link-social` answers 409 (`SOCIAL_ACCOUNT_ALREADY_LINKED`): that user holds the person's data from elsewhere, as from another phone. The person keeps either that user's data or this device's, and the other is deleted (Switching to an account in use, below). Until switching is built, the app says the account is in use with another device's data, and nothing changes.
- The server keeps no provider tokens: the ID token (which carries the person's email), and any access or refresh token, are left out of better-auth's `account` row, as a session keeps no address. Only which provider account is linked to which user is kept. The app keeps the email the ID token carried on the device, for 設定's アカウント to say which account it is.
- A user who never linked and loses both their phone and its stored token cannot be reached again. That is why the app suggests linking, at moments its screens decide.
- Cloudflare's rate limiting holds back what an anonymous account makes cheap, by the limiters in `apps/server/wrangler.jsonc` (`ratelimits`, where their numbers are): anonymous sign-ins per client address, answered with 429, and groups made per user, answered with `RESOURCE_EXHAUSTED`. The address is only counted, never kept.

### Switching to an account in use

What the device holds may be a few taps tried before signing in, or months of shifts entered without ever linking, while the account was started on another phone. The person keeps one side whole, its groups and messages with it, and the other is deleted. Nothing is merged: a merge would have to match patterns and coworkers that mean the same thing under different ids, and keep groups of two users, for a case that seldom has data worth keeping on both sides (not built yet).

1. Before anything is deleted, the app asks the server what the account holds, sending the provider's ID token on the anonymous session, which proves the person holds that account. The server answers with the account's days with a shift of their own, whether a repeating order is set, and its groups; the device counts its own the same way.
2. It shows both sides' counts, from which the person can tell a try from months of use, and offers two answers, each saying what goes with it:
   - アカウントのデータを使う, the default, as someone signing in to an account they used is more often after its data. The device signs in to that user with `/sign-in/social` and the same ID token; the anonymous plugin deletes the anonymous user, as deleting an account deletes it, its groups and messages with it. The device drops what it held and catches up from the account.
   - この端末のデータを使う. The server deletes the account's user, as deleting an account deletes it, its groups and messages with it, and links the provider's account to the anonymous user in the same call, clearing `isAnonymous` as linking does. Devices still signed in to the deleted user are signed out, and say so as on a 401 (Reconnecting).
3. When one side holds nothing the person entered (no day values, repeating orders or coworkers, and no patterns but unchanged ready-made ones) and no groups, the app does not ask, and keeps the other. A new phone's first launch offers signing in before anything is entered, so most switches go this way.

## Groups

`GroupService` (`proto/pochical/v1/group.proto`) makes groups and lets people into them; every call needs a session.

- Creating a group gives it a random id, sets up its Group DO with the name, the emoji mark and the maker as its first member, and issues its first invitation code. The app sends a `request_id` it makes once for the group and again with every retry; the maker's User DO keeps which group each request made, so a retry after a lost answer gives back the same group, link and all, and never makes a second.
- A group has one live code, held in D1 (`invites`, from code to group), the only place a link can be looked up. Remaking it replaces the row, so the old link stops working at once. `InviteService.GetInvitePreview` answers anyone holding a live code with the group's name, mark and member count.
- Joining with a live code adds the user to the Group DO, which decides membership, and then to the user's own DO, which keeps their groups for checking sockets. Both steps can be repeated, so a retry after a failure between them completes the join; joining a group you are in changes nothing and says so.
- Only members read or remake a group's link.
- A group has at most `GROUP_MAX_MEMBERS` members (`design/src/limits.ts`). The Group DO counts and adds in one step, so two people joining at once cannot both take the last place; a join past it fails with `RESOURCE_EXHAUSTED`, which the app shows as the group being full.
- What anyone holding a link sees, on the site and in a link's card, is the group's name, mark and member count only. The app's join screen shows who is in the group before joining, through `GroupService.GetInvite`, which needs a session.
- The app opens an invitation from its link: the site's アプリで開く (`pochical://invite/{code}`), and `https://pochical.app/invite/{code}` itself once the app claims the site's links. The join screen shows the group from `GetInvite` and joins only on 参加する; for a group the person is in already it offers グループを開く instead, for a full one it says so, and for a code no group uses it says the link cannot be used, as the site's invitation page does.
- A user's groups reach their devices on their User DO socket as `Membership` values, in the user's own log among their days: added as they make or join one, with the group's name and mark as the User DO last heard them, so the list of groups needs no socket to each group. Joining a group again adds nothing. A rename reaches each member's list the same way, and leaving sends the membership again as `left`, so a device catching up drops the group with what it holds of it.
- Any member renames the group (`RenameGroup`) and sets how they appear in it (`SetDisplayName`). A member leaves with `LeaveGroup`: their User DO marks the group left first, then the Group DO marks them left, deletes what it holds of their shifts and closes their sockets there. Both steps can be repeated. The rows stay, marked left at a new cursor, so devices catching up hear of the leaving; a member who left joins again by a live link like anyone, their values pushed whole again.
- On a group's socket, the group's name and mark (`GroupProfile`) and each member as they appear in it, in the order they joined (`Member`), are values in the Group DO's log with the members' shifts, so a device catching up learns who is in the group with their days, and a join reaches members with the group open at once.

## Sockets

Clients open one WebSocket to their User DO, at `/v1/me/socket`, and one per group they are viewing, at `/v1/groups/{groupId}/socket`. The Worker checks the session before either reaches a Durable Object, and lets a group socket through only when the user's own DO lists the group, so an id that is not theirs is refused (403) without waking or creating a Group DO. A socket remembers the session it was opened with: when that session ends (the user signs out, or their account is deleted), the server closes the sockets it opened, on the user's DO and in their groups, and the device's next try gets 401 (Reconnecting). Every message is binary: clients send `pochical.v1.ClientFrame`, the server sends `pochical.v1.ServerFrame` (see `proto/pochical/v1/sync.proto`). Text messages are protocol errors, but for the keepalive text (Keepalive).

A device keeps its User DO socket open while the app is in the foreground, and a group's socket while that group is on screen. It closes them as the app goes to the background, where the OS would soon stop them anyway, and opens them again when it comes back. If its outbox still holds edits then, it first asks the OS for a little time in the background (a background task on iOS, WorkManager on Android) to connect if need be and send them until they are acknowledged, so a shift changed just before leaving reaches the user's other devices and groups without waiting for the app to be opened again; it does the same for edits made outside the app, such as from a widget.

### Handshake

1. Before connecting, the client may call `SystemService.GetServerInfo` and ask the user to update when its protocol version is below `min_protocol_version`.
2. The first frame must be `Hello { protocol_version, cursor }`.
   - Below the server minimum: the server replies `ServerError { CODE_PROTOCOL_TOO_OLD }` and closes with 1008.
   - Otherwise it replies `Welcome { cursor, server_ms }` with the head of the DO's change log and the server's time, which the device corrects its clock by (HLC).
3. Any other frame before `Hello` gets `ServerError { CODE_BAD_FRAME }` and the socket is closed with 1008.

### Keepalive

The numbers are `socketRules` in `design/src/socket.ts`.

- While a socket is open, a device sends the text message `keepaliveText` every `keepaliveEveryMs`, and the server answers `keepaliveReply`. The runtime answers it (`setWebSocketAutoResponse`), so keeping a socket alive never wakes a hibernating Durable Object. With no answer within `keepaliveWithinMs`, the device takes the socket for dead, closes it and reconnects.
- `Ping { nonce }` is answered with `Pong { nonce }` by the Durable Object itself, after every frame it sent before. It is not for keeping alive: a device that sends one after `Welcome` knows, at its `Pong`, that its catch-up has all arrived.

### Reconnecting

- A device reconnects when a socket closes, or its keepalive goes unanswered. Before each try it waits a time drawn at random from 0 up to `reconnectFirstMs` doubled for each try before it since its last `Welcome`, at most `reconnectMostMs` (`spec/vectors/reconnect.json`). A `Welcome` starts the count again. The random wait keeps devices cut off together, as by a deploy, from coming back together.
- It tries at once, starting the count again, when the app comes to the foreground or the network comes back: the person is waiting then.
- After `CODE_CLOCK_AHEAD` it reconnects at once (HLC).
- It does not reconnect after `CODE_PROTOCOL_TOO_OLD` until the app is updated, nor after a 401 to the upgrade, nor to a group after a 403. A 403 says only that the user's own DO does not list the group, which can lag the Group DO that decides (a join half done), so the device asks the server for its groups again rather than dropping the group (not built yet: no call lists a user's groups).
- A 401 says the server does not know the session. Sessions last for good, so it should mean the user signed out or their account was deleted, on another device or by request; but a server misconfigured, or one whose `BETTER_AUTH_SECRET` was changed (the apps' tokens are signed with it), answers every device so at once. So a device never deletes anything on a 401 alone, and never answers it with a new anonymous sign-in, which would be a new user without their data. It stops syncing, keeps what it holds and its outbox, and says so: a linked user can sign in with Apple or Google again; an anonymous user can try again later, or start afresh. Starting afresh keeps their data: the device signs in anonymously as a new user and sends everything of the user's own it holds (days, patterns and their order, repeating orders, coworkers and their order) to the new User DO as edits with new clocks, through the outbox like any other; what is lost is the old user's groups, which they join again by invitation, and their other devices. Nothing on the device is ever cleared but by the person's own choice. `BETTER_AUTH_SECRET` is never changed: changing it signs everyone out (`apps/server/wrangler.jsonc`).

## Change log and cursor

Each DO keeps an append-only change log. Every accepted mutation (shift edit, message sent, message edited or deleted, read state moved) gets the next `cursor`, a `uint64` that only grows.

A DO that ever removes rows keeps the newest cursor it gave out in a row of its own (the Group DO's `log_head`), since the newest of the rows left could be older, and a device already past it would miss what comes next. The User DO, which keeps every value once written (a deleted one as a tombstone), reads it off its values; the only rows it removes, a left group's unread counts, go with a newer cursor written in the same transaction.

- After `Welcome`, the server sends every change after the client's cursor, then streams new changes as they happen.
- The client applies changes in cursor order and stores the last applied cursor in the same SQLite transaction.
- If the client's cursor is older than the oldest change the DO still keeps, the server tells it to reset: drop that DO's cache and load a fresh snapshot.
- A DO whose values are last-writer-wins registers (a User DO's days) keeps only each value's latest change, at the cursor it got then, so "every change after cursor N" is the values changed since N and reaches back any distance. Such a DO resets a client only when its cursor is ahead of the DO's head (the DO restored from an older copy): `Reset`, then a `Changes` with everything it holds.

## Shifts

### Conflict resolution

Only the owner edits their shifts, so concurrent edits happen only between the owner's own devices while one of them is offline. Each field of a day's shift (pattern, start, end, memo) is a last-writer-wins register ordered by HLC. No text or list CRDT is needed; two devices editing the same memo offline keep the later edit.

Deleting a day's shift writes a tombstone instead of removing the row, so a device that was offline cannot resurrect it by sending an older edit.

### HLC

A hybrid logical clock value is `(physical_ms, counter, device_id)`, compared in that order.

- On a local edit: `physical_ms = max(now, last.physical_ms)`; if it did not advance, `counter = last.counter + 1`, otherwise `counter = 0`. The counter is a `uint32`: at its end the clock moves to the next millisecond (`spec/vectors/hlc.json`, tick).
- On receiving a change: the device's last clock becomes the received one when that is later, so its next local edit orders after it (receive).
- `device_id` only breaks exact ties. It is the device's own id, written in ASCII letters, digits and `-` (a UUID as it is written), at most `syncLimits.idLength` long, so every platform orders two of them alike: Swift compares strings by Unicode scalars and JavaScript by UTF-16 units, which differ past the Basic Multilingual Plane. `server` is the server's own, for its corrections (Outbox step 5). The server acknowledges an edit with any other `device_id` without applying it.

HLC, not arrival order, decides the winner: an edit made offline at 10:00 and delivered at 12:00 must lose to an edit made online at 11:00.

`now` is the device's time corrected by the server's, so a device whose clock is set wrong cannot win over later edits, nor carry every device that takes its edits along with it:

- Each `Welcome` carries the server's time, `server_ms`. The device's offset is `server_ms` less the middle of the round trip, from when it sent `Hello` to when `Welcome` arrived, divided as whole numbers (offset). It keeps the last offset across launches, 0 before its first `Welcome`, and `now` is its own time plus the offset.
- The server refuses a frame of edits in which any clock runs more than `syncLimits.clockAheadMs` (`design/src/limits.ts`) past its own time: `ServerError { CODE_CLOCK_AHEAD }`, nothing in the frame is taken, and the socket is closed (ahead). A corrected clock stays well within it, so this catches edits stamped before the device's first `Welcome` or before its clock was changed.
- After `CODE_CLOCK_AHEAD`, the device reconnects, and once the new `Welcome` has corrected its offset, before sending its outbox, it starts its clock again from the later of `now` and the latest clock among the changes it has taken, dropping its own far-ahead one, and gives every unsent edit a new clock from a local edit's tick, in outbox order. Then it sends them. Its edits keep their order and come after everything it has taken; only on a device whose clock ran that far off do edits made offline lose their own times.

### Outbox

1. A local edit updates `my_shifts` and appends a row to the outbox in one SQLite transaction.
2. While connected, the client sends outbox rows in order, each with a unique `op_id` and its HLC.
3. The User DO applies each field only if its HLC is newer than the stored one, appends the result to its change log, sends what changed to every device as `Changes`, and then acknowledges the `op_id` to the sender with `Acked`. A repeated edit carries the same HLC, so it is acknowledged without being applied again.
4. The client deletes acknowledged rows. Unsent rows survive app restarts.
5. If the server rejects an edit (validation), it writes a compensating change with a newer HLC, which reaches every device through the change log.

Free text is edited once it is written, when its field is left, not on each change (spec/calendar.md, Text fields).

What a device shows of a value while its edits wait (`spec/vectors/local-edits.json`). A value is what one change carries: a field of a day, a pattern, the patterns' order, the repeating orders, a coworker or the coworkers' order.

- A device keeps, for each value, the server's (the last `Change` it took for it) apart from its own edits of it still in the outbox, and shows the latest waiting edit's value if there is one, else the server's.
- A `Change` replaces the server's value and leaves the outbox alone, so a waiting edit keeps showing whatever arrives meanwhile. Its `Acked` ends the wait, and the device then shows the server's value, which by then is the edit's own, the correction for it, or the newer value it lost to: the server sends a frame's `Changes` before its `Acked`.
- So a device never compares clocks to choose what to show; the server has done that. Clocks only go out with its edits.
- A repeating-orders edit waiting in the outbox also hides the days' own values it takes back (`givesWay`); the server's clears for them come as `Changes` before its `Acked`.
- A `Reset` drops the server's values and keeps the outbox.

### On the wire

The User DO socket carries a user's days (`proto/pochical/v1/sync.proto`); a Group DO socket refuses them.

- A `DayValue` is one field of one day: `date` ("YYYY-MM-DD"), `field` (`DAY_FIELD_PATTERN`, `_START`, `_END`, `_NOTE`, `_PEOPLE`), an optional `value` (unset clears the field) and its `Hlc`. A day whose `DAY_FIELD_PATTERN` is unset follows its repeating order, and has no shift where no order applies; a pattern of `dayRules.noShift` (`""`, `design/src/days.ts`) is a day with no shift, order or not (Repeating orders); keep it apart from no pattern everywhere, as its note there says.
- The client sends `DayEdits`, up to `syncLimits.editsPerFrame` a frame (`design/src/limits.ts`; every edit frame alike), each with its `op_id`. The server sends each value it changed, as `Changes`, to every device of the user that is past Hello, the sender included, so every device moves its cursor the same way, and then answers the sender with `Acked` for all of them (Outbox).
- An edit for no real day or field, or without a clock, is acknowledged and dropped: there is nothing to keep or correct.
- An edit whose value does not fit its field (a pattern that is neither `dayRules.noShift` nor an id, an id being up to `syncLimits.idLength` characters with no spaces as `apps/server/src/ids.ts` has it; a time not `HH:MM`; a memo past `textLimits.dayNote`) but whose clock is newer than the stored one is answered with the stored value (or none) under a clock just past the edit's, stamped with device `server`: the compensating change of Outbox step 5.
- After `Welcome`, a device gets its catch-up as `Changes` of up to `syncLimits.changesPerFrame` values each, in cursor order.
- Patterns go the same way, as `PatternEdits`: each pattern is one last-writer-wins `PatternValue`, sent whole (a deleted one has no `pattern`, kept so an older edit cannot bring it back), and the order they are shown in is one more, `PatternOrder`. They share the User DO's cursor with days, so a device catches up on both in one order. A pattern that does not fit (spec/shift-patterns.md: a blank name or one past `textLimits.shiftName`, a mark whose emoji is not one emoji, or whose letters are blank or past `textLimits.shiftMark`, a color past the palette, one time without the other, a `next_day` naming itself) or an order with an id twice is corrected as a day's value is.

### Repeating orders

How a day follows a repeating order is in spec/shift-patterns.md (Repeating orders). On the wire (`proto/pochical/v1/sync.proto`) and in storage:

- A user's orders are one last-writer-wins value, `RepeatOrders`, sent whole like `PatternOrder`: the timeline, each order with its `start` and `anchor` ("YYYY-MM-DD"), `sequence` (pattern ids), `holidays_off`, `holiday_shift` and `holiday_country` ("JP"). They are one value because they are one timeline: two of the person's devices editing it at once is rare, and keeping either whole beats a mix of both.
- Days are never written out from an order. `DayValue`s hold only what the person set on a day: an unset `DAY_FIELD_PATTERN` means the day follows its order, and `dayRules.noShift` means the day was cleared on purpose and shows nothing, order or not.
- Devices send them as `RepeatOrdersEdits` on the User DO socket, acknowledged and sent on as `Changes` like day edits.
- Starting an order, or correcting the one in use, is one edit, `RepeatOrdersEdit`: the new `RepeatOrders` and `clear_from`, the order's start. The days' own shifts and times give way only if the orders do: when the server takes the new value (it fits and its clock is newer than the stored one), it clears `DAY_FIELD_PATTERN`, `_START` and `_END` on the days from `clear_from` whose values are older than the edit's clock, in the same transaction, and sends those clears to the user's devices as changes like any other. An edit that loses to newer orders, or does not fit, clears nothing; `clear_from` fits only as the start of the last order, the one being started or corrected.
- The server keeps each clear it made as a floor (`order_clears`: `clear_from` and the orders' clock). An edit of a pattern or time arriving later for a day from there, with an older clock, was made before the orders: the server answers it with the clear under the clear's own clock, so an edit made offline cannot bring back what they took, even on a day that had no value, while a later edit from the same device, made after the orders, still wins. Which values give way and which edits are held back is `spec/vectors/order-clears.json` (`apps/server/src/order-clears.ts`). Devices apply `givesWay` when they start or correct an order themselves; only the server keeps clears and holds edits back. A device applies the same edit to its own SQLite at once, as Outbox has it, and the server's changes settle it.
- A client works a day out as its own value, else its order's, with the holiday data of `design/scripts/holidays.ts` (`spec/vectors/repeat.json`). The server keeps and checks orders (`apps/server/src/order-values.ts`: real dates, starts that only grow, ids and counts within `syncLimits` in `design/src/limits.ts`, a country code of two capital letters, a `holiday_shift` whenever `holidays_off`), correcting ones that do not fit as it corrects a day, but never works days out; if it ever needs one, it uses the same logic against the same vectors.

Why not write the days out: a year of days is hundreds of values for every change of order, sent to every device and every group, and runs out a year ahead. An order is one small value without an end, and a holiday the law moves is fixed by an update of the apps' holiday data, not by rewriting everyone's days.

### Coworkers

The people a user notes on a day, like who is on the same shift. They are names only, not app users (/design's 一緒に働く人).

- Each coworker is a last-writer-wins `CoworkerValue` with an id and a name (`textLimits.personName` at most, not blank), sent whole as patterns are (a deleted one has none), and their order is one more, `CoworkerOrder`; devices send both as `CoworkerEdits`.
- A day's people are one more day field, `DAY_FIELD_PEOPLE`: coworker ids separated by spaces, in the order they were added; no id the apps make holds a space (`apps/server/src/ids.ts`). Days hold ids, so renaming a coworker changes one value; a deleted coworker's id is skipped where it is shown and needs no rewrite of days. When a device next writes a day's people, it leaves out the ids of coworkers no longer listed, so such ids go as the days are touched, without edits of their own.
- A user keeps at most `COWORKERS_MAX` coworkers (`design/src/limits.ts`). Adding past it, in 一緒に働く人 or from a day, stops with a problem toast, 一緒に働く人は{n}人までです, and the User DO refuses a new coworker past it: it answers with the coworker deleted, as a value that does not fit. Their order holds at most as many ids; a longer one names coworkers the server refused, and is answered with the person's order of those they keep.
- Like the memo, coworkers and a day's people stay with their owner: they name people outside the app, so they are never pushed to groups.

### Deleted values

A deleted pattern or coworker is kept as a tombstone (a value without its pattern or name), so an older edit cannot bring it back. What names it keeps its id: deleting rewrites nothing else, as offline-first sync tools do, since a device offline at the time can still name it afterwards, and a rewrite would race the edits it meets. Every reader resolves a reference as it reads:

- A day whose own shift, or whose order's (its sequence or `holiday_shift`), names a pattern that is gone shows no shift and counts as blank (`spec/vectors/repeat.json`, shown).
- A pattern's `next_day` naming one that is gone fills nothing (`spec/vectors/entering.json`, enter).
- A day's people, and the patterns' and coworkers' orders, skip ids that are gone.
- When a device writes a reference field (a day's people), it leaves out ids that are gone, so they go as the values are touched (Coworkers).

Keeping the ids also lets a deletion be undone with what named it intact.

### Group projection

The User DO pushes what its groups see of the user to every Group DO the user belongs to. Values carry their HLCs, so the Group DO keeps each one only when it is newer: a push that arrives twice or late changes nothing.

- Only shared values are pushed: each day's pattern and times (named one by one, so a day field added later stays private until it is named too), never the memo or the people, the user's patterns, so members can draw their marks, and their repeating orders, so members' apps work their days out as the user's own do (`MemberRepeatOrders`). The patterns' order is the user's own.
- For each group the User DO keeps how far it has pushed (`pushed_cursor`, a cursor of its own log). After any change, and on joining or making a group, its alarm pushes each group the shared values changed after that cursor, then moves it. A group that cannot be reached keeps its cursor without holding back the others, and the alarm comes back for it, 10 seconds later and twice as long each time that group fails in a row, up to an hour, so the values reach it later. After about a day of failures in a row it stops coming back; the user's next change tries the group again.
- On joining, `pushed_cursor` starts at 0, so the group gets everything the user has.
- The Group DO takes a push (`takeMemberShifts`, `pochical.v1.Changes` as bytes) only from a current member, drops any day field that is not shared, keeps the rest at its own cursor and sends them to the members with the group open as `MemberDay` and `MemberPattern` changes. A group socket catches up from its cursor as a User DO socket does.
- On leaving, the Group DO deletes that member's projected shifts and sends members their `Member` marked `left`, on which devices drop that member's shifts and keep their name, which their lines in the chats still show.

## Chat

Chat has two orders that must not be mixed:

- `seq`: a message's position in the conversation, used for display and paging (`before_seq`, page size).
- `cursor`: the Group DO's change log, used for sync. New messages, edits, deletions and read states all arrive in cursor order.

The Group DO keeps the lines (`ChatLine`) and read marks (`ReadMark`) of its chats as values on its change log, beside its members' shifts. A group has its own chat (`thread_id` "group", 全体チャット) and a one-to-one chat for any two of its members.

### One-to-one chats

- Two members' chat is the thread `direct:{a}:{b}`, their two user ids in order (by UTF-16 code units; every id is ASCII), so either names it alike without asking the server (`spec/vectors/chat.json`, directThread). It exists once it has a line; there is nothing to create.
- Only its two members see it: the Group DO sends its lines and read marks only to their sockets, leaves them out of anyone else's catch-up, answers anyone else's `ChatPageRequest` for it with an empty page at its start, and drops anyone else's edits of it.
- A new line is taken only while the other is in the group; a member who left keeps their lines and the chat can still be read, but takes no more. The apps keep listing it under the group's chats, so it can be read and its unread lines cleared, and in place of the composer say 〇〇はグループを抜けました. A line counts as unread for the other member alone.
- Its lines and read marks share the group's change log with everything else, so a device's cursor still covers all it may see; the other members simply never receive those changes.

- A member writes through their group socket, from their outbox like a shift edit: `ChatEdits` of `ChatSend` (a new line at the end: words, or 1 to `SHARED_DAYS_MAX` days as `YYYY-MM-DD`, each once and in order, with no words, drawn with everyone's shifts, spec/chat.md Long messages and shared days), `ChatChange` (new words for one of their own lines, 編集), `ChatUnsend` (one of their own lines taken back, 送信取消), `ChatReact` (their reaction on any line put on or taken off; the line moves to a new cursor carrying all its reactions, spec/chat.md Reactions), `ChatPin` (any line pinned for everyone or its pin taken off; a line's `pinned_order` is the cursor it was last pinned at, the latest the greatest; a pin past `chatRules.maxPins` takes the oldest's off at the next cursor, and taking a line back takes its pin off, as `spec/vectors/chat.json` pins has it) `ChatVote` (they can come on one of a poll's days, 行ける, or take it back, until it is settled) and `ChatDecide` (a poll settled on one of its days by its writer, or by anyone once they left; it pins the poll as the vectors' `settle` step does, spec/chat.md Polls), and `ChatRead` (their read mark). A photo is a `ChatSend` of a `ChatPhoto` alone (its id and size), sent only after the photo is uploaded: `PUT /v1/groups/{group_id}/photos/{id}` with the JPEG (members only, at most `chatRules.photoMaxBytes`), which the Group DO notes as the uploader's, so a line can carry only its sender's own photo, once; members read it with `GET` on the same path. The outbox uploads a photo before sending its line and drops a line whose photo is gone or refused. Taking the line back deletes the photo from storage. A poll is a `ChatSend` of 2 days at least with `poll` set, in the group chat only; its line carries each day's voters in the order they said so (`votes`) and the settled day (`decided`), and taking it back takes them off. Lines need no clock: the group orders them as it takes them, giving each new line the chat's next `seq`. Each edit has an `op_id`; a send taken twice is one line, and the line carries its `op_id`, so the sending device swaps the line it showed while waiting for the group's. As on the User DO socket, the changes go to everyone with the group open first, then `Acked` to the sender.
- A change or unsend of someone else's line, or of an unsent one, a change of a line of days (it has no words), or words that do not fit (1 to `textLimits.chatMessage` characters, not blank) are refused: the line comes back to the sender as the group holds it, and the edit is acknowledged. A send that does not fit (words or days) is dropped. Taking a line of days back takes its days too.
- Catching up, a device gets every read mark and every change to a line written by its cursor, but of the lines written since, only each chat's latest `chatRules.pageSize` and every pinned line, for the pins over the chat; earlier ones it asks for as pages (`ChatPageRequest` with `before_seq`, 0 for the latest, answered by `ChatPage`: up to `chatRules.pageSize` lines before it, oldest first, and `at_start` once they reach the first). So a device away for long, or new, is not sent a chat's whole history.

The client caches messages by `seq` and records which contiguous ranges it holds (`cached_ranges(min_seq, max_seq)`).

- Scrolling past the edge of a cached range fetches the previous page and extends or merges ranges.
- Edits and deletions arrive through the change log and update cached messages; changes to uncached messages are ignored.
- After a reset, the client loads the latest page as a new range. The gap to older ranges is filled when the user scrolls to it.

### Read states

A thread is a group's shared chat or a direct chat between two members. Each (user, thread) pair has one watermark, `last_read_seq`: everything up to it counts as read. Chat is read in order, so per-message receipts are not needed.

- The Group DO stores `read_marks(user_id, thread_id, last_read_seq)` and only moves a watermark forward (`max`), never past the chat's last line. Updates from several devices, out of order or repeated, converge without conflict resolution. No mark reads as nothing read.
- Watermark changes go through the change log, so members see read markers update live. A message counts as read by every member whose watermark is at or past its `seq`.
- Unread count for a thread: messages with `seq > last_read_seq` not authored by the user.
- A member who joins starts at the thread's current head, so history before joining is not unread: joining moves their mark there.

Clients advance the watermark to the newest message shown on screen, batching updates while the user scrolls. The update goes through the outbox like a shift edit; since the server applies `max`, redelivery is harmless.

### Unread summary

Tab and app icon badges need unread counts across every group, without a socket to each Group DO. When a line is sent, the Group DO counts each other member's unread lines in that thread, and how many of them mention that member, and gives both to their User DO (`setUnread`), with the group's cursor they were counted at; a read does the same for the reader. The same call carries the line's notification (Push).

- The User DO keeps one `unread_counts` row per group and thread, in its own log like the memberships, and sends each change to the user's devices on their socket as an `UnreadCount`. Counts can arrive out of order, so one counted at an older group cursor than the row's changes nothing. A failed call is put right by the member's next count.
- Leaving a group deletes its rows, in the transaction that marks the membership left at a newer cursor, so the head never goes back; devices drop a group's counts as they hear of the leaving, and joining again starts at the chats' end.
- A device shows the group's count, except in a chat where a read of its own still waits to be sent: there it counts the lines it holds past that read, so reading clears the badge at once. A group's icon adds up its chats' counts as what notifies, from the count and the mentions as the chat is on or off (Chat notifications), the グループ tab all groups' (spec/chat.md, Unread lines).
- Reading on one device clears the badge on the user's other devices through the User DO.
- The APNs `badge` is the User DO's total of these counts as what notifies, sent with each notification (Push); the app also sets it from its own counts as lines are read.

## Push

- Each launch, a device with notifications allowed sends its APNs token (`UserService.RegisterPushToken`, `sandbox` from a development build); the User DO keeps it (`push_tokens`) and drops one APNs says is gone (410, or 400 BadDeviceToken).
- When a line is sent, the Group DO words a notification for each other member who may read the chat and has not blocked the writer, and gives it to their User DO with their new unread count and whether the line mentions them (`setUnread`). The User DO sends it to each of their devices when it notifies (Chat notifications), its badge the user's total of unread lines as what notifies.
- The server sends a localization key and its arguments (APNs `title-loc-key`/`loc-key` with their args), never words it has put together, so the app words them from its own strings: the title is the group's name (`CHAT_TITLE`), or the writer's in a one-to-one chat; the body is `CHAT_GROUP_{TEXT,PHOTO,DAYS,POLL}` with the writer's name first, or `CHAT_{…}` in a one-to-one chat. Words are sent with mentions as @name, cut at 200 characters. The payload carries `groupId` and `threadId`, which a tap opens, and `thread-id` stacks a chat's notifications together.
- Sent from the Worker straight to APNs over HTTP/2 with a token key (`APNS_KEY_ID`, `APNS_TEAM_ID`, the `.p8` as the `APNS_KEY` secret), its JWT reused for 50 minutes. A local `wrangler dev` cannot reach APNs, so it sends nothing.
- A notification is not shown while its chat is open on the device.

## Chat notifications

- `UserService.SetChatMuted` turns a chat's notifications off or on again, for the group's chat or a one-to-one chat of the user's (NOT_FOUND otherwise). The User DO keeps it (`chat_mutes`, one row a chat, kept when turned on again so devices catching up hear of it) and sends it to their devices as a `ChatMute` change.
- `UserService.SetChatNotifications` sets メンションはいつも通知 for the account (`chat_settings`), sent as a `ChatNotifications` change; before the user sets it none is sent, and it is on.
- The groups never hear of either: the User DO decides with them. A new line notifies in a chat that is on, or in one turned off when it mentions the user while メンションはいつも通知 is on; the counts follow the same rule (spec/chat.md, Notifications; spec/vectors/unread.json).

## Reports and blocks

- `ChatService.Report` keeps a report in D1 (`reports`): the reason, who reported whom, and what they saw, the line and the three on each side as the Group DO holds them, or the member's name. Only a member reports, only someone else, and only a line they may read. Nobody in the group is told.
- `UserService.SetBlocked` keeps the block in the user's User DO (`blocks`, one row a person, kept when unblocked so devices catching up hear of it) and sends it to their devices as a `Block` change. The User DO tells each of the user's groups (`member_blocks`) all of the user's blocks, before answering, so a group that missed one is put right by the next, and a group they join hears them too.
- A one-to-one chat's line from someone the other member had blocked when it was sent is kept with `hidden_from` and goes to that member without its content, `hidden` set, so their device keeps its place and shows nothing; it never counts as unread for them. Group chat lines go to everyone as they are, and the blocker's device folds them.

## Ephemeral state

Presence and typing describe the present moment only. They are never written to the change log, SQLite or the outbox, and nothing is replayed after a reconnect. The Group DO relays them as their own `ServerFrame` kinds to the sockets that need them.

### Presence

Presence means "has this thread open on screen", not "online in the app": mobile OSes stop sockets soon after the app leaves the foreground.

- No heartbeats. The Group DO lists open sockets with `ctx.getWebSockets()`, which works across hibernation, and each socket's attachment records its user and open thread.
- On connect, close and thread switch, the Group DO sends the change to other sockets in the thread.
- A user with several devices is present while any of their sockets is.

### Typing

- While composing, the client sends a typing frame at most every `chatRules.typingSendMs` (`design/src/chat.ts`), and a stop frame when it sends the message or the field becomes empty.
- Receivers show the indicator for `chatRules.typingShowMs` unless it is refreshed, so a lost stop frame cannot leave it stuck.
- The frames are `Typing` (thread, on) on the group socket. The Group DO relays each, with the writer's id it sets itself, to the sockets of the other users who may read that thread (both members alone for a one-to-one chat), never to the writer's own devices, and keeps nothing. The app also stops when the chat closes.

### An answer from Pochical's people

When Pochical's people answer in a user's chat with them (spec/admin.md), or react or take a line back, the User DO sends `SupportAnswered` on each of the user's sockets, with nothing in it and nothing kept: what shows the chat reads it again (`SupportService`). A device with no socket open hears of an answer by notification instead; of a reaction or a line taken back, as the chat next opens.

## Not yet specified

- Deleting an account: what goes (the User DO, memberships and what groups hold of the user, their messages' authorship) and how the user's other devices learn of it. Apple asks apps to revoke a deleted user's Sign in with Apple tokens; with none kept, deletion has the person sign in with Apple once more for a fresh code to revoke with
- Snapshot format for resets and how long each DO keeps its change log
- Resets for DOs that do not keep values as registers
- Presence and "last seen": whether to show them at all. Pochical is for family and friends, where visible presence and read markers can feel like pressure; typing alone may be enough. "Last seen" would also need storing in the User DO.
- Read state options: whether members see read markers (and whether users can turn them off), "mark as unread" (it moves the watermark back, so `max` would become a per-thread LWW register), and muted threads left out of badge totals (mentions: spec/chat.md)
