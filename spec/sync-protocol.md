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

- A client signs in with `POST /api/auth/sign-in/anonymous`, sending `Content-Type: application/json` and the body `{}` (better-auth answers 415 without them), and keeps the session token from the response's `set-auth-token` header: iOS in the Keychain and Android in Block Store, so a reinstall comes back as the same user.
- It sends the token as `Authorization: Bearer <token>` on every Connect call and socket. Calls without a valid one fail with `UNAUTHENTICATED`; sockets get 401. `UserService.GetMe` says whose token it is.
- A session lasts for good, until the user signs out or deletes their account. An anonymous user's token is their only key, so an expiry would only lock out someone who did not open the app for a while (a widget is enough to keep using it). better-auth puts a session's lifetime on its cookie too, which may last at most 400 days, so the server stores each session to expire a century on and never refreshes it (`apps/server/src/auth.ts`); the apps use the token, not the cookie.
- Each user has a User DO named by their user id. It records the groups they are in.
- A session keeps its token and its user only: better-auth's IP address and user agent are left empty, so the server holds no one's address or device.
- Linking Apple or Google keeps the user: the app gets the provider's ID token (Sign in with Apple; Google through Credential Manager or Google Sign-In) and sends it on the signed-in session to `POST /api/auth/link-social` (`{ provider, idToken: { token, nonce } }`). The user id stays, and with it their User DO, groups and messages; the user is no longer anonymous once linked. better-auth's way for an anonymous user to sign in with a provider (`/sign-in/social`), which makes a new user and deletes the anonymous one, is used only to switch, below. (Not built yet: marking the user as no longer anonymous.)
- When the provider's account belongs to another user already, `/link-social` answers 409 (`SOCIAL_ACCOUNT_ALREADY_LINKED`): that user holds the person's earlier data, as on a new phone. The app asks first, then signs in to that user with `/sign-in/social` and the same ID token; the anonymous user on this device, and what was entered there, are deleted as deleting an account deletes them (not built yet). A new phone's first launch offers signing in with Apple or Google before anything is entered, so there is seldom anything to lose.
- A user who never linked and loses both their phone and its stored token cannot be reached again. That is why the app suggests linking, at moments its screens decide.
- Cloudflare's rate limiting holds back what an anonymous account makes cheap, by the limiters in `apps/server/wrangler.jsonc` (`ratelimits`, where their numbers are): anonymous sign-ins per client address, answered with 429, and groups made per user, answered with `RESOURCE_EXHAUSTED`. The address is only counted, never kept.

## Groups

`GroupService` (`proto/pochical/v1/group.proto`) makes groups and lets people into them; every call needs a session.

- Creating a group gives it a random id, sets up its Group DO with the name, the emoji mark and the maker as its first member, and issues its first invitation code.
- A group has one live code, held in D1 (`invites`, from code to group), the only place a link can be looked up. Remaking it replaces the row, so the old link stops working at once. `InviteService.GetInvitePreview` answers anyone holding a live code with the group's name, mark and member count.
- Joining with a live code adds the user to the Group DO, which decides membership, and then to the user's own DO, which keeps their groups for checking sockets. Both steps can be repeated, so a retry after a failure between them completes the join; joining a group you are in changes nothing and says so.
- Only members read or remake a group's link.
- A group has at most `GROUP_MAX_MEMBERS` members (`design/src/limits.ts`). The Group DO counts and adds in one step, so two people joining at once cannot both take the last place; a join past it fails with `RESOURCE_EXHAUSTED`, which the app shows as the group being full.
- What anyone holding a link sees, on the site and in a link's card, is the group's name, mark and member count only. The app's join screen shows who is in the group before joining, through `GroupService.GetInvite`, which needs a session.

## Sockets

Clients open one WebSocket to their User DO, at `/v1/me/socket`, and one per group they are viewing, at `/v1/groups/{groupId}/socket`. The Worker checks the session before either reaches a Durable Object, and lets a group socket through only when the user's own DO lists the group, so an id that is not theirs is refused (403) without waking or creating a Group DO. Every message is binary: clients send `pochical.v1.ClientFrame`, the server sends `pochical.v1.ServerFrame` (see `proto/pochical/v1/sync.proto`). Text messages are protocol errors.

### Handshake

1. Before connecting, the client may call `SystemService.GetServerInfo` and ask the user to update when its protocol version is below `min_protocol_version`.
2. The first frame must be `Hello { protocol_version, cursor }`.
   - Below the server minimum: the server replies `ServerError { CODE_PROTOCOL_TOO_OLD }` and closes with 1008.
   - Otherwise it replies `Welcome { cursor, server_ms }` with the head of the DO's change log and the server's time, which the device corrects its clock by (HLC).
