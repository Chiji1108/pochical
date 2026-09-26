import { exports } from "cloudflare:workers";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  ClientFrameSchema,
  ServerError_Code,
  type ServerFrame,
  ServerFrameSchema,
} from "../src/gen/pochical/v1/sync_pb";
import {
  CURRENT_PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
} from "../src/protocol";

const ORIGIN = "https://server.test";

const openGroupSocket = async (groupId: string): Promise<WebSocket> => {
  const response = await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/socket`,
    {
      headers: { Upgrade: "websocket" },
    }
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) {
    throw new Error("Upgrade response had no WebSocket");
  }
  socket.accept();
  return socket;
};

const nextFrame = async (socket: WebSocket): Promise<ServerFrame> => {
  // A workerd client socket delivers binary messages as Blob.
  const data = await new Promise<Blob>((resolve) => {
    socket.addEventListener("message", (event) => resolve(event.data as Blob), {
      once: true,
    });
  });
  return fromBinary(
    ServerFrameSchema,
    new Uint8Array(await data.arrayBuffer())
  );
};

const sendFrame = (
  socket: WebSocket,
  kind: Parameters<typeof create<typeof ClientFrameSchema>>[1]
): void => {
  socket.send(toBinary(ClientFrameSchema, create(ClientFrameSchema, kind)));
};

describe("SystemService", () => {
  it("returns protocol versions over Connect JSON", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/pochical.v1.SystemService/GetServerInfo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.minProtocolVersion).toBe(MIN_PROTOCOL_VERSION);
    expect(body.currentProtocolVersion).toBe(CURRENT_PROTOCOL_VERSION);
    expect(typeof body.serverTime).toBe("string");
  });
});

describe("group socket", () => {
  it("welcomes a client after Hello and answers Ping", async () => {
    const socket = await openGroupSocket("welcome");

    const welcome = nextFrame(socket);
    sendFrame(socket, {
      kind: {
        case: "hello",
        value: { protocolVersion: CURRENT_PROTOCOL_VERSION },
      },
    });
    expect((await welcome).kind).toMatchObject({
      case: "welcome",
      value: { cursor: 0n },
    });

    const pong = nextFrame(socket);
    sendFrame(socket, { kind: { case: "ping", value: { nonce: 42 } } });
    expect((await pong).kind).toMatchObject({
      case: "pong",
      value: { nonce: 42 },
    });
  });

  it("rejects frames sent before Hello", async () => {
    const socket = await openGroupSocket("no-hello");

    const reply = nextFrame(socket);
    sendFrame(socket, { kind: { case: "ping", value: { nonce: 1 } } });
    expect((await reply).kind).toMatchObject({
      case: "error",
      value: { code: ServerError_Code.BAD_FRAME },
    });
  });

  it("rejects clients below the minimum protocol version", async () => {
    const socket = await openGroupSocket("too-old");

    const reply = nextFrame(socket);
    sendFrame(socket, {
      kind: {
        case: "hello",
        value: { protocolVersion: MIN_PROTOCOL_VERSION - 1 },
      },
    });
    expect((await reply).kind).toMatchObject({
      case: "error",
      value: { code: ServerError_Code.PROTOCOL_TOO_OLD },
    });
  });
});
