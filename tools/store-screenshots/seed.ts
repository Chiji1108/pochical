// Puts on `mise run server` the group the stores' screenshots are
// photographed in (#806): 職場のみんな, three coworkers on a two-shift
// roster who speak politely, as people who have not exchanged contacts
// do, with this month's and next month's shifts and a little of
// 全体チャット, a 日にちの投票 over the days they are all off among it.
//
//   pnpm exec tsx tools/store-screenshots/seed.ts <file to write the invite code to>
//
// The app photographed joins as the fourth member through
// pochical://invite/<code>. Everything is arranged from today (in Japan):
// the seven days after it hold two days at least when all three are off,
// chosen among the days the apps' own sample month (`-sample`,
// SampleDays.swift) is off too, when it has any there. Local only
// (POCHICAL_DEV_SERVER, http://localhost:8787 by default); each run makes
// the group and its people anew.

import { writeFile } from "node:fs/promises";

import type { MessageInitShape } from "@bufbuild/protobuf";
import { readyPatterns } from "@pochical/design/patterns";
import type { ReadyPattern, ReadyPatternId } from "@pochical/design/patterns";

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
  USER_SOCKET,
} from "../group-client";
import type { SyncSocket } from "../group-client";

const [inviteFile] = process.argv.slice(2);
if (inviteFile === undefined) {
  fail(
    "pnpm exec tsx tools/store-screenshots/seed.ts <file to write the invite code to>"
  );
}
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(devServer).hostname)
) {
  fail(`${devServer} is not a server on this computer`);
}

// 二交代制's patterns (rosterTemplates' two-shift), by the ids a person's
// copies keep.
const SHIFTS = [
  "day",
  "night",
  "after",
  "off",
] as const satisfies readonly ReadyPatternId[];
type Shift = (typeof SHIFTS)[number];

const GROUP = { mark: { emoji: "🏥" }, name: "職場のみんな" };

// The members, the first making the group, each with the shifts they are
// given in turn from the first of the month: 夜勤 brings its 明け, so a
// round names none.
const MEMBERS: readonly { name: string; round: readonly Shift[] }[] = [
  {
    name: "田中",
    round: ["day", "day", "night", "off", "day", "night", "off", "off"],
  },
  {
    name: "小林",
    round: ["day", "night", "off", "off", "day", "day", "day", "off"],
  },
  {
    name: "森",
    round: ["night", "off", "day", "day", "off", "day", "night", "off", "off"],
  },
];

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

// A member's shift on each day, as a roster gives them out: their round,
// with the days together off, and no 夜勤 on the day before one, whose 明け
// would fall on it.
const rosterOf = (round: readonly Shift[]): Map<number, Shift> => {
  const roster = new Map<number, Shift>();
  let at = 0;
  for (const day of days) {
    const next = round[at % round.length] ?? "off";
    let shift: Shift = next;
    if (roster.get(day - 1) === "night") {
      shift = "after";
    } else if (together.has(day)) {
      shift = "off";
      // A day off the round was about to give is this one.
      at += next === "off" ? 1 : 0;
    } else {
      at += 1;
      if (next === "night" && together.has(day + 1)) {
        shift = "day";
      }
    }
    roster.set(day, shift);
  }
  return roster;
};

