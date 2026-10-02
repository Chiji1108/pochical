import { COWORKERS_MAX } from "@pochical/design/limits";
import { describe, expect, it } from "vitest";

import { DayField } from "../src/gen/pochical/v1/sync_pb";
import { signInAnonymously } from "./helpers";
import {
  changesIn,
  device,
  edit,
  pair,
  push,
  sendFrame,
  settled,
  syncSocket,
} from "./sync-helpers";

// Repeating orders and coworkers (spec/sync-protocol.md, Repeating orders
// and Coworkers), synced as the user's own values.

const clock = (ms: number, deviceId = "phone") => ({
  counter: 0,
  deviceId,
  physicalMs: BigInt(ms),
});

type Order = {
  holidayCountry: string;
  holidayShift?: string;
  holidaysOff: boolean;
  sequence: string[];
  start: string;
};

const order = (start: string, sequence: string[]): Order => ({
  holidayCountry: "JP",
  holidayShift: "off",
  holidaysOff: true,
  sequence,
  start,
});

const ordersEdit = (
  opId: string,
  orders: Order[],
  ms: number,
  clearFrom?: string
) => ({
  case: "repeatOrdersEdits" as const,
  value: { edits: [{ clearFrom, opId, orders: { hlc: clock(ms), orders } }] },
});

// One coworker edit, named by its id and clock.
const coworkerEdit = (id: string, name: string, ms: number) => ({
  kind: {
    case: "coworker" as const,
    value: { hlc: clock(ms), id, name },
  },
  opId: `${id}-${ms}`,
});

// The day values a frame of changes holds, as date, field and value.
const daysIn = (changes: ReturnType<typeof changesIn>) =>
  changes.flatMap(({ kind }) =>
    kind.case === "day"
      ? [[kind.value.date, kind.value.field, kind.value.value]]
      : []
  );

describe("syncing a user's repeating orders", () => {
  it("gives the days from a new order's start back to it, keeping memos and later edits", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("a", "2026-10-01", DayField.PATTERN, "night", 1000),
          edit("b", "2026-10-05", DayField.PATTERN, "night", 1000),
          edit("c", "2026-10-05", DayField.START, "08:00", 1000),
          edit("d", "2026-10-05", DayField.NOTE, "棚卸し", 1000),
          edit("e", "2026-10-06", DayField.PATTERN, "night", 5000),
        ],
      },
    });
    await phone.frames.next();
    await phone.frames.next();

    sendFrame(
      phone.socket,
      ordersEdit("o", [order("2026-10-03", ["day", "off"])], 2000, "2026-10-03")
    );
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    const changes = kind.case === "changes" ? kind.value.changes : [];
    expect(changes[0]?.kind).toMatchObject({
      case: "repeatOrders",
      value: { orders: [{ sequence: ["day", "off"], start: "2026-10-03" }] },
    });
    // The 1st is before the start, the memo stays, and the 6th was entered
    // after the order was made.
    expect(daysIn(changes)).toStrictEqual([
      ["2026-10-05", DayField.PATTERN, undefined],
      ["2026-10-05", DayField.START, undefined],
    ]);
  });

  it("clears nothing for orders that lose to newer ones", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("a", "2026-10-05", DayField.PATTERN, "night", 1000)],
      },
    });
    await phone.frames.next();
    await phone.frames.next();
    sendFrame(
      phone.socket,
      ordersEdit("new", [order("2026-10-01", ["day"])], 3000)
    );
    await phone.frames.next();
    await phone.frames.next();

    sendFrame(
      phone.socket,
      ordersEdit("old", [order("2026-10-01", ["off"])], 2000, "2026-10-01")
    );
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["old"] } },
    });
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  // Starts must only grow, holidays off records the pattern taken, and the
  // country is a code.
  // …and only a new or corrected order takes days back, from its start.
  it.each([
    [
      [order("2026-10-05", ["day"]), order("2026-10-01", ["off"])],
      "2026-10-01",
    ],
    [
      [{ ...order("2026-10-01", ["day"]), holidayShift: undefined }],
      "2026-10-01",
    ],
    [
      [{ ...order("2026-10-01", ["day"]), holidayCountry: "Japan" }],
      "2026-10-01",
    ],
    [[order("2026-10-03", ["day"])], "2026-10-01"],
    [[], "2026-10-01"],
    [
      [order("2026-10-01", ["day"]), order("2026-10-03", ["off"])],
      "2026-10-01",
    ],
  ])(
    "corrects orders that do not fit, and clears nothing for them",
    async (orders, clearFrom) => {
      const token = await signInAnonymously();
      const phone = await device(token);
      sendFrame(phone.socket, {
        case: "dayEdits",
        value: {
          edits: [edit("a", "2026-10-05", DayField.PATTERN, "night", 1000)],
        },
      });
      await phone.frames.next();
      await phone.frames.next();

      sendFrame(phone.socket, ordersEdit("bad", orders, 2000, clearFrom));
      await phone.frames.next();
      const { kind } = await phone.frames.next();
      const changes = kind.case === "changes" ? kind.value.changes : [];
      expect(changes).toHaveLength(1);
      expect(changes[0]?.kind).toMatchObject({
        case: "repeatOrders",
        value: { hlc: { deviceId: "server" }, orders: [] },
      });
    }
  );

  it("holds back an edit made before orders that cleared its day", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(
      phone.socket,
      ordersEdit("o", [order("2026-10-03", ["day"])], 3000, "2026-10-03")
    );
    await phone.frames.next();
    await phone.frames.next();

    // Made offline before the orders, on a day nothing was entered on,
    // and then again after them, on the same day.
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("late", "2026-10-07", DayField.PATTERN, "night", 2000, "tablet"),
          edit("memo", "2026-10-08", DayField.NOTE, "メモ", 2000, "tablet"),
          edit("after", "2026-10-07", DayField.PATTERN, "day", 4000, "tablet"),
        ],
      },
    });
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    const changes = kind.case === "changes" ? kind.value.changes : [];
    expect(daysIn(changes)).toStrictEqual([
      ["2026-10-07", DayField.PATTERN, undefined],
      ["2026-10-08", DayField.NOTE, "メモ"],
      ["2026-10-07", DayField.PATTERN, "day"],
    ]);
    // Answered with the clear itself, which the later edit outranks.
    expect(changes[0]?.kind).toMatchObject({
      value: { hlc: { deviceId: "phone", physicalMs: 3000n } },
    });
  });

  it("keeps a day cleared on purpose as an empty pattern", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: { edits: [edit("a", "2026-10-05", DayField.PATTERN, "", 1000)] },
    });
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    expect(
      daysIn(kind.case === "changes" ? kind.value.changes : [])
    ).toStrictEqual([["2026-10-05", DayField.PATTERN, ""]]);
  });
});

