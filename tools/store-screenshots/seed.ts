// Puts on `mise run server` the groups the stores' screenshots are
// photographed in (#806), each made by the same piece from its own people:
// 職場のみんな, three coworkers on a two-shift roster who speak politely,
// as people who have not exchanged contacts do, with a little of
// 全体チャット, a 日にちの投票 over the days
// they are all off among it and two photos sent at once of what someone
// left in the break room (photos/, where a JPEG put under the same name
// is sent in its place), written
// once the person photographed has joined, so the chat says everyone's
// joining above its lines; and 学生時代の友だち, three friends who work
// at different places, each on shifts of their own. Everyone's usual
// photo is one of the faces' drawings the apps offer (design/src/drawings),
// no two the same in a group. Both hold this month's and next month's
// shifts.
//
//   pnpm exec tsx tools/store-screenshots/seed.ts <file for the coworkers' invite code> <file for the friends'>
//
// The app photographed joins each as one more member through
// pochical://invite/<code>, which this waits for after writing the codes,
// and ends once the chat is written. Everything is arranged from today (in Japan):
// the seven days after it hold two days at least when everyone of a group
// is off, chosen among the days the apps' own sample month (`-sample`,
// SampleDays.swift) is off too, when it has any there. Local only
// (POCHICAL_DEV_SERVER, http://localhost:8787 by default); each run makes
// the groups and their people anew.

import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import type { drawings } from "@pochical/design/drawings";
import { readyPatterns } from "@pochical/design/patterns";
import type { ReadyPattern, ReadyPatternId } from "@pochical/design/patterns";
import sharp from "sharp";

import {
  DayField,
  RefusedSend_Reason,
} from "../../apps/server/src/gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatEditSchema,
  ChatLine,
  ChatSendContentSchema,
} from "../../apps/server/src/gen/pochical/v1/sync_pb";
import { SERVER_DEVICE } from "../../apps/server/src/hlc";
import { tick } from "../../packages/prototype/src/lib/hlc";
import { STORE_SCENE } from "../../packages/prototype/src/lib/store-scene";
import { devServer } from "../dev-server";
import {
  fail,
  GROUP_THREAD,
  groupSocket,
  inTime,
  openSocket,
  rpc,
  signIn,
  textOf,
  upload,
  uploadOwn,
  USER_SOCKET,
} from "../group-client";
import type { SyncSocket } from "../group-client";

const [coworkersFile, friendsFile] = process.argv.slice(2);
if (coworkersFile === undefined || friendsFile === undefined) {
  fail(
    "pnpm exec tsx tools/store-screenshots/seed.ts <file for the coworkers' invite code> <file for the friends'>"
  );
}
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(devServer).hostname)
) {
  fail(`${devServer} is not a server on this computer`);
}

type Shift = ReadyPatternId;

type Group = {
  mark: { emoji: string };
  members: readonly Member[];
  name: string;
};

// A member: the ready-made patterns they use, the first the plain day's
// work and `off` among them; the shifts they are given in turn from the
// first of the month, where one that brings the next day's (夜勤's 明け)
// names it not; and the drawing they show as their usual photo.
type Member = {
  name: string;
  photo: (typeof drawings)[number]["id"];
  round: readonly Shift[];
  shifts: readonly [Shift, ...Shift[]];
};

// 二交代制's patterns (rosterTemplates' two-shift).
const TWO_SHIFT = ["day", "night", "after", "off"] as const;

// The groups' names, their people and what the coworkers say are the
// scene's (STORE_SCENE), which the site's top page draws too.
const { coworkers: atWork, friends: fromSchool } = STORE_SCENE;

const COWORKERS = {
  mark: { emoji: atWork.emoji },
  members: [
    {
      ...atWork.people[0],
      round: ["day", "day", "night", "off", "day", "night", "off", "off"],
      shifts: TWO_SHIFT,
    },
    {
      ...atWork.people[1],
      round: ["day", "night", "off", "off", "day", "day", "day", "off"],
      shifts: TWO_SHIFT,
    },
    {
      ...atWork.people[2],
      round: [
        "night",
        "off",
        "day",
        "day",
        "off",
        "day",
        "night",
        "off",
        "off",
      ],
      shifts: TWO_SHIFT,
    },
  ],
  name: atWork.name,
} as const satisfies Group;

