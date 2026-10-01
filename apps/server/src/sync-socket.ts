import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";

import {
  ClientFrameSchema,
  ServerError_Code,
  ServerFrameSchema,
} from "./gen/pochical/v1/sync_pb";
import type { ClientFrame } from "./gen/pochical/v1/sync_pb";
import { MIN_PROTOCOL_VERSION } from "./protocol";

// The sync sockets User DOs and Group DOs share (spec/sync-protocol.md):
// accepting one for a signed-in user, and the handshake and keepalive.

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

type ServerFrameKind = MessageInitShape<typeof ServerFrameSchema>["kind"];

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

const send = (ws: WebSocket, kind: ServerFrameKind): void => {
  ws.send(toBinary(ServerFrameSchema, create(ServerFrameSchema, { kind })));
};

const rejectAndClose = (
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
  protocolVersion: number
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
  // The change log does not exist yet; cursor 0 means "nothing to sync".
  send(ws, { case: "welcome", value: { cursor: 0n } });
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
  if (userId === null) {
    return new Response("Sign in first", { status: 401 });
  }
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server);
  server.serializeAttachment({ userId } satisfies SocketAttachment);
  return new Response(null, { status: 101, webSocket: client });
};

/** One frame from a client: Hello first, then Ping. */
export const handleSyncMessage = (
  ws: WebSocket,
  message: ArrayBuffer | string
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
    handleHello(ws, attachment, kind.value.protocolVersion);
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
    // A frame kind from a newer client decodes as undefined.
    case undefined: {
      rejectAndClose(ws, ServerError_Code.BAD_FRAME, "Unknown frame kind");
    }
  }
};
