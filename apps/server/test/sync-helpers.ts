import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../src/gen/pochical/v1/sync_pb";
import type { DayField, ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
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
      emoji: "🍉",
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
// name and mark, then its two members.
export const PAIR_ROSTER = 3n;

// Runs the user's push now, as their alarm would.
export const push = async (userId: string): Promise<void> => {
  await runDurableObjectAlarm(env.USERS.getByName(userId));
};

export const changesIn = (frame: ServerFrame) =>
  frame.kind.case === "changes" ? frame.kind.value.changes : [];

// A group's changes of its members' shifts, without who is in it.
export const shiftsIn = (frame: ServerFrame) =>
  changesIn(frame).filter(
    ({ kind }) => kind.case !== "groupProfile" && kind.case !== "member"
  );