// Friends from school, each at a workplace of their own: a shop's 早番 and
// 遅番, a ward's two shifts, and a part-time job.
const FRIENDS = {
  mark: { emoji: fromSchool.emoji },
  members: [
    {
      ...fromSchool.people[0],
      round: ["early", "early", "late", "off", "late", "early", "off"],
      shifts: ["early", "late", "off"],
    },
    {
      ...fromSchool.people[1],
      round: ["day", "night", "off", "day", "day", "off"],
      shifts: TWO_SHIFT,
    },
    {
      ...fromSchool.people[2],
      round: ["part", "off", "part", "part", "off"],
      shifts: ["part", "off"],
    },
  ],
  name: fromSchool.name,
} as const satisfies Group;

// Days are counted from the Unix epoch, and written YYYY-MM-DD.
const DAY_MS = 86_400_000;
const keyOf = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayOn = (year: number, month: number, date: number): number =>
  Date.UTC(year, month, date) / DAY_MS;

// Today as a phone in Japan has it.
const todayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
}).format(new Date());
const [year = 0, monthOfYear = 0, date = 0] = todayKey.split("-").map(Number);
const month = monthOfYear - 1;
const today = dayOn(year, month, date);
const first = dayOn(year, month, 1);
// This month and the next, so the seven days after today are there on
// the month's last day too.
const days = Array.from(
  { length: dayOn(year, month + 2, 1) - first },
  (_, index) => first + index
);
const week = Array.from({ length: 7 }, (_, index) => today + 1 + index);

// Whether the apps' sample month is off on a day (SampleDays.swift): its
// round from the first of last month, and 日勤 put on two days of this
// one. Its holidays, off too, are left out, so it is off on more days
// than this says and never fewer.
const SAMPLE_ROUND: readonly Shift[] = [
  "day",
  "day",
  "night",
  "after",
  "off",
  "off",
];
const sampleStart = dayOn(year, month - 1, 1);
const sampleIsOff = (day: number): boolean =>
  day !== first + 7 &&
  day !== first + 12 &&
  SAMPLE_ROUND[(day - sampleStart) % SAMPLE_ROUND.length] === "off";

// The two days everyone is given off: the latest of the week the sample
// month is off on, and the week's latest where it has fewer.
const together = new Set(
  week
    .toSorted(
      (a, b) => Number(sampleIsOff(b)) - Number(sampleIsOff(a)) || b - a
    )
    .slice(0, 2)
);

const isShift = (id: string): id is Shift => Object.hasOwn(readyPatterns, id);

// The pattern a shift brings on the next day, as 夜勤 its 明け.
const broughtBy = (shift: Shift | undefined): Shift | undefined => {
  if (shift === undefined) {
    return undefined;
  }
  const { nextDay }: ReadyPattern = readyPatterns[shift];
  return nextDay !== undefined && isShift(nextDay) ? nextDay : undefined;
};

// A member's shift on each day, as a roster gives them out: their round,
// with the days together off, and on the day before one the plain day's
// work in place of a shift whose next day's would fall on it.
const rosterOf = ({ round, shifts }: Member): Map<number, Shift> => {
  const roster = new Map<number, Shift>();
  let at = 0;
  for (const day of days) {
    const next = round[at % round.length] ?? "off";
    const brought = broughtBy(roster.get(day - 1));
    let shift: Shift = next;
    if (brought !== undefined) {
      shift = brought;
    } else if (together.has(day)) {
      shift = "off";
      // A day off the round was about to give is this one.
      at += next === "off" ? 1 : 0;
    } else {
      at += 1;
      if (broughtBy(next) !== undefined && together.has(day + 1)) {
        [shift] = shifts;
      }
    }
    roster.set(day, shift);
  }
  return roster;
};

// A ready-made pattern as a person's own.
const patternOf = (id: Shift) => {
  const {
    time,
    countsAsOff = false,
    ...ready
  }: ReadyPattern = readyPatterns[id];
  return { ...ready, countsAsOff, end: time?.[1], start: time?.[0] };
};