describe("a member's repeating orders and people in their groups", () => {
  it("reaches the group with the orders, never the day's people", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    const phone = await device(maker);

    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("p", "2026-10-20", DayField.PEOPLE, "c1 c2", 1000)],
      },
    });
    await phone.frames.next();
    await phone.frames.next();
    sendFrame(
      phone.socket,
      ordersEdit("o", [order("2026-10-01", ["day"])], 2000)
    );
    await phone.frames.next();
    await phone.frames.next();
    await push(makerId);

    const reached = await group.frames.next();
    expect(changesIn(reached)).toMatchObject([
      {
        kind: {
          case: "memberRepeatOrders",
          value: {
            orders: { orders: [{ sequence: ["day"], start: "2026-10-01" }] },
            userId: makerId,
          },
        },
      },
    ]);
    await expect(settled(group.socket, group.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });
});

describe("syncing a user's coworkers", () => {
  it("takes coworkers and their order, correcting a name that does not fit", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const tablet = await device(token);
    sendFrame(phone.socket, {
      case: "coworkerEdits",
      value: {
        edits: [
          {
            kind: {
              case: "coworker",
              value: { hlc: clock(1000), id: "c1", name: "佐藤" },
            },
            opId: "a",
          },
          {
            kind: {
              case: "coworker",
              value: { hlc: clock(1000), id: "c2", name: "   " },
            },
            opId: "b",
          },
          {
            kind: {
              case: "order",
              value: { hlc: clock(1000), ids: ["c1", "c2"] },
            },
            opId: "c",
          },
        ],
      },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["a", "b", "c"] } },
    });
    await expect(tablet.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            { kind: { case: "coworker", value: { id: "c1", name: "佐藤" } } },
            {
              kind: {
                case: "coworker",
                value: {
                  hlc: { deviceId: "server" },
                  id: "c2",
                },
              },
            },
            { kind: { case: "coworkerOrder", value: { ids: ["c1", "c2"] } } },
          ],
        },
      },
    });
  });

  it("refuses a coworker whose id has a space, which a day's people could not name", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "coworkerEdits",
      value: {
        edits: [
          {
            kind: {
              case: "coworker",
              value: { hlc: clock(1000), id: "a b", name: "佐藤" },
            },
            opId: "a",
          },
        ],
      },
    });
    await expect(phone.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["a"] } },
    });
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("refuses a new coworker past COWORKERS_MAX, but still renames one", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "coworkerEdits",
      value: {
        edits: Array.from({ length: COWORKERS_MAX }, (_, index) =>
          coworkerEdit(`c${index}`, `人${index}`, 1000)
        ),
      },
    });
    await phone.frames.next();
    await phone.frames.next();

    sendFrame(phone.socket, {
      case: "coworkerEdits",
      value: {
        edits: [
          coworkerEdit("extra", "もう一人", 2000),
          coworkerEdit("c0", "佐藤", 2000),
        ],
      },
    });
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    const changes = kind.case === "changes" ? kind.value.changes : [];
    expect(changes.map((change) => change.kind)).toMatchObject([
      {
        case: "coworker",
        value: { hlc: { deviceId: "server" }, id: "extra" },
      },
      { case: "coworker", value: { id: "c0", name: "佐藤" } },
    ]);
    const refused = changes[0]?.kind;
    expect(refused?.case === "coworker" && refused.value.name).toBeUndefined();
  });

  it("takes a day's people and refuses ids written twice", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("a", "2026-10-05", DayField.PEOPLE, "c1 c2", 1000),
          edit("b", "2026-10-06", DayField.PEOPLE, "c1 c1", 1000),
        ],
      },
    });
    await phone.frames.next();
    const { kind } = await phone.frames.next();
    expect(
      daysIn(kind.case === "changes" ? kind.value.changes : [])
    ).toStrictEqual([
      ["2026-10-05", DayField.PEOPLE, "c1 c2"],
      ["2026-10-06", DayField.PEOPLE, undefined],
    ]);
  });
});

