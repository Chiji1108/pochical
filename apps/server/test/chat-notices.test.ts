import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { ChatNotice_Kind } from "../src/gen/pochical/v1/sync_pb";
import type { ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import { call, signInAnonymously, userIdOf } from "./helpers";
import {
  changesIn,
  device,
  pair,
  PAIR_ROSTER,
  sendFrame,
  settled,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

// The lines the app writes in a group's 全体チャット as the group changes
// (spec/chat.md, Notices).

// A frame's notice lines, each with what it says beside the line.
const noticesIn = (frame: ServerFrame) =>
  changesIn(frame).flatMap(({ kind }) => {
    const content =
      kind.case === "chatLine" ? kind.value.content?.kind : undefined;
    return kind.case === "chatLine" && content?.case === "notice"
      ? [{ ...kind.value, notice: content.value }]
      : [];
  });

const groupSocket = async (
  groupId: string,
  token: string,
  cursor = PAIR_ROSTER
) => await syncSocket(`/v1/groups/${groupId}/socket`, token, cursor);

describe("a group's notices", () => {
  it("says who joined, never as a line to read", async () => {
    const { groupId, guest, inviteCode, maker } = await pair();
    const guestId = await userIdOf(guest);
    // The maker's making the group says nothing; the guest's joining does.
    const mine = await groupSocket(groupId, maker, 0n);
    expect(noticesIn(await mine.frames.next())).toMatchObject([
      {
        authorId: guestId,
        notice: { kind: ChatNotice_Kind.JOINED },
        seq: 1n,
        threadId: "group",
      },
    ]);
    const phone = await device(maker);
    await phone.frames.next();

    const third = await signInAnonymously();
    await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode },
      third
    );
    expect(noticesIn(await mine.frames.next())).toMatchObject([
      {
        authorId: await userIdOf(third),
        notice: { kind: ChatNotice_Kind.JOINED },
        seq: 2n,
      },
    ]);
    // The maker's devices hear no count for it…
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
    // …and a line after the two notices is the only one unread.
    const theirs = await groupSocket(groupId, guest);
    sendFrame(theirs.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: {
                content: { kind: { case: "words", value: { text: "やあ" } } },
                threadId: "group",
              },
            },
            opId: "a",
          },
        ],
      },
    });
    expect(changesIn(await phone.frames.next())).toMatchObject([
      {
        kind: {
          case: "unreadCount",
          value: { count: 1, groupId, threadId: "group" },
        },
      },
    ]);
  });

  it("says who left, and who took someone out", async () => {
    const left = await pair();
    const leftId = await userIdOf(left.guest);
    const mine = await groupSocket(left.groupId, left.maker);
    await call(
      "GroupService/LeaveGroup",
      { groupId: left.groupId },
      left.guest
    );
    expect(noticesIn(await mine.frames.next())).toMatchObject([
      {
        authorId: leftId,
        notice: { kind: ChatNotice_Kind.LEFT, subjectId: "" },
        seq: 2n,
      },
    ]);

    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const group = await groupSocket(groupId, maker);
    await call(
      "GroupService/RemoveMember",
      { groupId, userId: guestId },
      maker
    );
    expect(noticesIn(await group.frames.next())).toMatchObject([
      {
        authorId: makerId,
        notice: { kind: ChatNotice_Kind.REMOVED, subjectId: guestId },
        seq: 2n,
      },
    ]);
  });

  it("says who Pochical's people took out, as their own line", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    const group = await groupSocket(groupId, maker);
    const admin = exports.AdminEntrypoint;
    await expect(
      admin.removeFromGroup(guestId, groupId, "staff@pochical.app")
    ).resolves.toBeTruthy();
    expect(noticesIn(await group.frames.next())).toMatchObject([
      {
        authorId: guestId,
        notice: { kind: ChatNotice_Kind.REMOVED_BY_POCHICAL, subjectId: "" },
        seq: 2n,
      },
    ]);
    // Out of it now, they are not taken out again, nor noted twice.
    await expect(
      admin.removeFromGroup(guestId, groupId, "staff@pochical.app")
    ).resolves.toBeFalsy();
    const noted = await admin.actions();
    expect(
      noted.filter(
        (action) =>
          action.action === "removeFromGroup" && action.target === guestId
      )
    ).toHaveLength(1);
  });

  it("takes no one out of a group they are not in, nor for no account", async () => {
    const { groupId } = await pair();
    const outsider = await signInAnonymously();
    const admin = exports.AdminEntrypoint;
    await expect(
      admin.removeFromGroup(await userIdOf(outsider), groupId, "staff")
    ).resolves.toBeFalsy();
    await expect(
      admin.removeFromGroup(crypto.randomUUID(), groupId, "staff")
    ).resolves.toBeFalsy();
  });

  it("says a new name or icon, and nothing when neither changed", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    const mine = await groupSocket(groupId, maker);
    const rename = async (name: string, mark: Record<string, unknown>) => {
      await call("GroupService/RenameGroup", { groupId, mark, name }, guest);
      return noticesIn(await mine.frames.next());
    };
    const house = { color: 2, icon: "house" };
    const notices = [
      await rename("いとこの家", { emoji: "🍉" }),
      await rename("いとこの家", house),
      await rename("いとこの家", house),
    ];
    const changed = (name: string, markChanged: boolean) => [
      {
        authorId: guestId,
        notice: { kind: ChatNotice_Kind.PROFILE_CHANGED, markChanged, name },
      },
    ];
    expect(notices).toMatchObject([
      changed("いとこの家", false),
      changed("", true),
      [],
    ]);
  });

  it("says the invite link was made again", async () => {
    const { groupId, maker, makerId } = await pair();
    const mine = await groupSocket(groupId, maker);
    const remade = await call(
      "GroupService/RemakeInviteLink",
      { groupId },
      maker
    );
    expect(remade.status).toBe(200);
    expect(noticesIn(await mine.frames.next())).toMatchObject([
      { authorId: makerId, notice: { kind: ChatNotice_Kind.INVITE_REMADE } },
    ]);
  });

  it("takes no reaction, and cannot be taken back", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    // The guest is the writer of the notice of their joining, at seq 1.
    const theirs = await groupSocket(groupId, guest);
    sendFrame(theirs.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "react",
              value: { emoji: "👍", on: true, seq: 1n, threadId: "group" },
            },
            opId: "r",
          },
          {
            kind: { case: "unsend", value: { seq: 1n, threadId: "group" } },
            opId: "u",
          },
        ],
      },
    });
    await untilAcked(theirs.frames);
    // Nothing reaches the others, and the notice stays as it was.
    await expect(settled(mine.socket, mine.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
    const later = await groupSocket(groupId, maker, 0n);
    expect(noticesIn(await later.frames.next())).toMatchObject([
      {
        notice: { kind: ChatNotice_Kind.JOINED },
        reactions: [],
        seq: 1n,
      },
    ]);
  });
});
