import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { syncLimits } from "@pochical/design/limits";
import { socketRules } from "@pochical/design/socket";

import {
  ClientFrameSchema,
  ServerError_Code,
  ServerFrameSchema,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatEdits,
  ChatPageRequest,
  ClientFrame,
  CoworkerEdits,
  DayEdits,
  PatternEdits,
  RepeatOrdersEdits,
} from "./gen/pochical/v1/sync_pb";
import { MIN_PROTOCOL_VERSION } from "./protocol";

// The sync sockets User DOs and Group DOs share (spec/sync-protocol.md):
// accepting one for a signed-in user, the handshake and keepalive, and
// handing each DO the frames that are its own.

/**
 * The header the Worker sets on a socket request once the session checks
 * out. Durable Objects are reached only through the Worker, which
 * overwrites whatever a client sent under this name.
 */
export const USER_HEADER = "X-Pochical-User";
/** The session the socket was opened with, set beside USER_HEADER. */
export const SESSION_HEADER = "X-Pochical-Session";

/** Per-socket state that survives hibernation. */
type SocketAttachment = {
  userId: string;
  // The session it was opened with, so ending the session closes it.
  sessionId: string;
  // Set once Hello is accepted.
  protocolVersion?: number;
};

type ServerFrameKind = MessageInitShape<typeof ServerFrameSchema>["kind"];

// The frames of the owner's edits of what they own, by their kind.
type EditFrames = {
  dayEdits: DayEdits;
  patternEdits: PatternEdits;
  repeatOrdersEdits: RepeatOrdersEdits;
  coworkerEdits: CoworkerEdits;
};

// What a DO does with each kind of edit; only a User DO takes them.
type EditHandlers = {
  [Kind in keyof EditFrames]?: (ws: WebSocket, edits: EditFrames[Kind]) => void;
};

/** What a Group DO does with a member's chat frames. */
type ChatHandlers = {
  chatEdits?: (ws: WebSocket, userId: string, edits: ChatEdits) => void;
  chatPageRequest?: (ws: WebSocket, request: ChatPageRequest) => void;
};

/** What a DO does with a socket once it is past the handshake. */
type SyncHandlers = EditHandlers &
  ChatHandlers & {
    // Hello was accepted: send Welcome and every change after `cursor`.
    welcome: (ws: WebSocket, cursor: bigint) => void;
  };

const GROUP_SOCKET_ONLY = "Chats go to a group's socket";

const OWN_SOCKET_ONLY = "Edits go to the user's own socket";

/** WebSocket close code for protocol violations (RFC 6455). */
const POLICY_VIOLATION = 1008;

const attachmentOf = (ws: WebSocket): SocketAttachment | null => {
  const value: unknown = ws.deserializeAttachment();
  if (
    typeof value !== "object" ||
    value === null ||
    !("userId" in value) ||
    typeof value.userId !== "string" ||
    !("sessionId" in value) ||
    typeof value.sessionId !== "string"
  ) {
    return null;
  }
  const protocolVersion =
    "protocolVersion" in value && typeof value.protocolVersion === "number"
      ? value.protocolVersion
      : undefined;
  return { protocolVersion, sessionId: value.sessionId, userId: value.userId };
};

const decodeClientFrame = (
  message: ArrayBuffer | string
): ClientFrame | null => {
  if (typeof message === "string") {
    return null;
  }
  try {
    return fromBinary(ClientFrameSchema, new Uint8Array(message));
  } catch {
    return null;
  }
};

export const send = (ws: WebSocket, kind: ServerFrameKind): void => {
  ws.send(toBinary(ServerFrameSchema, create(ServerFrameSchema, { kind })));
};

/**
 * Welcome at the DO's head, with the server's time for the device to
 * correct its clock by (spec/sync-protocol.md, HLC).
 */
const sendWelcome = (ws: WebSocket, head: number): void => {
  send(ws, {
    case: "welcome",
    value: { cursor: BigInt(head), serverMs: BigInt(Date.now()) },
  });
};

export const rejectAndClose = (
  ws: WebSocket,
  code: ServerError_Code,
  message: string
): void => {
  send(ws, { case: "error", value: { code, message } });
  ws.close(POLICY_VIOLATION, message);
};

const handleHello = (
  ws: WebSocket,
  attachment: SocketAttachment,
  { protocolVersion, cursor }: { protocolVersion: number; cursor: bigint },
  handlers: SyncHandlers
): void => {
  if (protocolVersion < MIN_PROTOCOL_VERSION) {
    rejectAndClose(
      ws,
      ServerError_Code.PROTOCOL_TOO_OLD,
      `Protocol ${protocolVersion} is below minimum ${MIN_PROTOCOL_VERSION}`
    );
    return;
  }
  ws.serializeAttachment({
    ...attachment,
    protocolVersion,
  } satisfies SocketAttachment);
  handlers.welcome(ws, cursor);
};

/** Changes in cursor order, as frames of up to syncLimits.changesPerFrame. */
const sendChanges = (ws: WebSocket, changes: Change[]): void => {
  for (let at = 0; at < changes.length; at += syncLimits.changesPerFrame) {
    send(ws, {
      case: "changes",
      value: { changes: changes.slice(at, at + syncLimits.changesPerFrame) },
    });
  }
};

/** Whether the socket is past Hello, so changes may be sent to it. */
const isSynced = (ws: WebSocket): boolean =>
  attachmentOf(ws)?.protocolVersion !== undefined;

