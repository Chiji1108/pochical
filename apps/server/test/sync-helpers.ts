import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../src/gen/pochical/v1/sync_pb";
import type { DayField, ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
import { openSocket } from "./helpers";

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
    hlc: { counter: 0, deviceId, physicalMs: BigInt(ms) },
    value,
  },
});

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
