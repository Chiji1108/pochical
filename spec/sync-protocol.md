# Sync protocol

How clients and Durable Objects keep shifts, groups and chat in sync. The handshake and keepalive sections describe what `apps/server` implements today; the rest is the agreed design and will move into `proto/pochical/v1/sync.proto` as it is built.

## Ownership

| Data | Source of truth | Client storage |
| --- | --- | --- |
| A user's own shifts | That user's User DO | `my_shifts`: writable, changes go through the outbox |
| Members' shifts shown in a group | Projection held by the Group DO, fed by each member's User DO | `member_shifts`: read-only cache |
| Groups, members, chat, read states | Group DO | Read-only cache |

Clients never write to another user's data. A Group DO never edits shifts; it only stores what User DOs push to it.

## Sockets

Clients open one WebSocket to their User DO and one per group they are viewing, at `/v1/groups/{groupId}/socket`. Every message is binary: clients send `pochical.v1.ClientFrame`, the server sends `pochical.v1.ServerFrame` (see `proto/pochical/v1/sync.proto`). Text messages are protocol errors.

### Handshake

1. Before connecting, the client may call `SystemService.GetServerInfo` and ask the user to update when its protocol version is below `min_protocol_version`.
2. The first frame must be `Hello { protocol_version, cursor }`.
   - Below the server minimum: the server replies `ServerError { CODE_PROTOCOL_TOO_OLD }` and closes with 1008.
   - Otherwise it replies `Welcome { cursor }` with the head of the DO's change log.
3. Any other frame before `Hello` gets `ServerError { CODE_BAD_FRAME }` and the socket is closed with 1008.

### Keepalive

`Ping { nonce }` is answered with `Pong { nonce }`.

## Change log and cursor

Each DO keeps an append-only change log. Every accepted mutation (shift edit, message sent, message edited or deleted, read state moved) gets the next `cursor`, a `uint64` that only grows.

- After `Welcome`, the server sends every change after the client's cursor, then streams new changes as they happen.
- The client applies changes in cursor order and stores the last applied cursor in the same SQLite transaction.
- If the client's cursor is older than the oldest change the DO still keeps, the server tells it to reset: drop that DO's cache and load a fresh snapshot.

## Shifts

### Conflict resolution

Only the owner edits their shifts, so concurrent edits happen only between the owner's own devices while one of them is offline. Each field of a day's shift (pattern, start, end, memo) is a last-writer-wins register ordered by HLC. No text or list CRDT is needed; two devices editing the same memo offline keep the later edit.

Deleting a day's shift writes a tombstone instead of removing the row, so a device that was offline cannot resurrect it by sending an older edit.

### HLC

A hybrid logical clock value is `(physical_ms, counter, device_id)`, compared in that order.

- On a local edit: `physical_ms = max(now, last.physical_ms)`; if it did not advance, `counter = last.counter + 1`, otherwise `counter = 0`.
- On receiving a change: advance the local clock past the received value the same way, so any later local edit orders after it.
- `device_id` only breaks exact ties.

HLC, not arrival order, decides the winner: an edit made offline at 10:00 and delivered at 12:00 must lose to an edit made online at 11:00.

### Outbox

1. A local edit updates `my_shifts` and appends a row to the outbox in one SQLite transaction.
2. While connected, the client sends outbox rows in order, each with a unique `op_id` and its HLC.
3. The User DO applies each field only if its HLC is newer than the stored one, appends the result to its change log, and acknowledges the `op_id`. A repeated `op_id` is acknowledged without being applied again.
4. The client deletes acknowledged rows. Unsent rows survive app restarts.
5. If the server rejects an edit (validation), it writes a compensating change with a newer HLC, which reaches every device through the change log.

### Group projection

The User DO pushes each accepted change to every Group DO the user belongs to, keeping its own server-side outbox per group until the Group DO acknowledges. Because changes carry HLCs, the Group DO applies them idempotently and redeliveries are harmless.

- Only shared fields are pushed: pattern and times, not the private memo.
- On joining a group, the User DO backfills a window of shifts (for example three months either side of today).
- On leaving, the Group DO deletes that member's projected shifts and emits the deletion to members.

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

## Not yet specified

- Authentication and membership checks on connect
- Snapshot format for resets and how long each DO keeps its change log
- Wire messages for shift changes, outbox acknowledgements, chat pages and resets
- Presence and typing indicators
- Read state options: whether members see read markers (and whether users can turn them off), "mark as unread" (it moves the watermark back, so `max` would become a per-thread LWW register), mention counts, and muted threads left out of badge totals
