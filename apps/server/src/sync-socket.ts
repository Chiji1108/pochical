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

/** Per-socket state that survives hibernation. */
type SocketAttachment = {
  userId: string;
  // Set once Hello is accepted.
  protocolVersion?: number;
};

export type ServerFrameKind = MessageInitShape<
  typeof ServerFrameSchema
>["kind"];

/** What a DO does with a socket once it is past the handshake. */
export type SyncHandlers = {
  // Hello was accepted: send Welcome and every change after `cursor`.
  welcome: (ws: WebSocket, cursor: bigint) => void;
  // The owner's edits of what they own; only a User DO takes them.
  dayEdits?: (ws: WebSocket, edits: DayEdits) => void;
  patternEdits?: (ws: WebSocket, edits: PatternEdits) => void;
  repeatOrdersEdits?: (ws: WebSocket, edits: RepeatOrdersEdits) => void;
  coworkerEdits?: (ws: WebSocket, edits: CoworkerEdits) => void;
};

const OWN_SOCKET_ONLY = "Edits go to the user's own socket";

/** WebSocket close code for protocol violations (RFC 6455). */
const POLICY_VIOLATION = 1008;

const attachmentOf = (ws: WebSocket): SocketAttachment | null => {
  const value: unknown = ws.deserializeAttachment();
  if (
    typeof value !== "object" ||
    value === null ||
    !("userId" in value) ||
    typeof value.userId !== "string"
  ) {
    return null;
  }
  const protocolVersion =
    "protocolVersion" in value && typeof value.protocolVersion === "number"
      ? value.protocolVersion
      : undefined;
  return { protocolVersion, userId: value.userId };
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
export const sendWelcome = (ws: WebSocket, head: number): void => {
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
export const sendChanges = (ws: WebSocket, changes: Change[]): void => {
  for (let at = 0; at < changes.length; at += syncLimits.changesPerFrame) {
    send(ws, {
      case: "changes",
      value: { changes: changes.slice(at, at + syncLimits.changesPerFrame) },
    });
  }
};

/** Whether the socket is past Hello, so changes may be sent to it. */
export const isSynced = (ws: WebSocket): boolean =>
  attachmentOf(ws)?.protocolVersion !== undefined;

/**
 * Accepts the socket the Worker forwarded, for the user it named. Uses the
 * Hibernation API, so an idle object costs nothing while clients stay
 * connected.
 */
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

export const acceptSyncSocket = (
  ctx: DurableObjectState,
  request: Request
): Response => {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  const userId = request.headers.get(USER_HEADER);
  if (userId === null) {
    return new Response("Sign in first", { status: 401 });
  }
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server);
  server.serializeAttachment({ userId } satisfies SocketAttachment);
  return new Response(null, { status: 101, webSocket: client });
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
    case "dayEdits": {
      if (handlers.dayEdits) {
        handlers.dayEdits(ws, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, OWN_SOCKET_ONLY);
      }
      return;
    }
    case "patternEdits": {
      if (handlers.patternEdits) {
        handlers.patternEdits(ws, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, OWN_SOCKET_ONLY);
      }
      return;
    }
    case "repeatOrdersEdits": {
      if (handlers.repeatOrdersEdits) {
        handlers.repeatOrdersEdits(ws, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, OWN_SOCKET_ONLY);
      }
      return;
    }
    case "coworkerEdits": {
      if (handlers.coworkerEdits) {
        handlers.coworkerEdits(ws, kind.value);
      } else {
        rejectAndClose(ws, ServerError_Code.BAD_FRAME, OWN_SOCKET_ONLY);
      }
      return;
    }
    // A frame kind from a newer client decodes as undefined.
    case undefined: {
      rejectAndClose(ws, ServerError_Code.BAD_FRAME, "Unknown frame kind");
    }
  }
};
