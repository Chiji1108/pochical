import { describe, expect, it } from "vitest";

import { DayField, ServerError_Code } from "../src/gen/pochical/v1/sync_pb";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
import { memberOf, openSocket, signInAnonymously } from "./helpers";
import { device, edit, framesOf, sendFrame, settled } from "./sync-helpers";

describe("syncing a user's own days", () => {
  it("starts a fresh device at the head with nothing to catch up", async () => {
    const { welcome, socket, frames } = await device(await signInAnonymously());
    expect(welcome.kind).toMatchObject({
      case: "welcome",
      value: { cursor: 0n },
    });
    await expect(settled(socket, frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("takes an edit, acknowledges it and sends it to every device", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const tablet = await device(token);

    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("op-1", "2026-10-05", DayField.PATTERN, "night", 1000)],
      },
    });
    const acked = await phone.frames.next();
    expect(acked.kind).toMatchObject({
      case: "acked",
      value: { opIds: ["op-1"] },
    });
    const expected = {
      case: "changes",
      value: {
        changes: [
          {
            cursor: 1n,
            kind: {
              case: "day",
              value: {
                date: "2026-10-05",
                field: DayField.PATTERN,
                value: "night",
              },
            },
          },
        ],
      },
    };
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: expected,
    });
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: expected,
    });
  });

  it("keeps the newer of two edits by their clocks, whichever arrives last", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("new", "2026-10-06", DayField.NOTE, "11時の版", 11_000)],
      },
    });
    await phone.frames.next();
    await phone.frames.next();

    // Made offline at 10:00, delivered after the 11:00 one.
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit(
            "old",
            "2026-10-06",
            DayField.NOTE,
            "10時の版",
            10_000,
            "tablet"
          ),
        ],
      },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["old"] } },
    });
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("catches a device up from its cursor, and resets one that is ahead", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("a", "2026-10-07", DayField.PATTERN, "day", 1000),
          edit("b", "2026-10-08", DayField.PATTERN, "off", 1000),
        ],
      },
    });
    await phone.frames.next();
    await phone.frames.next();

    const later = await device(token, 1n);
    expect(later.welcome.kind).toMatchObject({ value: { cursor: 2n } });
    await expect(later.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [{ cursor: 2n, kind: { value: { date: "2026-10-08" } } }],
        },
      },
    });

    const restored = await device(token, 99n);
    await expect(restored.frames.next()).resolves.toMatchObject({
      kind: { case: "reset" },
    });
    const all = await restored.frames.next();
    expect(all.kind.case === "changes" && all.kind.value.changes).toHaveLength(
      2
    );
  });

  it("clears a field with an edit that has no value", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("set", "2026-10-09", DayField.START, "08:30", 1000)],
      },
    });
    await phone.frames.next();
    await phone.frames.next();
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("clear", "2026-10-09", DayField.START, undefined, 2000)],
      },
    });
    await phone.frames.next();
    const cleared = await phone.frames.next();
    expect(cleared.kind).toMatchObject({
      case: "changes",
      value: {
        changes: [{ cursor: 2n, kind: { value: { date: "2026-10-09" } } }],
      },
    });
    const [change] =
      cleared.kind.case === "changes" ? cleared.kind.value.changes : [];
    expect(
      change?.kind.case === "day" && change.kind.value.value
    ).toBeUndefined();
  });

  it("corrects a device whose value does not fit, with a newer clock", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: { edits: [edit("ok", "2026-10-10", DayField.NOTE, "メモ", 1000)] },
    });
    await phone.frames.next();
    await phone.frames.next();

    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("long", "2026-10-10", DayField.NOTE, "あ".repeat(101), 2000),
        ],
      },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["long"] } },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            {
              kind: {
                value: {
                  date: "2026-10-10",
                  hlc: { deviceId: "server" },
                  value: "メモ",
                },
              },
            },
          ],
        },
      },
    });
  });

  it("lets the device's next edit win over the correction", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("bad", "2026-10-10", DayField.START, "25:00", 1000),
          edit("good", "2026-10-10", DayField.START, "08:00", 2000),
        ],
      },
    });
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    expect(kind.case === "changes" ? kind.value.changes : []).toMatchObject([
      { kind: { value: { hlc: { deviceId: "server", physicalMs: 1000n } } } },
      { kind: { value: { hlc: { deviceId: "phone" }, value: "08:00" } } },
    ]);
  });

  it("corrects an edit whose counter is at its end in the next millisecond", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const last = edit("bad", "2026-10-10", DayField.START, "25:00", 1000);
    last.value.hlc.counter = 0xff_ff_ff_ff;
    sendFrame(phone.socket, { case: "dayEdits", value: { edits: [last] } });
    await phone.frames.next();
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: {
        value: {
          changes: [
            {
              kind: {
                value: {
                  hlc: { counter: 0, deviceId: "server", physicalMs: 1001n },
                },
              },
            },
          ],
        },
      },
    });
    // The stored correction still goes out to a new device.
    const tablet = await device(token);
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: { case: "changes" },
    });
  });

  it("acknowledges without keeping an edit for no real day", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("bad", "2026-02-30", DayField.PATTERN, "day", 1000)],
      },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["bad"] } },
    });
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("takes day edits only on the user's own socket", async () => {
    const socket = await openSocket("/v1/groups/g/socket", await memberOf("g"));
    const frames = framesOf(socket);
    sendFrame(socket, {
      case: "hello",
      value: { cursor: 0n, protocolVersion: CURRENT_PROTOCOL_VERSION },
    });
    await frames.next();
    sendFrame(socket, {
      case: "dayEdits",
      value: {
        edits: [edit("x", "2026-10-11", DayField.PATTERN, "day", 1000)],
      },
    });
    await expect(frames.next()).resolves.toMatchObject({
      kind: { case: "error", value: { code: ServerError_Code.BAD_FRAME } },
    });
  });
});

