import { socketRules } from "@pochical/design/socket";
import { describe, expect, it } from "vitest";

import { ServerError_Code } from "../src/gen/pochical/v1/sync_pb";
import {
  CURRENT_PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
} from "../src/protocol";
import { call, memberOf, openSocket, signInAnonymously } from "./helpers";
import { framesOf, sendFrame } from "./sync-helpers";

const openGroupSocket = async (groupId: string): Promise<WebSocket> =>
  await openSocket(`/v1/groups/${groupId}/socket`, await memberOf(groupId));

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

describe("SystemService", () => {
  it("returns protocol versions over Connect JSON", async () => {
    const response = await call("SystemService/GetServerInfo", {});
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
    const frames = framesOf(socket);

    sendFrame(socket, {
      case: "hello",
      value: { protocolVersion: CURRENT_PROTOCOL_VERSION },
    });
    const { kind: welcomeKind } = await frames.next();
    expect(welcomeKind).toMatchObject({
      case: "welcome",
      value: { cursor: 0n },
    });

    sendFrame(socket, { case: "ping", value: { nonce: 42 } });
    const { kind: pongKind } = await frames.next();
    expect(pongKind).toMatchObject({
      case: "pong",
      value: { nonce: 42 },
    });
  });

  it("answers the keepalive text, before Hello and after", async () => {
    const socket = await openGroupSocket("keepalive");
    const frames = framesOf(socket);

    const reply = nextText(socket);
    socket.send(socketRules.keepaliveText);
    await expect(reply).resolves.toBe(socketRules.keepaliveReply);

    // The keepalive is not a protocol error: Hello still welcomes.
    sendFrame(socket, {
      case: "hello",
      value: { protocolVersion: CURRENT_PROTOCOL_VERSION },
    });
    await expect(frames.next()).resolves.toMatchObject({
      kind: { case: "welcome" },
    });

    const again = nextText(socket);
    socket.send(socketRules.keepaliveText);
    await expect(again).resolves.toBe(socketRules.keepaliveReply);
  });

  it("answers the keepalive on the user's own socket too", async () => {
    const socket = await openSocket("/v1/me/socket", await signInAnonymously());
    const reply = nextText(socket);
    socket.send(socketRules.keepaliveText);
    await expect(reply).resolves.toBe(socketRules.keepaliveReply);
  });

  it("rejects frames sent before Hello", async () => {
    const socket = await openGroupSocket("no-hello");
    const frames = framesOf(socket);

    sendFrame(socket, { case: "ping", value: { nonce: 1 } });
    const { kind: replyKind } = await frames.next();
    expect(replyKind).toMatchObject({
      case: "error",
      value: { code: ServerError_Code.BAD_FRAME },
    });
  });

  it("rejects clients below the minimum protocol version", async () => {
    const socket = await openGroupSocket("too-old");
    const frames = framesOf(socket);

    sendFrame(socket, {
      case: "hello",
      value: { protocolVersion: MIN_PROTOCOL_VERSION - 1 },
    });
    const { kind: replyKind } = await frames.next();
    expect(replyKind).toMatchObject({
      case: "error",
      value: { code: ServerError_Code.PROTOCOL_TOO_OLD },
    });
  });
});
