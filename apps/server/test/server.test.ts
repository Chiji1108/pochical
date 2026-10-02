import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { socketRules } from "@pochical/design/socket";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  ClientFrameSchema,
  ServerError_Code,
  ServerFrameSchema,
} from "../src/gen/pochical/v1/sync_pb";
import type { ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import {
  CURRENT_PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
} from "../src/protocol";
import { memberOf, openSocket, ORIGIN } from "./helpers";

const openGroupSocket = async (groupId: string): Promise<WebSocket> =>
  await openSocket(`/v1/groups/${groupId}/socket`, await memberOf(groupId));

const nextFrame = async (socket: WebSocket): Promise<ServerFrame> => {
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  socket.addEventListener(
    "message",
    (event) => {
      // A workerd client socket delivers binary messages as Blob.
      if (event.data instanceof Blob) {
        resolve(event.data);
      } else {
        reject(new Error("Expected a binary message"));
      }
    },
    { once: true }
  );
  const data = await promise;
  return fromBinary(
    ServerFrameSchema,
    new Uint8Array(await data.arrayBuffer())
  );
};

const nextText = async (socket: WebSocket): Promise<unknown> => {
  const { promise, resolve } = Promise.withResolvers<unknown>();
  socket.addEventListener(
    "message",
    (event) => {
      resolve(event.data);
    },
    { once: true }
  );
  return await promise;
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
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.minProtocolVersion).toBe(MIN_PROTOCOL_VERSION);
    expect(body.currentProtocolVersion).toBe(CURRENT_PROTOCOL_VERSION);
    expect(body.serverTime).toBeTypeOf("string");
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
    const { kind: welcomeKind } = await welcome;
    expect(welcomeKind).toMatchObject({
      case: "welcome",
      value: { cursor: 0n },
    });

    const pong = nextFrame(socket);
    sendFrame(socket, { kind: { case: "ping", value: { nonce: 42 } } });
    const { kind: pongKind } = await pong;
    expect(pongKind).toMatchObject({
      case: "pong",
      value: { nonce: 42 },
    });
  });

  it("answers the keepalive text, before Hello and after", async () => {
    const socket = await openGroupSocket("keepalive");

    const reply = nextText(socket);
    socket.send(socketRules.keepaliveText);
    await expect(reply).resolves.toBe(socketRules.keepaliveReply);

    // The keepalive is not a protocol error: Hello still welcomes.
    const welcome = nextFrame(socket);
    sendFrame(socket, {
      kind: {
        case: "hello",
        value: { protocolVersion: CURRENT_PROTOCOL_VERSION },
      },
    });
    await expect(welcome).resolves.toMatchObject({
      kind: { case: "welcome" },
    });

    const again = nextText(socket);
    socket.send(socketRules.keepaliveText);
    await expect(again).resolves.toBe(socketRules.keepaliveReply);
  });

  it("rejects frames sent before Hello", async () => {
    const socket = await openGroupSocket("no-hello");

    const reply = nextFrame(socket);
    sendFrame(socket, { kind: { case: "ping", value: { nonce: 1 } } });
    const { kind: replyKind } = await reply;
    expect(replyKind).toMatchObject({
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
    const { kind: replyKind } = await reply;
    expect(replyKind).toMatchObject({
      case: "error",
      value: { code: ServerError_Code.PROTOCOL_TOO_OLD },
    });
  });
});