// A device's clock (spec/sync-protocol.md, HLC), one tick an edit.
const clockOf = (deviceId: string) => {
  let last = { counter: 0, ms: 0 };
  return () => {
    last = tick(last, Date.now());
    return { counter: last.counter, deviceId, physicalMs: BigInt(last.ms) };
  };
};

/**
 * Enters a member's patterns and shifts as a device of theirs would, on
 * their own socket. The server answers an edit it does not keep with its
 * own value in its place, before its Acked: that fails.
 */
const enter = async (
  token: string,
  shifts: readonly Shift[],
  roster: Map<number, Shift>
): Promise<void> => {
  const stamp = clockOf(crypto.randomUUID());
  const socket = await openSocket(devServer, USER_SOCKET, token, ({ kind }) => {
    if (
      (kind.case === "day" ||
        kind.case === "pattern" ||
        kind.case === "patternOrder") &&
      kind.value.hlc?.deviceId === SERVER_DEVICE
    ) {
      fail(`refused by the server: ${JSON.stringify(kind.value)}`);
    }
  });
  const patternEdits = [
    ...shifts.map((id) => ({
      kind: {
        case: "pattern" as const,
        value: { hlc: stamp(), id, pattern: patternOf(id) },
      },
      opId: crypto.randomUUID(),
    })),
    {
      kind: {
        case: "order" as const,
        value: { hlc: stamp(), ids: [...shifts] },
      },
      opId: crypto.randomUUID(),
    },
  ];
  const dayEdits = [...roster].map(([day, shift]) => ({
    opId: crypto.randomUUID(),
    value: {
      date: keyOf(day),
      field: DayField.PATTERN,
      hlc: stamp(),
      value: shift,
    },
  }));
  socket.send({ case: "patternEdits", value: { edits: patternEdits } });
  socket.send({ case: "dayEdits", value: { edits: dayEdits } });
  await inTime(
    Promise.all(
      [...patternEdits, ...dayEdits].map(
        async ({ opId }) => await socket.answered(opId)
      )
    )
  );
  socket.close();
};

/**
 * Makes the drawing `photo` a member's usual photo (spec/sync-protocol.md,
 * Profile), as a JPEG, the way the apps send one picked.
 */
const showPhoto = async (token: string, photo: Member["photo"]) => {
  const drawing = path.join(
    import.meta.dirname,
    `../../design/src/drawings/${photo}.svg`
  );
  const bytes = new Uint8Array(
    await sharp(drawing).jpeg({ quality: 90 }).toBuffer()
  );
  const photoId = await uploadOwn(
    devServer,
    { bytes, file: `${photo}.jpg` },
    token
  );
  await rpc(devServer, "UserService/SetProfile", { photoId }, token);
};

// A member in their group: its socket, and what the group has sent of its
// chat, the lines as it last sent each by seq and the seq of each by the
// op_id that sent it.
type Person = {
  lines: Map<bigint, ChatLine>;
  name: string;
  seqOfSend: Map<string, bigint>;
  socket: SyncSocket;
  token: string;
  userId: string;
};

/** One edit of the chat as a member, answered by the group. */
const edit = async (
  { name, socket }: Person,
  kind: NonNullable<MessageInitShape<typeof ChatEditSchema>["kind"]>
): Promise<string> => {
  const opId = crypto.randomUUID();
  socket.send({ case: "chatEdits", value: { edits: [{ kind, opId }] } });
  const refusal = await inTime(socket.answered(opId));
  if (refusal !== undefined) {
    fail(
      `refused by the group (${RefusedSend_Reason[refusal]}): ${name}'s ${kind.case}`
    );
  }
  return opId;
};

/** A line a member sends, by the seq the group gave it. */
const say = async (
  person: Person,
  content: NonNullable<MessageInitShape<typeof ChatSendContentSchema>["kind"]>
): Promise<bigint> => {
  const opId = await edit(person, {
    case: "send",
    value: { content: { kind: content }, threadId: GROUP_THREAD },
  });
  return (
    person.seqOfSend.get(opId) ??
    fail(`not taken by the group: ${person.name}'s ${content.case}`)
  );
};

const words = async (person: Person, text: string): Promise<bigint> =>
  await say(person, { case: "words", value: { text } });