describe("catching up on what a user owns", () => {
  it("brings a new device every kind of value, in cursor order", async () => {
    const token = await signInAnonymously();
    const phone = await device(token);
    const steps = [
      {
        case: "dayEdits" as const,
        value: {
          edits: [edit("d", "2026-10-12", DayField.PATTERN, "night", 1000)],
        },
      },
      {
        case: "patternEdits" as const,
        value: {
          edits: [
            {
              kind: {
                case: "order" as const,
                value: { hlc: clock(1000), ids: ["night"] },
              },
              opId: "po",
            },
          ],
        },
      },
      ordersEdit("o", [order("2026-10-01", ["day"])], 1000),
      {
        case: "coworkerEdits" as const,
        value: {
          edits: [
            {
              kind: {
                case: "coworker" as const,
                value: { hlc: clock(1000), id: "c1", name: "佐藤" },
              },
              opId: "c",
            },
            {
              kind: {
                case: "order" as const,
                value: { hlc: clock(1000), ids: ["c1"] },
              },
              opId: "co",
            },
          ],
        },
      },
    ];
    for (const step of steps) {
      sendFrame(phone.socket, step);
      // oxlint-disable-next-line no-await-in-loop -- each in turn
      await phone.frames.next();
      // oxlint-disable-next-line no-await-in-loop -- each in turn
      await phone.frames.next();
    }

    const tablet = await device(token);
    expect(tablet.welcome.kind).toMatchObject({ value: { cursor: 5n } });
    const caughtUp = changesIn(await tablet.frames.next());
    expect(
      caughtUp.map(({ cursor, kind }) => [cursor, kind.case])
    ).toStrictEqual([
      [1n, "day"],
      [2n, "patternOrder"],
      [3n, "repeatOrders"],
      [4n, "coworker"],
      [5n, "coworkerOrder"],
    ]);
  });

  it("brings a member who opens the group later everyone's orders", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const phone = await device(maker);
    sendFrame(
      phone.socket,
      ordersEdit("o", [order("2026-10-01", ["day"])], 1000)
    );
    await phone.frames.next();
    await phone.frames.next();
    await push(makerId);

    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    expect(changesIn(await group.frames.next())).toMatchObject([
      {
        kind: {
          case: "memberRepeatOrders",
          value: {
            orders: { orders: [{ sequence: ["day"], start: "2026-10-01" }] },
            userId: makerId,
          },
        },
      },
    ]);
  });
});