3. Any other frame before `Hello` gets `ServerError { CODE_BAD_FRAME }` and the socket is closed with 1008.

### Keepalive

`Ping { nonce }` is answered with `Pong { nonce }`.

## Change log and cursor

Each DO keeps an append-only change log. Every accepted mutation (shift edit, message sent, message edited or deleted, read state moved) gets the next `cursor`, a `uint64` that only grows.

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
- `device_id` only breaks exact ties.

HLC, not arrival order, decides the winner: an edit made offline at 10:00 and delivered at 12:00 must lose to an edit made online at 11:00.

`now` is the device's time corrected by the server's, so a device whose clock is set wrong cannot win over later edits, nor carry every device that takes its edits along with it:

- Each `Welcome` carries the server's time, `server_ms`. The device's offset is `server_ms` less the middle of the round trip, from when it sent `Hello` to when `Welcome` arrived, divided as whole numbers (offset). It keeps the last offset across launches, 0 before its first `Welcome`, and `now` is its own time plus the offset.
- The server refuses a frame of edits in which any clock runs more than `syncLimits.clockAheadMs` (`design/src/limits.ts`) past its own time: `ServerError { CODE_CLOCK_AHEAD }`, nothing in the frame is taken, and the socket is closed (ahead). A corrected clock stays well within it, so this catches edits stamped before the device's first `Welcome` or before its clock was changed.
- On each `Welcome`, before sending its outbox, the device takes its last clock back to `now` if it is that far ahead (only unsent edits can have carried it there: the server sends no such clock), then gives every unsent edit whose clock is that far ahead a new clock from a local edit's tick, in outbox order. After `CODE_CLOCK_AHEAD` it reconnects and does the same.

### Outbox

1. A local edit updates `my_shifts` and appends a row to the outbox in one SQLite transaction.
2. While connected, the client sends outbox rows in order, each with a unique `op_id` and its HLC.
3. The User DO applies each field only if its HLC is newer than the stored one, appends the result to its change log, and acknowledges the `op_id`. A repeated edit carries the same HLC, so it is acknowledged without being applied again.
4. The client deletes acknowledged rows. Unsent rows survive app restarts.
5. If the server rejects an edit (validation), it writes a compensating change with a newer HLC, which reaches every device through the change log.

### On the wire

The User DO socket carries a user's days (`proto/pochical/v1/sync.proto`); a Group DO socket refuses them.

- A `DayValue` is one field of one day: `date` ("YYYY-MM-DD"), `field` (`DAY_FIELD_PATTERN`, `_START`, `_END`, `_NOTE`, `_PEOPLE`), an optional `value` (unset clears the field) and its `Hlc`. A day whose `DAY_FIELD_PATTERN` is unset follows its repeating order, and has no shift where no order applies; a pattern of `dayRules.noShift` (`""`, `design/src/days.ts`) is a day with no shift, order or not (Repeating orders); keep it apart from no pattern everywhere, as its note there says.
- The client sends `DayEdits`, up to `syncLimits.editsPerFrame` a frame (`design/src/limits.ts`; every edit frame alike), each with its `op_id`. The server answers the sender with `Acked` for all of them, then sends each value it changed, as `Changes`, to every device of the user that is past Hello, the sender included, so every device moves its cursor the same way.
- An edit for no real day or field, or without a clock, is acknowledged and dropped: there is nothing to keep or correct.
- An edit whose value does not fit its field (a pattern that is neither `dayRules.noShift` nor an id, an id being up to `syncLimits.idLength` characters with no spaces as `apps/server/src/ids.ts` has it; a time not `HH:MM`; a memo past `textLimits.dayNote`) but whose clock is newer than the stored one is answered with the stored value (or none) under a clock just past the edit's, stamped with device `server`: the compensating change of Outbox step 5.
- After `Welcome`, a device gets its catch-up as `Changes` of up to `syncLimits.changesPerFrame` values each, in cursor order.
- Patterns go the same way, as `PatternEdits`: each pattern is one last-writer-wins `PatternValue`, sent whole (a deleted one has no `pattern`, kept so an older edit cannot bring it back), and the order they are shown in is one more, `PatternOrder`. They share the User DO's cursor with days, so a device catches up on both in one order. A pattern that does not fit (spec/shift-patterns.md: a blank name or one past `textLimits.shiftName`, a mark that is not one emoji and at most `textLimits.shiftMark` letters, a color past the palette, one time without the other, a `next_day` naming itself) or an order with an id twice is corrected as a day's value is.

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
- A day's people are one more day field, `DAY_FIELD_PEOPLE`: coworker ids separated by spaces, in the order they were added; no id the apps make holds a space (`apps/server/src/ids.ts`). Days hold ids, so renaming a coworker changes one value; a deleted coworker's id is skipped where it is shown and needs no rewrite of days.
- A user keeps at most `COWORKERS_MAX` coworkers (`design/src/limits.ts`). Adding past it, in 一緒に働く人 or from a day, stops with a problem toast, 一緒に働く人は{n}人までです, and the User DO refuses a new coworker past it: it answers with the coworker deleted, as a value that does not fit. Their order holds at most as many ids; a longer one names coworkers the server refused, and is answered with the person's order of those they keep.
- Like the memo, coworkers and a day's people stay with their owner: they name people outside the app, so they are never pushed to groups.