const night = {
  color: 2,
  countsAsOff: false,
  emoji: "🌙",
  end: "09:00",
  icon: "moon",
  name: "夜勤",
  nextDay: "after",
  start: "16:30",
  symbol: "夜",
};

const patternEdit = (
  opId: string,
  id: string,
  pattern: typeof night | undefined,
  ms: number
) => ({
  kind: {
    case: "pattern" as const,
    value: {
      hlc: { counter: 0, deviceId: "phone", physicalMs: BigInt(ms) },
      id,
      pattern,
    },
  },
  opId,
});

// An edit of the patterns' order.
const order = (opId: string, ids: string[], ms: number) => ({
  kind: {
    case: "order" as const,
    value: {
      hlc: { counter: 0, deviceId: "phone", physicalMs: BigInt(ms) },
      ids,
    },
  },
  opId,
});

describe("syncing a user's own patterns", () => {
  it("takes a pattern whole and sends it to every device", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const tablet = await device(token);
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: { edits: [patternEdit("p1", "night", night, 1000)] },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["p1"] } },
    });
    const expected = {
      case: "changes",
      value: {
        changes: [
          {
            cursor: 1n,
            kind: { case: "pattern", value: { id: "night", pattern: night } },
          },
        ],
      },
    };
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: expected,
    });
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: expected,
    });
  });

  it("keeps a deleted pattern as gone, and corrects one that does not fit", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: {
        edits: [
          patternEdit("set", "night", night, 1000),
          patternEdit("delete", "night", undefined, 2000),
        ],
      },
    });
    await phone.frames.next();
    const both = await phone.frames.next();
    const changes = both.kind.case === "changes" ? both.kind.value.changes : [];
    const last = changes.at(-1);
    expect(
      last?.kind.case === "pattern" && last.kind.value.pattern
    ).toBeUndefined();

    // A name past shiftName's 8 characters, newer than the deletion.
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: {
        edits: [
          patternEdit(
            "long",
            "night",
            { ...night, name: "とても長い夜勤の名前" },
            3000
          ),
        ],
      },
    });
    await phone.frames.next();
    const corrected = await phone.frames.next();
    expect(corrected.kind).toMatchObject({
      case: "changes",
      value: {
        changes: [
          {
            kind: {
              case: "pattern",
              value: { hlc: { deviceId: "server" }, id: "night" },
            },
          },
        ],
      },
    });
    const [fix] =
      corrected.kind.case === "changes" ? corrected.kind.value.changes : [];
    expect(
      fix?.kind.case === "pattern" && fix.kind.value.pattern
    ).toBeUndefined();
  });

  it("keeps the patterns' order, correcting one with an id twice", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: { edits: [order("o1", ["day", "night", "off"], 1000)] },
    });
    await phone.frames.next();
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: {
        value: {
          changes: [
            {
              kind: {
                case: "patternOrder",
                value: { ids: ["day", "night", "off"] },
              },
            },
          ],
        },
      },
    });
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: { edits: [order("o2", ["day", "day"], 2000)] },
    });
    await phone.frames.next();
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: {
        value: {
          changes: [
            {
              kind: {
                case: "patternOrder",
                value: {
                  hlc: { deviceId: "server" },
                  ids: ["day", "night", "off"],
                },
              },
            },
          ],
        },
      },
    });
  });

  it("catches a new device up on days and patterns in one order", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("d", "2026-10-12", DayField.PATTERN, "night", 1000)],
      },
    });
    await phone.frames.next();
    await phone.frames.next();
    sendFrame(phone.socket, {
      case: "patternEdits",
      value: { edits: [patternEdit("p", "night", night, 1000)] },
    });
    await phone.frames.next();
    await phone.frames.next();

    const tablet = await device(token);
    expect(tablet.welcome.kind).toMatchObject({ value: { cursor: 2n } });
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            { cursor: 1n, kind: { case: "day" } },
            { cursor: 2n, kind: { case: "pattern" } },
          ],
        },
      },
    });
  });
});
