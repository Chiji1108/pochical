import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, vi } from "vitest";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../src/gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatContent,
  DayField,
  ServerFrame,
} from "../src/gen/pochical/v1/sync_pb";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
import { supportPlace } from "../src/support-lines";
import { call, openSocket, signInAnonymously, userIdOf } from "./helpers";

// Sync sockets in tests: their frames as they arrive, and the edits sent
// on them.

type ClientKind = MessageInitShape<typeof ClientFrameSchema>["kind"];

// A socket's frames as they arrive, read one at a time.
export const framesOf = (socket: WebSocket) => {
  const waiting: ((frame: ServerFrame) => void)[] = [];
  const arrived: ServerFrame[] = [];
  const deliver = async (data: Blob): Promise<void> => {
    const frame = fromBinary(
      ServerFrameSchema,
      new Uint8Array(await data.arrayBuffer())
    );
    const next = waiting.shift();
    if (next) {
      next(frame);
      return;
    }
    arrived.push(frame);
  };
  socket.addEventListener("message", (event) => {
    if (event.data instanceof Blob) {
      void deliver(event.data);
    }
  });
  return {
    next: async (): Promise<ServerFrame> => {
      const frame = arrived.shift();
      if (frame) {
        return frame;
      }
      const { promise, resolve } = Promise.withResolvers<ServerFrame>();
      waiting.push(resolve);
      return await promise;
    },
  };
};

export const sendFrame = (socket: WebSocket, kind: ClientKind): void => {
  socket.send(toBinary(ClientFrameSchema, create(ClientFrameSchema, { kind })));
};

// A socket at `path` past Hello, with its frames.
export const syncSocket = async (path: string, token: string, cursor = 0n) => {
  const socket = await openSocket(path, token);
  const frames = framesOf(socket);
  sendFrame(socket, {
    case: "hello",
    value: { cursor, protocolVersion: CURRENT_PROTOCOL_VERSION },
  });
  const welcome = await frames.next();
  return { frames, socket, welcome };
};

// A device's clock at `ms`, as an edit carries it.
export const clock = (ms: number, deviceId = "phone") => ({
  counter: 0,
  deviceId,
  physicalMs: BigInt(ms),
});

export const edit = (
  opId: string,
  date: string,
  field: DayField,
  value: string | undefined,
  ms: number,
  deviceId = "phone"
) => ({
  opId,
  value: {
    date,
    field,
    hlc: clock(ms, deviceId),
    value,
  },
});

// Reads up to the next Acked, once the edits sent have been taken, past
// what came before it, like a catch-up.
export const untilAcked = async (
  frames: ReturnType<typeof framesOf>
): Promise<ServerFrame> => {
  const frame = await frames.next();
  return frame.kind.case === "acked" ? frame : await untilAcked(frames);
};

// After the frames a step causes, a Ping's Pong proves none are left.
export const settled = async (
  socket: WebSocket,
  frames: ReturnType<typeof framesOf>
): Promise<ServerFrame> => {
  sendFrame(socket, { case: "ping", value: { nonce: 7 } });
  return await frames.next();
};

// The user's own socket past Hello, with its frames.
export const device = async (token: string, cursor = 0n) =>
  await syncSocket("/v1/me/socket", token, cursor);

// A group of two: its maker and someone who joined by its link.
export const pair = async () => {
  const maker = await signInAnonymously();
  const created = await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      mark: { emoji: "🍉" },
      name: "いとこ会",
      requestId: crypto.randomUUID(),
    },
    maker
  );
  const { groupId, inviteCode } = (await created.json()) as {
    groupId: string;
    inviteCode: string;
  };
  const guest = await signInAnonymously();
  await call(
    "GroupService/JoinGroup",
    { displayName: "ゆうき", inviteCode },
    guest
  );
  return {
    groupId,
    guest,
    inviteCode,
    maker,
    makerId: await userIdOf(maker),
  };
};

// The cursor after what pair() leaves in its group's log: the group's
// name and mark, its two members, the chat's notice of the join, and the
// joiner's read mark at that notice.
export const PAIR_ROSTER = 5n;

// Runs the user's push now, as their alarm would.
export const push = async (userId: string): Promise<void> => {
  await runDurableObjectAlarm(env.USERS.getByName(userId));
};

export const changesIn = (frame: ServerFrame) =>
  frame.kind.case === "changes" ? frame.kind.value.changes : [];

// A group's changes of its members' shifts, without who is in it or its
// chat.
const shiftKinds = new Set([
  "memberDay",
  "memberPattern",
  "memberRepeatOrders",
]);
export const shiftsIn = (frame: ServerFrame) =>
  changesIn(frame).filter(({ kind }) => shiftKinds.has(kind.case ?? ""));

// Whether a change is a notice line the app wrote in the chat as the group
// changed, which tests about something else leave out.
export const isNotice = (kind: Change["kind"]): boolean =>
  kind.case === "chatLine" && kind.value.content?.kind.case === "notice";

// What a line is, as toMatchObject compares a ChatLine: one of
// ChatContent's cases and what it holds.
export const holding = (
  kind: NonNullable<ChatContent["kind"]["case"]>,
  value: Record<string, unknown> = {}
) => ({ content: { kind: { case: kind, value } } });

// A line of words, as holding compares it.
export const words = (text: string, more: Record<string, unknown> = {}) =>
  holding("words", { text, ...more });

// A frame's changes without the chat's notice lines.
export const changesBesidesNotices = (frame: ServerFrame) =>
  changesIn(frame).filter(({ kind }) => !isNotice(kind));

// A group's changes of its name and mark and who is in it.
export const rosterIn = (frame: ServerFrame) =>
  changesIn(frame).filter(
    ({ kind }) => kind.case === "groupProfile" || kind.case === "member"
  );

/**
 * Waits until the chat is told outside up to its newest line: its alarm
 * runs as soon as it is set, and is run here should it not have yet.
 */
export const relayed = async (userId: string): Promise<void> => {
  const place = env.GROUPS.getByName(supportPlace(userId));
  await vi.waitFor(async () => {
    await runDurableObjectAlarm(place);
    const behind = await runInDurableObject(place, (_, state) =>
      state.storage.sql
        .exec<{ behind: number }>(
          "select count(*) as behind from chat_lines where cursor > coalesce((select cursor from support_relay), 0)"
        )
        .one()
    );
    expect(behind.behind).toBe(0);
  });
};

type ChatKind = Extract<
  Parameters<typeof sendFrame>[1],
  { case: "chatEdits" }
>["value"]["edits"];

/**
 * The user's chat with Pochical's people, open on a device: each edit
 * sent as its outbox sends one, taken once acknowledged, then told outside.
 */
export const supportChat = async (token: string) => {
  const userId = await userIdOf(token);
  const { socket, frames } = await syncSocket("/v1/me/support/socket", token);
  await frames.next();
  const takeEdits = async (edits: NonNullable<ChatKind>): Promise<void> => {
    sendFrame(socket, { case: "chatEdits", value: { edits } });
    await untilAcked(frames);
    await relayed(userId);
  };
  const say = async (text: string, from = "") => {
    await takeEdits([
      {
        kind: {
          case: "send",
          value: { device: from, text, threadId: "group" },
        },
        opId: crypto.randomUUID(),
      },
    ]);
  };
  return { edit: takeEdits, frames, say, socket, userId };
};