const rostered = MEMBERS.map(({ name, round }) => ({
  name,
  roster: rosterOf(round),
}));
// The days of the week ahead when all three are off: the poll's.
const allOff = week.filter((day) =>
  rostered.every(({ roster }) => roster.get(day) === "off")
);

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
    ...SHIFTS.map((id) => ({
      kind: {
        case: "pattern" as const,
        value: { hlc: stamp(), id, pattern: patternOf(id) },
      },
      opId: crypto.randomUUID(),
    })),
    {
      kind: {
        case: "order" as const,
        value: { hlc: stamp(), ids: [...SHIFTS] },
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

// What the group shows of its members' shifts so far, and its chat's
// lines as it last sent each, by seq and by the op_id that sent it.
const shownDays = new Set<string>();
const shownPatterns = new Set<string>();
const lines = new Map<bigint, ChatLine>();
const seqOfSend = new Map<string, bigint>();
// Every member's patterns and days have reached the group from their
// User DOs (spec/sync-protocol.md, Group projection).
const projected = Promise.withResolvers<undefined>();
const onGroupChange = ({ kind }: Change): void => {
  if (kind.case === "chatLine") {
    lines.set(kind.value.seq, kind.value);
    seqOfSend.set(kind.value.opId, kind.value.seq);
  } else if (kind.case === "memberPattern") {
    shownPatterns.add(`${kind.value.userId} ${kind.value.pattern?.id}`);
  } else if (kind.case === "memberDay") {
    shownDays.add(`${kind.value.userId} ${kind.value.day?.date}`);
  }
  if (
    shownPatterns.size === MEMBERS.length * SHIFTS.length &&
    shownDays.size === MEMBERS.length * days.length
  ) {
    projected.resolve(undefined);
  }
};

type Person = { name: string; socket: SyncSocket; userId: string };

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
    seqOfSend.get(opId) ??
    fail(`not taken by the group: ${person.name}'s ${content.case}`)
  );
};

const words = async (person: Person, text: string): Promise<bigint> =>
  await say(person, { case: "words", value: { text } });

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
  { ...GROUP, displayName: maker.name, requestId: crypto.randomUUID() },
  maker.token
);
const groupId = textOf(made, "groupId");
const inviteCode = textOf(made, "inviteCode");
// One after another, so the group's order of members is MEMBERS'.
for (const guest of guests) {
  // oxlint-disable-next-line no-await-in-loop -- in the order they join
  await rpc(
    devServer,
    "GroupService/JoinGroup",
    { displayName: guest.name, inviteCode },
    guest.token
  );
}

const people: Person[] = await Promise.all(
  [maker, ...guests].map(async ({ name, token, userId }) => ({
    name,
    socket: await openSocket(
      devServer,
      groupSocket(groupId),
      token,
      onGroupChange
    ),
    userId,
  }))
);
await Promise.all(
  [maker, ...guests].map(async ({ roster, token }) => {
    await enter(token, roster);
  })
);
await inTime(projected.promise);

const [tanaka, kobayashi, mori] = people;
if (tanaka === undefined || kobayashi === undefined || mori === undefined) {
  fail("no members");
}
await words(
  kobayashi,
  "すみません、モバイルバッテリー、休憩室にあったりしますか…？"
);
const found = await words(mori, "ありましたよ！ロッカーの上に置いておきますね");
await words(kobayashi, "助かります、ありがとうございます！");
await edit(tanaka, {
  case: "react",
  value: { emoji: "👍", on: true, seq: found, threadId: GROUP_THREAD },
});
await words(tanaka, "今度のごはん会、みんなの休みが合う日で決めませんか？");
await words(mori, "いいですね、行きたいです！");
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
const reacted = lines
  .get(found)
  ?.reactions.some(({ userIds }) => userIds.includes(tanaka.userId));
const pollLine = lines.get(poll)?.content?.kind;
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

await writeFile(inviteFile, `${inviteCode}\n`);

const MARKS: Record<Shift, string> = {
  after: "明",
  day: "日",
  night: "夜",
  off: "休",
};
console.log(
  `${GROUP.mark.emoji} ${GROUP.name}を作りました（${MEMBERS.map(({ name }) => name).join("・")}）`
);
console.log(`今日 ${todayKey}、明日からの7日（${keyOf(today + 1)}〜）:`);
for (const { name, roster } of rostered) {
  const marks = week.map((day) => MARKS[roster.get(day) ?? "off"]);
  console.log(`  ${name.padEnd(4, "　")}${marks.join(" ")}`);
}
console.log(
  `  ${"サンプル".padEnd(4, "　")}${week.map((day) => (sampleIsOff(day) ? "休" : "・")).join(" ")}`
);
console.log(`みんな休み（投票の日）: ${allOff.map(keyOf).join("、")}`);
console.log(
  `サンプルの月も休み: ${allOff.filter(sampleIsOff).map(keyOf).join("、") || "なし"}`
);
console.log(`招待コード ${inviteCode} を ${inviteFile} に書きました`);
console.log(`  pochical://invite/${inviteCode}`);
