# Group socket protocol

Clients open one WebSocket per group at `/v1/groups/{groupId}/socket`.
Every message is binary: clients send `pochical.v1.ClientFrame`, the server
sends `pochical.v1.ServerFrame` (see `proto/pochical/v1/sync.proto`).
Text messages are protocol errors.

## Handshake

1. Before connecting, the client may call `SystemService.GetServerInfo` and
   ask the user to update when its protocol version is below
   `min_protocol_version`.
2. The first frame must be `Hello { protocol_version, cursor }`.
   - Below the server minimum: the server replies
     `ServerError { CODE_PROTOCOL_TOO_OLD }` and closes with 1008.
   - Otherwise it replies `Welcome { cursor }` with the head of the group's
     change log.
3. Any other frame before `Hello` gets `ServerError { CODE_BAD_FRAME }` and
   the socket is closed with 1008.

## Keepalive

`Ping { nonce }` is answered with `Pong { nonce }`.

## Not yet specified

- Authentication and membership checks on connect
- Change log, cursors and the client outbox (per-field HLC, last writer wins)
- Chat messages and read states
