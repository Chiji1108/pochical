import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";

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
import { GroupDO } from "../src/group-do";
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

/** The group alarm as the code has it, run by watchAlarms. */
// oxlint-disable-next-line typescript/unbound-method -- called with each group as this
const groupAlarm = GroupDO.prototype.alarm;

/**
 * A group's alarms as watchAlarms sees them: how many have started, those
 * still running, and who waits for the next to start.
 */
type Alarms = {
  running: Set<Promise<void>>;
  started: number;
  waiting: Set<(started: undefined) => void>;
};

/** Each group's alarms, by its instance. */
const alarmsOf = new WeakMap<GroupDO, Alarms>();

const alarmsIn = (group: GroupDO): Alarms => {
  const known = alarmsOf.get(group);
  if (known !== undefined) {
    return known;
  }
  const alarms: Alarms = { running: new Set(), started: 0, waiting: new Set() };
  alarmsOf.set(group, alarms);
  return alarms;
};

/** Whether the running file watches its alarms (watchAlarms). */
let watching = false;

/** The users whose chat with Pochical's people the running test opened. */
const chatsOpened = new Set<string>();

/** Waits until one of the group's alarms starts after the `after`th. */
const alarmStarted = async (alarms: Alarms, after: number): Promise<void> => {
  while (alarms.started <= after) {
    const { promise, resolve } = Promise.withResolvers<undefined>();
    alarms.waiting.add(resolve);
    // oxlint-disable-next-line no-await-in-loop -- the next one to start
    await promise;
  }
};

/** What a chat's place holds of its relay: its next alarm and lines untold. */
type Relay = { alarm: number | null; behind: number };

/**
 * A chat's place once no alarm of it runs or is about to: its next alarm,
 * if any, for later. A due alarm is the runtime's to run, waited for as it
 * starts and ends; so is one the runtime has taken up but not yet started,
 * while the alarm reads as none though lines are untold, which a relay
 * never leaves. Due by the runtime's clock, which runs alarms and sets one
 * asked for earlier to now: a test holding Date still does not stop it.
 * Waited for inside the place, where its alarms run.
 */
const settledIn = async (
  group: GroupDO,
  storage: DurableObjectStorage
): Promise<Relay> => {
  const alarms = alarmsIn(group);
  for (;;) {
    while (alarms.running.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- until none runs
      await Promise.allSettled(alarms.running);
    }
    const { started } = alarms;
    // oxlint-disable-next-line no-await-in-loop -- read once none runs
    const alarm = await storage.getAlarm();
    const { behind } = storage.sql
      .exec<{ behind: number }>(
        "select count(*) as behind from chat_lines where cursor > coalesce((select cursor from support_relay), 0)"
      )
      .one();
    const due = alarm === null ? behind > 0 : alarm <= vi.getRealSystemTime();
    if (alarms.started === started && alarms.running.size === 0) {
      if (!due) {
        return { alarm, behind };
      }
      // oxlint-disable-next-line no-await-in-loop -- the runtime starts it
      await alarmStarted(alarms, started);
    }
  }
};

const placeOf = (userId: string) => env.GROUPS.getByName(supportPlace(userId));

/**
 * Waits until no alarm of the user's chat runs or is due, in a file that
 * watches its alarms (watchAlarms).
 */
export const alarmsSettled = async (userId: string): Promise<Relay> =>
  await runInDurableObject(
    placeOf(userId),
    async (group, state) => await settledIn(group, state.storage)
  );

/** The group alarm run as the code has it, each start and end seen. */
const watchedAlarm = async function watchedAlarm(this: GroupDO): Promise<void> {
  const alarms = alarmsIn(this);
  alarms.started += 1;
  for (const wake of alarms.waiting) {
    wake(undefined);
  }
  alarms.waiting.clear();
  const run = groupAlarm.call(this);
  alarms.running.add(run);
  try {
    await run;
  } finally {
    alarms.running.delete(run);
  }
};

/**
 * Watches every group's alarm in the file's tests, for a test to wait on:
 * the runtime still runs each at its time, one at a time. Outside vi's
 * mocks, so a test restoring its own leaves it in place. After each test,
 * the chats it opened are left with no alarm running or due: a relay that
 * outlived its test would call the next test's spies.
 */
export const watchAlarms = (): void => {
  beforeAll(() => {
    GroupDO.prototype.alarm = watchedAlarm;
    watching = true;
  });
  afterEach(async () => {
    for (const userId of chatsOpened) {
      // oxlint-disable-next-line no-await-in-loop -- one chat at a time
      await alarmsSettled(userId);
    }
    chatsOpened.clear();
  });
  afterAll(() => {
    GroupDO.prototype.alarm = groupAlarm;
    watching = false;
  });
};

/**
 * The chat's next try, set for later after a failure, brought to now for
 * the runtime to run, and waited for.
 */
export const tryNow = async (userId: string): Promise<Relay> =>
  await runInDurableObject(placeOf(userId), async (group, state) => {
    await settledIn(group, state.storage);
    const alarms = alarmsIn(group);
    const { started } = alarms;
    await state.storage.setAlarm(Date.now());
    await alarmStarted(alarms, started);
    return await settledIn(group, state.storage);
  });

/**
 * Waits until the chat is told outside up to its newest line: the try a
 * change asks for, which the runtime runs at once, and each after a
 * failure, brought to now (tryNow).
 */
export const relayed = async (userId: string): Promise<void> => {
  let relay = await alarmsSettled(userId);
  while (relay.behind > 0 && relay.alarm !== null) {
    // oxlint-disable-next-line no-await-in-loop -- each try after the last
    relay = await tryNow(userId);
  }
  expect(relay.behind).toBe(0);
};

type ChatKind = Extract<
  Parameters<typeof sendFrame>[1],
  { case: "chatEdits" }
>["value"]["edits"];

/**
 * The user's chat with Pochical's people, open on a device, in a file
 * that watches its alarms (watchAlarms): each edit sent as its outbox
 * sends one, taken once acknowledged, then told outside.
 */
export const supportChat = async (token: string) => {
  if (!watching) {
    throw new Error("supportChat waits on its chat's alarms: watchAlarms()");
  }
  const userId = await userIdOf(token);
  chatsOpened.add(userId);
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
          value: {
            content: { kind: { case: "words", value: { text } } },
            device: from,
            threadId: "group",
          },
        },
        opId: crypto.randomUUID(),
      },
    ]);
  };
  return { edit: takeEdits, frames, say, socket, userId };
};
