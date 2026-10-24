import { create, toBinary } from "@bufbuild/protobuf";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

import { invites } from "../src/db/schema";
import { ChangesSchema, DayField } from "../src/gen/pochical/v1/sync_pb";
import { PUSH_RETRY_FIRST_MS } from "../src/user-do";
import type { UserDO } from "../src/user-do";
import {
  alarmOf,
  alarmRunsOf,
  alarmsSettled,
  ownRun,
  runAlarm,
} from "./alarms";
import { call, signInAnonymously, userIdOf } from "./helpers";
import {
  changesIn,
  clock,
  device,
  edit,
  pair,
  PAIR_ROSTER,
  push,
  sendFrame,
  settled,
  shiftsIn,
  syncSocket,
  untilAcked,
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
              hlc: clock(ms),
              value,
            },
          },
        },
      ],
    })
  );

// A signed-in user and their User DO.
const someone = async () => {
  const maker = await signInAnonymously();
  const makerId = await userIdOf(maker);
  return { maker, makerId, user: env.USERS.getByName(makerId) };
};

// Lists the user in groups whose DOs fail every push to them; `meanwhile`
// runs as each push fails.
const failPushesTo = async (
  user: DurableObjectStub<UserDO>,
  groupIds: string[],
  meanwhile?: (instance: UserDO) => void
): Promise<void> => {
  await runInDurableObject(user, (instance, state) => {
    for (const groupId of groupIds) {
      state.storage.sql.exec(
        "INSERT INTO memberships (group_id, joined_at) VALUES (?, 0)",
        groupId
      );
    }
    Reflect.set(instance, "env", {
      GROUPS: {
        getByName: (name: string) =>
          groupIds.includes(name)
            ? {
                setBlocks: () => undefined,
                takeMemberShifts: () => {
                  meanwhile?.(instance);
                  throw new Error("unreachable");
                },
              }
            : env.GROUPS.getByName(name),
      },
    });
  });
};

