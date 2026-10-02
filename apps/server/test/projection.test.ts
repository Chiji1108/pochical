import { create, toBinary } from "@bufbuild/protobuf";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { invites } from "../src/db/schema";
import { ChangesSchema, DayField } from "../src/gen/pochical/v1/sync_pb";
import { call, signInAnonymously, userIdOf } from "./helpers";
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

// A member's day value as their User DO pushes it.
const pushed = (value: string, ms: number, field = DayField.PATTERN) =>
  toBinary(
    ChangesSchema,
    create(ChangesSchema, {
      changes: [
        {
          cursor: 1n,
          kind: {
            case: "day",
            value: {
              date: "2026-10-22",
              field,
              hlc: {
                counter: 0,
                deviceId: "phone",
                physicalMs: BigInt(ms),
              },
              value,
            },
          },
        },
      ],
    })
  );

// The group's live invitation code, read from D1.
const liveCode = async (groupId: string): Promise<string> => {
  const row = await drizzle(env.DB)
    .select({ code: invites.code })
    .from(invites)
    .where(eq(invites.groupId, groupId))
    .get();
  return row?.code ?? "";
};

describe("a member's shifts in their groups", () => {
  it("reaches the group with the pattern and times, never the memo", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    const phone = await device(maker);

    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [
          edit("p", "2026-10-20", DayField.PATTERN, "night", 1000),
          edit("n", "2026-10-20", DayField.NOTE, "ひみつのメモ", 1000),
        ],
      },
    });
    await phone.frames.next();
    await push(makerId);

    const reached = await group.frames.next();
    expect(changesIn(reached)).toMatchObject([
      {
        kind: {
          case: "memberDay",
          value: {
            day: {
              date: "2026-10-20",
              field: DayField.PATTERN,
              value: "night",
            },
            userId: makerId,
          },
        },
      },
    ]);
    await expect(settled(group.socket, group.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("brings what a member already had when the group starts", async () => {
    const maker = await signInAnonymously();
    const makerId = await userIdOf(maker);
    const phone = await device(maker);
    sendFrame(phone.socket, {
      case: "dayEdits",
      value: {
        edits: [edit("d", "2026-10-21", DayField.PATTERN, "day", 1000)],
      },
    });
    await phone.frames.next();
    await push(makerId);

    const created = await call(
      "GroupService/CreateGroup",
      { displayName: "さくら", emoji: "🍉", name: "同期" },
      maker
    );
    const { groupId } = (await created.json()) as { groupId: string };
    await push(makerId);

    const group = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    expect(group.welcome.kind).toMatchObject({ value: { cursor: 1n } });
    const caughtUp = await group.frames.next();
    expect(changesIn(caughtUp)).toMatchObject([
      {
        cursor: 1n,
        kind: { case: "memberDay", value: { day: { date: "2026-10-21" } } },
      },
    ]);
  });

  it("keeps the newer value when a push comes twice or late", async () => {
    const { groupId, makerId } = await pair();
    const groupDo = env.GROUPS.getByName(groupId);
    await groupDo.takeMemberShifts(makerId, pushed("night", 2000));
    await groupDo.takeMemberShifts(makerId, pushed("night", 2000));
    await groupDo.takeMemberShifts(makerId, pushed("day", 1000));
    // Someone not in the group pushes nothing into it.
    await groupDo.takeMemberShifts("stranger", pushed("off", 3000));

    const newcomer = await signInAnonymously();
    await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode: await liveCode(groupId) },
      newcomer
    );
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, newcomer);
    expect(group.welcome.kind).toMatchObject({ value: { cursor: 1n } });
    expect(changesIn(await group.frames.next())).toMatchObject([
      { kind: { value: { day: { value: "night" }, userId: makerId } } },
    ]);
  });

  it("drops a memo or people pushed to it, keeping only shared fields", async () => {
    const { groupId, guest, makerId } = await pair();
    const groupDo = env.GROUPS.getByName(groupId);
    await groupDo.takeMemberShifts(
      makerId,
      pushed("ひみつのメモ", 1000, DayField.NOTE)
    );
    await groupDo.takeMemberShifts(
      makerId,
      pushed("coworker-1", 1000, DayField.PEOPLE)
    );

    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    expect(group.welcome.kind).toMatchObject({ value: { cursor: 0n } });
    await expect(settled(group.socket, group.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });
});