/** Changes gathered from a DO's several logs, in cursor order. */
export const byCursor = (changes: Change[]): Change[] =>
  changes.toSorted((a, b) => (a.cursor < b.cursor ? -1 : 1));

/**
 * Welcome at the DO's head, then every value changed after the device's
 * cursor. Each value keeps only its latest change, so this reaches back
 * any distance; a device ahead of the DO (its data restored from an older
 * copy) is told to reset and gets everything.
 */
export const welcome = (
  ws: WebSocket,
  cursor: bigint,
  head: number,
  changesAfter: (cursor: number) => Change[]
): void => {
  sendWelcome(ws, head);
  if (cursor > BigInt(head)) {
    send(ws, { case: "reset", value: {} });
    sendChanges(ws, changesAfter(0));
    return;
  }
  sendChanges(ws, changesAfter(Number(cursor)));
};

/**
 * Sends changes to every socket of the DO past Hello: each of the user's
 * devices, or everyone with the group open.
 */
export const broadcastChanges = (
  ctx: DurableObjectState,
  changes: Change[]
): void => {
  for (const socket of ctx.getWebSockets()) {
    if (isSynced(socket)) {
      sendChanges(socket, changes);
    }
  }
};

/**
 * Has the runtime answer a device's keepalive text, so a socket kept
 * alive does not wake a hibernating Durable Object (spec/sync-protocol.md,
 * Keepalive). Set as each DO starts.
 */
export const answerKeepalive = (ctx: DurableObjectState): void => {
  ctx.setWebSocketAutoResponse(
    new WebSocketRequestResponsePair(
      socketRules.keepaliveText,
      socketRules.keepaliveReply
    )
  );
};

/**
 * Accepts the socket the Worker forwarded, for the user it named. Uses the
 * Hibernation API, so an idle object costs nothing while clients stay
 * connected.
 */
export const acceptSyncSocket = (
  ctx: DurableObjectState,
  request: Request
): Response => {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const userId = request.headers.get(USER_HEADER);
  const sessionId = request.headers.get(SESSION_HEADER);
  if (userId === null || sessionId === null) {
    return new Response("Sign in first", { status: 401 });
  }
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server);
  server.serializeAttachment({ sessionId, userId } satisfies SocketAttachment);
  return new Response(null, { status: 101, webSocket: client });
};

/** WebSocket close code for a normal closure (RFC 6455). */
const NORMAL_CLOSURE = 1000;

/**
 * Closes the sockets opened with a session that has ended (signed out, or
 * the account deleted), which were let in when it was live. A device that
 * reconnects is then refused with 401 (spec/sync-protocol.md, Reconnecting).
 */
export const closeSessionSockets = (
  ctx: DurableObjectState,
  sessionId: string
): void => {
  for (const socket of ctx.getWebSockets()) {
    if (attachmentOf(socket)?.sessionId === sessionId) {
      socket.close(NORMAL_CLOSURE, "Session ended");
    }
  }
};

/** Closes a user's sockets on a DO they no longer reach, as a group they left. */
export const closeUserSockets = (
  ctx: DurableObjectState,
  userId: string
): void => {
  for (const socket of ctx.getWebSockets()) {
    if (attachmentOf(socket)?.userId === userId) {
      socket.close(NORMAL_CLOSURE, "Left the group");
    }
  }
};

// Edits go to the DO's handler for their kind; a DO without one is not the
// user's own.
const handleEdits = <Kind extends keyof EditFrames>(
  ws: WebSocket,
  { case: kind, value }: { case: Kind; value: EditFrames[Kind] },
  handlers: EditHandlers
): void => {
  const handle = handlers[kind];
  if (handle) {
    handle(ws, value);
  } else {
    rejectAndClose(ws, ServerError_Code.BAD_FRAME, OWN_SOCKET_ONLY);
  }
};

/** One frame from a client: Hello first, then the rest. */
export const handleSyncMessage = (
  ws: WebSocket,
  message: ArrayBuffer | string,
  handlers: SyncHandlers
): void => {
  const frame = decodeClientFrame(message);
  const attachment = attachmentOf(ws);
  if (!(frame && attachment)) {
    rejectAndClose(
      ws,
      ServerError_Code.BAD_FRAME,
      "Expected a binary ClientFrame"
    );
    return;
  }

  const { kind } = frame;
  if (kind.case === "hello") {
    handleHello(ws, attachment, kind.value, handlers);
    return;
  }
  if (attachment.protocolVersion === undefined) {
    rejectAndClose(ws, ServerError_Code.BAD_FRAME, "Send Hello first");
    return;
  }

  switch (kind.case) {
    case "ping": {
      send(ws, { case: "pong", value: { nonce: kind.value.nonce } });
      return;
    }
    case "dayEdits":
    case "patternEdits":
    case "repeatOrdersEdits":
    case "coworkerEdits": {
      handleEdits(ws, kind, handlers);
      return;
    }
    case "chatEdits": {
      if (handlers.chatEdits) {
        handlers.chatEdits(ws, attachment.userId, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, GROUP_SOCKET_ONLY);
      }
      return;
    }
    case "chatPageRequest": {
      if (handlers.chatPageRequest) {
        handlers.chatPageRequest(ws, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, GROUP_SOCKET_ONLY);
      }
      return;
    }
    // A frame kind from a newer client decodes as undefined.
    case undefined: {
      rejectAndClose(ws, ServerError_Code.BAD_FRAME, "Unknown frame kind");
    }
  }
};