// Puts 夜勤 on a day from the user's phone, so they have a value to push.
const enterADay = async (token: string): Promise<void> => {
  const phone = await device(token);
  sendFrame(phone.socket, {
    case: "dayEdits",
    value: {
      edits: [edit("p", "2026-10-20", DayField.PATTERN, "night", 1000)],
    },
  });
  await untilAcked(phone.frames);
};

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
    const group = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      guest,
      PAIR_ROSTER
    );
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
    await untilAcked(phone.frames);
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
      {
        displayName: "さくら",
        mark: { emoji: "🍉" },
        name: "同期",
        requestId: crypto.randomUUID(),
      },
      maker
    );
    const { groupId } = (await created.json()) as { groupId: string };
    await push(makerId);

    const group = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    // After the group's name and mark and its maker.
    expect(group.welcome.kind).toMatchObject({ value: { cursor: 3n } });
    const caughtUp = await group.frames.next();
    expect(shiftsIn(caughtUp)).toMatchObject([
      {
        cursor: 3n,
        kind: { case: "memberDay", value: { day: { date: "2026-10-21" } } },
      },
    ]);
  });

  it("never gives out a cursor again once a member's values are gone", async () => {
    const { groupId, guest, makerId } = await pair();
    const groupDo = env.GROUPS.getByName(groupId);
    await groupDo.takeMemberShifts(makerId, pushed("night", 1000));
    // As a member's leaving will: their values go, with the newest cursor.
    await runInDurableObject(groupDo, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM member_days");
    });
    await groupDo.takeMemberShifts(makerId, pushed("day", 2000));

    // A device that had the first value still gets the new one, after it.
    const had = PAIR_ROSTER + 1n;
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest, had);
    expect(group.welcome.kind).toMatchObject({ value: { cursor: had + 1n } });
    expect(changesIn(await group.frames.next())).toMatchObject([
      { cursor: had + 1n, kind: { value: { day: { value: "day" } } } },
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
    // One value taken, then the newcomer, the notice of their joining and
    // their read mark.
    expect(group.welcome.kind).toMatchObject({
      value: { cursor: PAIR_ROSTER + 4n },
    });
    expect(shiftsIn(await group.frames.next())).toMatchObject([
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

    const group = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      guest,
      PAIR_ROSTER
    );
    expect(group.welcome.kind).toMatchObject({
      value: { cursor: PAIR_ROSTER },
    });
    await expect(settled(group.socket, group.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("pushes to the other groups when one cannot be reached, and comes back for it", async () => {
    const { maker, makerId, user } = await someone();
    // Listed first, so the group after it shows it is not held back.
    await failPushesTo(user, ["!unreachable"]);
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
    const { groupId } = (await created.json()) as { groupId: string };
    await enterADay(maker);

    // As if no push had failed yet, whatever ran before this one.
    await alarmsSettled(user);
    await runInDurableObject(user, (_, state) => {
      state.storage.kv.delete("pushFailures:!unreachable");
    });
    const before = Date.now();
    await runAlarm(user);
    await runInDurableObject(user, async (_, state) => {
      const [unreached, reached] = state.storage.sql
        .exec(
          "SELECT group_id, pushed_cursor FROM memberships ORDER BY group_id"
        )
        .toArray();
      // Past the usual name the group adopted, the membership, which groups
      // never get, and the day.
      expect(reached).toStrictEqual({ group_id: groupId, pushed_cursor: 3 });
      // The day is still to go to the group that failed.
      expect(unreached).toMatchObject({ group_id: "!unreachable" });
      expect(unreached?.pushed_cursor).toBeLessThan(3);
      const retry = await state.storage.getAlarm();
      expect(retry).toBeGreaterThanOrEqual(before + PUSH_RETRY_FIRST_MS);
      expect(retry).toBeLessThanOrEqual(Date.now() + PUSH_RETRY_FIRST_MS);
      // No retry left to run after the test, its group failing still.
      await state.storage.deleteAlarm();
    });

    const group = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    expect(shiftsIn(await group.frames.next())).toMatchObject([
      { kind: { value: { day: { value: "night" }, userId: makerId } } },
    ]);
  });

  it("waits by each group's own failures, and stops after many in a row", async () => {
    const { maker, user } = await someone();
    await failPushesTo(user, ["!long-gone", "!just-now"]);
    await enterADay(maker);

    // One group has failed for hours; the other fails for the first time.
    await alarmsSettled(user);
    await runInDurableObject(user, (_, state) => {
      state.storage.kv.put("pushFailures:!long-gone", 20);
      state.storage.kv.delete("pushFailures:!just-now");
    });
    const before = Date.now();
    await runAlarm(user);
    const retry = await alarmOf(user);
    expect(retry).toBeGreaterThanOrEqual(before + PUSH_RETRY_FIRST_MS);
    expect(retry).toBeLessThanOrEqual(Date.now() + PUSH_RETRY_FIRST_MS);

    // Both past the most retries: the next change tries them again.
    await runInDurableObject(user, (_, state) => {
      state.storage.kv.put("pushFailures:!long-gone", 30);
      state.storage.kv.put("pushFailures:!just-now", 30);
    });
    await runAlarm(user);
    await expect(alarmOf(user)).resolves.toBeNull();
  });

  it("leaves the next round to a change made while it pushes", async () => {
    const { maker, user } = await someone();
    // The change comes as the push below fails, once: every round it
    // made would fail and make it again, on past the file's last test.
    let changing = false;
    await failPushesTo(user, ["!unreachable"], (instance) => {
      if (changing) {
        changing = false;
        // Out of the group and in again, which pushes to it whole.
        instance.takeMembership("!unreachable", { cursor: 1, group: null });
        instance.takeMembership("!unreachable", {
          cursor: 2,
          group: {
            mark: { color: 0, emoji: "🍉", icon: "", letter: "", photoId: "" },
            name: "届かない",
          },
        });
      }
    });
    await enterADay(maker);

    await alarmsSettled(user);
    changing = true;
    const before = await alarmRunsOf(user);
    // The change is a round of its own, at once, not after the retry.
    await expect(runAlarm(user)).resolves.toBeTruthy();
    await expect(alarmRunsOf(user)).resolves.toBe(before + 2);
    // Nor that round's retry, to fail as the file's tests end.
    await runInDurableObject(user, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  });

  it("keeps the alarm a change made while it pushes set, not the failed group's later retry", async () => {
    const { maker, user } = await someone();
    let changing = false;
    // The change's alarm comes before the retry, half an hour ahead, its
    // clock held there, so the runtime does not run it as the test reads
    // it; the group has failed for hours, so its retry waits an hour.
    const changeAt = Date.now() + 1_800_000;
    await failPushesTo(user, ["!unreachable"], (instance) => {
      if (changing) {
        changing = false;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(changeAt);
        instance.setMarkLook("round", true);
        vi.useRealTimers();
      }
    });
    await enterADay(maker);
    await alarmsSettled(user);
    await runInDurableObject(user, (_, state) => {
      state.storage.kv.put("pushFailures:!unreachable", 20);
    });
    changing = true;
    const stored = await runInDurableObject(user, async (instance, state) => {
      await instance.alarm(ownRun());
      const left = await state.storage.getAlarm();
      await state.storage.deleteAlarm();
      return left;
    });
    expect(stored).toBe(changeAt);
  });
});