### Group projection

The User DO pushes what its groups see of the user to every Group DO the user belongs to. Values carry their HLCs, so the Group DO keeps each one only when it is newer: a push that arrives twice or late changes nothing.

- Only shared values are pushed: each day's pattern and times, never the memo or the people, the user's patterns, so members can draw their marks, and their repeating orders, so members' apps work their days out as the user's own do (`MemberRepeatOrders`). The patterns' order is the user's own.
- For each group the User DO keeps how far it has pushed (`pushed_cursor`, a cursor of its own log). After any change, and on joining or making a group, its alarm pushes each group the shared values changed after that cursor, then moves it. A group that cannot be reached fails the alarm, which the runtime retries, so the values reach it later.
- On joining, `pushed_cursor` starts at 0, so the group gets everything the user has.
- The Group DO takes a push (`takeMemberShifts`, `pochical.v1.Changes` as bytes) only from a current member, keeps the values at its own cursor, and sends them to the members with the group open as `MemberDay` and `MemberPattern` changes. A group socket catches up from its cursor as a User DO socket does.
- On leaving, the Group DO deletes that member's projected shifts and emits the deletion to members (not built yet: leaving is not either).

## Chat

Chat has two orders that must not be mixed:

- `seq`: a message's position in the conversation, used for display and paging (`before_seq`, page size).
- `cursor`: the Group DO's change log, used for sync. New messages, edits, deletions and read states all arrive in cursor order.

The client caches messages by `seq` and records which contiguous ranges it holds (`cached_ranges(min_seq, max_seq)`).

- Scrolling past the edge of a cached range fetches the previous page and extends or merges ranges.
- Edits and deletions arrive through the change log and update cached messages; changes to uncached messages are ignored.
- After a reset, the client loads the latest page as a new range. The gap to older ranges is filled when the user scrolls to it.

### Read states

A thread is a group's shared chat or a direct chat between two members. Each (user, thread) pair has one watermark, `last_read_seq`: everything up to it counts as read. Chat is read in order, so per-message receipts are not needed.

- The Group DO stores `read_states(user_id, thread_id, last_read_seq)` and only moves a watermark forward (`max`). Updates from several devices, out of order or repeated, converge without conflict resolution.
- Watermark changes go through the change log, so members see read markers update live. A message counts as read by every member whose watermark is at or past its `seq`.
- Unread count for a thread: messages with `seq > last_read_seq` not authored by the user.
- A member who joins starts at the thread's current head, so history before joining is not unread.

Clients advance the watermark to the newest message shown on screen, batching updates while the user scrolls. The update goes through the outbox like a shift edit; since the server applies `max`, redelivery is harmless.

### Unread summary

Tab and app icon badges need unread counts across every group, without a socket to each Group DO. When a message is accepted, the Group DO already notifies each member's User DO to send push notifications; the same call carries the member's new unread count for that thread, and watermark changes do the same.

- The User DO keeps `unread_by_thread` and streams it to the user's devices over the User DO socket.
- The APNs `badge` and FCM notification count come from the User DO's total.
- Reading on one device clears the badge on the user's other devices through the User DO.

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

## Not yet specified

- Deleting an account: what goes (the User DO, memberships and what groups hold of the user, their messages' authorship) and how the user's other devices learn of it
- Snapshot format for resets and how long each DO keeps its change log
- Wire messages for chat pages, and resets for DOs that do not keep values as registers
- Push notifications (chat, mentions): the server sends a localization key and its arguments (APNs `loc-key`/`loc-args`, FCM `body_loc_key`/`body_loc_args`), never text it has put together, so the app words them in its own language and the server need not know each reader's
- Presence and "last seen": whether to show them at all. Pochical is for family and friends, where visible presence and read markers can feel like pressure; typing alone may be enough. "Last seen" would also need storing in the User DO.
- Read state options: whether members see read markers (and whether users can turn them off), "mark as unread" (it moves the watermark back, so `max` would become a per-thread LWW register), and muted threads left out of badge totals (mentions: spec/chat.md)