// The photos sent at once in the coworkers' chat, of photos/.
const ALBUM = ["treat-1.jpg", "treat-2.jpg"] as const;

// A photo as the apps make it to send (spec/chat.md, Photos): turned
// upright and written again as a JPEG no longer than `edge` on a side.
const shrunk = async (file: string, edge: number) => {
  const { data, info } = await sharp(file)
    .rotate()
    .resize({
      fit: "inside",
      height: edge,
      width: edge,
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(data),
    height: info.height,
    width: info.width,
  };
};

/** Sends the photos of `ALBUM` at once as a member of the group. */
const album = async (person: Person, groupId: string): Promise<bigint> => {
  const photos = await Promise.all(
    ALBUM.map(async (file) => {
      const photograph = path.join(import.meta.dirname, "photos", file);
      const { bytes, height, width } = await shrunk(
        photograph,
        chatRules.photoMaxEdge
      );
      const small =
        Math.max(height, width) > chatRules.photoSmallEdge
          ? await shrunk(photograph, chatRules.photoSmallEdge)
          : undefined;
      const id = await upload(
        devServer,
        { bytes, file, small: small?.bytes },
        groupId,
        person.token
      );
      return { height, id, width };
    })
  );
  return await say(person, { case: "photos", value: { photos } });
};

/**
 * Makes `group` with its members, the first making it, each with their
 * patterns, shifts and photo, once all of them have reached the group from
 * their User DOs (spec/sync-protocol.md, Group projection).
 */
const make = async ({ mark, members, name }: Group) => {
  const rostered = members.map((member) => ({
    ...member,
    roster: rosterOf(member),
  }));
  const [maker, ...guests] = await Promise.all(
    rostered.map(async (member) => ({
      ...member,
      ...(await signIn(devServer)),
    }))
  );
  if (maker === undefined) {
    fail("no members");
  }
  const made = await rpc(
    devServer,
    "GroupService/CreateGroup",
    { displayName: maker.name, mark, name, requestId: crypto.randomUUID() },
    maker.token
  );
  const groupId = textOf(made, "groupId");
  const inviteCode = textOf(made, "inviteCode");
  // One after another, so the group's order of members is theirs here.
  for (const guest of guests) {
    // oxlint-disable-next-line no-await-in-loop -- in the order they join
    await rpc(
      devServer,
      "GroupService/JoinGroup",
      { displayName: guest.name, inviteCode },
      guest.token
    );
  }

  // What the group shows of its members' shifts and faces so far.
  const shownDays = new Set<string>();
  const shownPatterns = new Set<string>();
  const shownPhotos = new Set<string>();
  const lines = new Map<bigint, ChatLine>();
  const seqOfSend = new Map<string, bigint>();
  const projected = Promise.withResolvers<undefined>();
  // Everyone the group has said is in it, and one more than its own come.
  const inGroup = new Set<string>();
  const joined = Promise.withResolvers<undefined>();
  const onGroupChange = ({ kind }: Change): void => {
    if (kind.case === "chatLine") {
      lines.set(kind.value.seq, kind.value);
      seqOfSend.set(kind.value.opId, kind.value.seq);
    } else if (kind.case === "memberPattern") {
      shownPatterns.add(`${kind.value.userId} ${kind.value.pattern?.id}`);
    } else if (kind.case === "memberDay") {
      shownDays.add(`${kind.value.userId} ${kind.value.day?.date}`);
    } else if (kind.case === "member") {
      inGroup.add(kind.value.userId);
      if (kind.value.photoId !== "") {
        shownPhotos.add(kind.value.userId);
      }
      if (inGroup.size > members.length) {
        joined.resolve(undefined);
      }
    }
    if (
      shownPhotos.size === members.length &&
      shownPatterns.size ===
        members.reduce((count, { shifts }) => count + shifts.length, 0) &&
      shownDays.size === members.length * days.length
    ) {
      projected.resolve(undefined);
    }
  };
  const people: Person[] = await Promise.all(
    [maker, ...guests].map(async ({ name: person, token, userId }) => ({
      lines,
      name: person,
      seqOfSend,
      socket: await openSocket(
        devServer,
        groupSocket(groupId),
        token,
        onGroupChange
      ),
      token,
      userId,
    }))
  );
  await Promise.all(
    [maker, ...guests].map(async ({ photo, roster, shifts, token }) => {
      await Promise.all([
        enter(token, shifts, roster),
        showPhoto(token, photo),
      ]);
    })
  );
  await inTime(projected.promise);
  return { groupId, inviteCode, joined: joined.promise, people, rostered };
};

const coworkers = await make(COWORKERS);
const friends = await make(FRIENDS);
for (const { socket } of friends.people) {
  socket.close();
}
await writeFile(friendsFile, `${friends.inviteCode}\n`);
await writeFile(coworkersFile, `${coworkers.inviteCode}\n`);
console.log(`招待コードを ${coworkersFile} と ${friendsFile} に書きました`);

// The coworkers talk once the person photographed is among them, however
// long the app takes to come: the chat then says every joining before
// its first line.
await coworkers.joined;
const { people } = coworkers;
// The days of the week ahead when all the coworkers are off: the poll's.
const allOff = week.filter((day) =>
  coworkers.rostered.every(({ roster }) => roster.get(day) === "off")
);
const [tanaka, kobayashi, mori] = people;
if (tanaka === undefined || kobayashi === undefined || mori === undefined) {
  fail("no members");
}
await words(tanaka, "おつかれさまです！");
await words(kobayashi, "おつかれさまです〜");
await album(mori, coworkers.groupId);
await words(mori, "休憩室に差し入れあります！");
await words(kobayashi, atWork.says.asked);
const found = await words(mori, atWork.says.found);
await edit(tanaka, {
  case: "react",
  value: { emoji: "👍", on: true, seq: found, threadId: GROUP_THREAD },
});
await words(tanaka, atWork.says.meal);
const poll = await say(tanaka, {
  case: "poll",
  value: { days: allOff.map(keyOf) },
});
// 森 can come on every day, 小林 on the last.
const votes = [
  ...allOff.map((day) => ({ day, voter: mori })),
  ...allOff.slice(-1).map((day) => ({ day, voter: kobayashi })),
];
for (const { day, voter } of votes) {
  // oxlint-disable-next-line no-await-in-loop -- in the order they vote
  await edit(voter, {
    case: "vote",
    value: { day: keyOf(day), on: true, seq: poll, threadId: GROUP_THREAD },
  });
}
for (const { socket } of people) {
  socket.close();
}

// The group acknowledges a reaction or a vote it does not take like any
// other: the lines it sent again say whether they are on them.
const reacted = tanaka.lines
  .get(found)
  ?.reactions.some(({ userIds }) => userIds.includes(tanaka.userId));
const pollLine = tanaka.lines.get(poll)?.content?.kind;
const voted =
  pollLine?.case === "poll" &&
  votes.every(({ day, voter }) =>
    pollLine.value.votes.some(
      (vote) => vote.day === keyOf(day) && vote.userIds.includes(voter.userId)
    )
  );
if (reacted !== true || !voted) {
  fail("refused by the group: the reaction or a vote");
}

const markOf = (shift: Shift | undefined): string =>
  shift === undefined ? "・" : readyPatterns[shift].symbol;
console.log(`今日 ${todayKey}、明日からの7日（${keyOf(today + 1)}〜）:`);
for (const [group, { inviteCode, rostered }] of [
  [COWORKERS, coworkers],
  [FRIENDS, friends],
] as const) {
  console.log(
    `${group.mark.emoji} ${group.name}（pochical://invite/${inviteCode}）`
  );
  for (const { name, roster } of rostered) {
    const marks = week.map((day) => markOf(roster.get(day)));
    console.log(`  ${name.padEnd(4, "　")}${marks.join(" ")}`);
  }
}
console.log(
  `  ${"サンプル".padEnd(4, "　")}${week.map((day) => (sampleIsOff(day) ? "休" : "・")).join(" ")}`
);
console.log(`みんな休み（投票の日）: ${allOff.map(keyOf).join("、")}`);
console.log(
  `サンプルの月も休み: ${allOff.filter(sampleIsOff).map(keyOf).join("、") || "なし"}`
);
