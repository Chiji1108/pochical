import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { DurableObject } from "cloudflare:workers";

import {
  ClientFrameSchema,
  ServerError_Code,
  ServerFrameSchema,
} from "./gen/pochical/v1/sync_pb";
import type { ClientFrame } from "./gen/pochical/v1/sync_pb";
import { MIN_PROTOCOL_VERSION } from "./protocol";

/** Per-socket state that survives hibernation. */
type SocketAttachment = {
  protocolVersion: number;
};

type ServerFrameKind = MessageInitShape<typeof ServerFrameSchema>["kind"];

/** WebSocket close code for protocol violations (RFC 6455). */
const POLICY_VIOLATION = 1008;

const isSocketAttachment = (value: unknown): value is SocketAttachment =>
  typeof value === "object" &&
  value !== null &&
  "protocolVersion" in value &&
  typeof value.protocolVersion === "number";

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

const handleHello = (ws: WebSocket, protocolVersion: number): void => {
  if (protocolVersion < MIN_PROTOCOL_VERSION) {
    rejectAndClose(
      ws,
      ServerError_Code.PROTOCOL_TOO_OLD,
      `Protocol ${protocolVersion} is below minimum ${MIN_PROTOCOL_VERSION}`
    );
    return;
  }
  ws.serializeAttachment({ protocolVersion } satisfies SocketAttachment);
  // The change log does not exist yet; cursor 0 means "nothing to sync".
  send(ws, { case: "welcome", value: { cursor: 0n } });
};

/**
 * One Durable Object per group. Sockets use the Hibernation API so an idle
 * group costs nothing while members stay connected.
 */
export class GroupRoom extends DurableObject<Env> {
  fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    const frame = decodeClientFrame(message);
    if (!frame) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        "Expected a binary ClientFrame"
      );
      return;
    }

    const { kind } = frame;
    if (kind.case === "hello") {
      handleHello(ws, kind.value.protocolVersion);
      return;
    }
    if (!isSocketAttachment(ws.deserializeAttachment())) {
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
  }
}
