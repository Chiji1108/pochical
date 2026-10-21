// The photos bucket held up against what names each object in it
// (spec/admin.md, 棚卸し): the objects nothing names, counted and weighed
// by where they are kept and why nothing names them, for Pochical's people
// to read before anything is deleted. It only reads.
import { isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { user } from "./db/auth-schema";
import { invites, supportChats } from "./db/schema";
import { chatLines, groupPhotos, profile } from "./group-do-schema";
import type { photoStates } from "./group-do-schema";
import { namedPhotos } from "./group-photos";
import { PREVIEW_CACHE_MS } from "./link-preview";
import { bucketPages } from "./photos";
import { supportPlace } from "./support-lines";

/**
 * Why nothing names an object:
 * - unnoted: the group has no note of the photo (group_photos).
 * - takenBack: its line was taken back, and the bucket keeps it still.
 * - sentUnnamed: noted as sent, but no line carries it (the lines that
 *   lost their photos in Group DO migration 0035).
 * - groupGone: its group is not set up, or was erased.
 * - notUsual: a user's own photo that is not their usual one.
 * - userGone: a user's own photo whose account is gone.
 * - unlinked: a link preview's picture that no line's preview names.
 * - expired: a page's preview cached past its day.
 * - unknown: a key no part of the server writes.
 */
export type OrphanReason =
  | "unnoted"
  | "takenBack"
  | "sentUnnamed"
  | "groupGone"
  | "notUsual"
  | "userGone"
  | "unlinked"
  | "expired"
  | "unknown";

/**
 * What became of an object: named by what is kept (`referenced`), too new
 * to judge (`recent`), or nothing names it, and why.
 */
export type Verdict = "referenced" | "recent" | OrphanReason;

/** What the group says of each photo it has a note of or names. */
export type GroupPhotoHold = "referenced" | "takenBack" | "sentUnnamed";

/** What a Group DO names in the bucket (GroupDO.bucketReferences). */
export type GroupReferences = {
  setUp: boolean;
  photos: Record<string, GroupPhotoHold>;
  previewImages: string[];
};

/** The objects of one verdict under one prefix, with a few of their keys. */
export type AuditRow = {
  prefix: string;
  verdict: Verdict;
  /** Nothing names them. */
  orphan: boolean;
  count: number;
  bytes: number;
  sample: string[];
};

export type BucketAudit = {
  atMs: number;
  /** Objects uploaded since `atMs - graceMs` are `recent`. */
  graceMs: number;
  /** The Group DOs (support chats among them) and User DOs asked. */
  groupsAsked: number;
  usersAsked: number;
  /** Every orphan row's together. */
  orphans: { count: number; bytes: number };
  rows: AuditRow[];
};

/**
 * Longer than anything stays unnamed on purpose: an upload not yet sent
 * (chatRules.unsentAfterMs), and a link preview's picture, which its
 * cached page hands out for a day after it is stored and a device may
 * send with its line after that.
 */
export const AUDIT_GRACE_MS = 2 * PREVIEW_CACHE_MS;

// Owners worked on at once.
const FAN_OUT = 20;
// Keys kept of each row, for a look at a few.
const SAMPLE = 20;

/** The lines' photos, each of them carried by a line not taken back. */
const linePhotos = (db: DrizzleSqliteDODatabase): string[] =>
  db
    .select({ photos: chatLines.photos })
    .from(chatLines)
    .where(isNotNull(chatLines.photos))
    .all()
    .flatMap(({ photos }) => (photos ?? []).map(({ id }) => id));

/** The pictures of the lines' link previews. */
const linePreviewImages = (db: DrizzleSqliteDODatabase): string[] =>
  db
    .select({ preview: chatLines.preview })
    .from(chatLines)
    .where(isNotNull(chatLines.preview))
    .all()
    .map(({ preview }) => preview?.imageId ?? "")
    .filter((id) => id !== "");

/**
 * What a photo's note says of it while nothing names it: the sweep owns
 * one unsent, shown or deleting (GroupDO.sweepPhotos), and nothing owns
 * one sent or taken back.
 */
const HOLD_OF_STATE: Record<(typeof photoStates)[number], GroupPhotoHold> = {
  deleting: "referenced",
  sent: "sentUnnamed",
  shown: "referenced",
  takenBack: "takenBack",
  unsent: "referenced",
};

/**
 * What a group names in the bucket: each photo it has a note of, by its
 * note, and each a line, its mark or a face names, as referenced.
 */
export const groupReferences = (
  db: DrizzleSqliteDODatabase
): GroupReferences => {
  const photos: Record<string, GroupPhotoHold> = {};
  for (const { id, state } of db.select().from(groupPhotos).all()) {
    photos[id] = HOLD_OF_STATE[state];
  }
  for (const id of [...linePhotos(db), ...namedPhotos(db)]) {
    photos[id] = "referenced";
  }
  return {
    photos,
    previewImages: linePreviewImages(db),
    setUp: db.select().from(profile).get() !== undefined,
  };
};

/**
 * What an object is held up against: its owner's references, when the
 * key is under a group or a user (none when the group was not asked or
 * the user has no account), and every line's preview pictures.
 */
type Lookup = {
  group?: GroupReferences;
  usualPhoto?: string;
  previewImages: ReadonlySet<string>;
};

/** One kind of key the server writes, and what names an object of it. */
type KeyKind = {
  prefix: string;
  pattern: RegExp;
  judge: (parts: Record<string, string>, lookup: Lookup) => Verdict;
};

const GROUP_PHOTO =
  /^groups\/(?<groupId>[^/]+)\/photos\/(?<photoId>[^/]+)(?:\/small)?$/u;

// The keys the server writes (photos.ts, link-preview.ts), each prefix
// once; a key under none of them, or not of its prefix's shape, is
// `unknown`.
const KEY_KINDS: KeyKind[] = [
  {
    // A group's or a support chat's photo, and its small version.
    judge: ({ photoId = "" }, { group }) =>
      group?.setUp === true
        ? (group.photos[photoId] ?? "unnoted")
        : "groupGone",
    pattern: GROUP_PHOTO,
    prefix: "groups/",
  },
  {
    judge: ({ photoId = "" }, { usualPhoto }) => {
      if (usualPhoto === undefined) {
        return "userGone";
      }
      return usualPhoto === photoId ? "referenced" : "notUsual";
    },
    pattern: /^people\/(?<userId>[^/]+)\/photos\/(?<photoId>[^/]+)$/u,
    prefix: "people/",
  },
  {
    judge: ({ imageId = "" }, { previewImages }) =>
      previewImages.has(imageId) ? "referenced" : "unlinked",
    pattern: /^previews\/images\/(?<imageId>[^/]+)$/u,
    prefix: "previews/images/",
  },
  {
    // Past its day, as any newer is `recent`.
    judge: () => "expired",
    pattern: /^previews\/pages\/[0-9a-f]{64}\.json$/u,
    prefix: "previews/pages/",
  },
];

const OTHER_PREFIX = "";
const GROUPS = "groups/";
const PEOPLE = "people/";

/** Where an object is kept, and what became of it. */
const judgeObject = (
  object: R2Object,
  lookup: Lookup,
  since: number
): { prefix: string; verdict: Verdict } => {
  const kind = KEY_KINDS.find(({ prefix }) => object.key.startsWith(prefix));
  if (kind === undefined) {
    return { prefix: OTHER_PREFIX, verdict: "unknown" };
  }
  const parts = kind.pattern.exec(object.key);
  if (parts === null) {
    return { prefix: kind.prefix, verdict: "unknown" };
  }
  if (object.uploaded.getTime() > since) {
    return { prefix: kind.prefix, verdict: "recent" };
  }
  return {
    prefix: kind.prefix,
    verdict: kind.judge(parts.groups ?? {}, lookup),
  };
};

/** The rows' order: by prefix as KEY_KINDS lists them, then by verdict. */
const VERDICTS: Verdict[] = [
  "referenced",
  "recent",
  "unnoted",
  "takenBack",
  "sentUnnamed",
  "groupGone",
  "notUsual",
  "userGone",
  "unlinked",
  "expired",
  "unknown",
];
const PREFIXES = [...KEY_KINDS.map(({ prefix }) => prefix), OTHER_PREFIX];

/** Objects counted and weighed by prefix and verdict, a few keys kept. */
const tally = (since: number) => {
  const rows = new Map<string, AuditRow>();
  const add = (object: R2Object, lookup: Lookup) => {
    const { prefix, verdict } = judgeObject(object, lookup, since);
    const id = `${prefix}\n${verdict}`;
    const row = rows.get(id) ?? {
      bytes: 0,
      count: 0,
      orphan: verdict !== "referenced" && verdict !== "recent",
      prefix,
      sample: [],
      verdict,
    };
    row.count += 1;
    row.bytes += object.size;
    if (row.sample.length < SAMPLE) {
      row.sample.push(object.key);
    }
    rows.set(id, row);
  };
  const order = (row: AuditRow) =>
    PREFIXES.indexOf(row.prefix) * VERDICTS.length +
    VERDICTS.indexOf(row.verdict);
  const sorted = () =>
    [...rows.values()].toSorted((a, b) => order(a) - order(b));
  return { add, sorted };
};

/** Every object under `prefix`. */
const objectsUnder = async (
  bucket: R2Bucket,
  prefix: string
): Promise<R2Object[]> => {
  const objects: R2Object[] = [];
  for await (const page of bucketPages(bucket, { prefix })) {
    objects.push(...page.objects);
  }
  return objects;
};

/** The objects right under `prefix`, and the prefixes one `/` below it. */
const directory = async (bucket: R2Bucket, prefix: string) => {
  const objects: R2Object[] = [];
  const prefixes: string[] = [];
  for await (const page of bucketPages(bucket, { delimiter: "/", prefix })) {
    objects.push(...page.objects);
    prefixes.push(...page.delimitedPrefixes);
  }
  return { objects, prefixes };
};

/** `work` done for each of `items`, FAN_OUT at a time. */
const eachAtMost = async (
  items: string[],
  work: (item: string) => Promise<void>
): Promise<void> => {
  // One queue the workers take from, each the next item as it is free.
  const queue = items.values();
  await Promise.all(
    Array.from({ length: FAN_OUT }, async () => {
      for (const item of queue) {
        // oxlint-disable-next-line no-await-in-loop -- FAN_OUT run side by side
        await work(item);
      }
    })
  );
};

/**
 * The bucket audited as of `atMs`, an owner at a time: each group's
 * objects listed and judged against its Group DO, then each user's
 * against their User DO, then the rest against every line's preview
 * pictures. A Group DO is asked only when it must exist, so none is made
 * by asking: a group with a live invitation or a support chat D1 indexes,
 * or one the server stored a photo under, which its DO noted first. A
 * User DO is asked only for a user with an account.
 */
export const auditBucket = async (
  env: Env,
  atMs: number
): Promise<BucketAudit> => {
  const since = atMs - AUDIT_GRACE_MS;
  const db = drizzle(env.DB);
  const [root, groupsDir, peopleDir, invited, supported, accounts] =
    await Promise.all([
      directory(env.PHOTOS, ""),
      directory(env.PHOTOS, GROUPS),
      directory(env.PHOTOS, PEOPLE),
      db.select({ id: invites.groupId }).from(invites).all(),
      db.select({ id: supportChats.userId }).from(supportChats).all(),
      db.select({ id: user.id }).from(user).all(),
    ]);
  const rows = tally(since);
  const nothing: Lookup = { previewImages: new Set() };
  for (const object of [
    ...root.objects,
    ...groupsDir.objects,
    ...peopleDir.objects,
  ]) {
    rows.add(object, nothing);
  }

  const known = new Set([
    ...invited.map(({ id }) => id),
    ...supported.map(({ id }) => supportPlace(id)),
  ]);
  const withObjects = new Map(
    groupsDir.prefixes.map((prefix) => [
      prefix.slice(GROUPS.length, -1),
      prefix,
    ])
  );
  const previewImages = new Set<string>();
  let groupsAsked = 0;
  await eachAtMost(
    [...new Set([...known, ...withObjects.keys()])],
    async (groupId) => {
      const prefix = withObjects.get(groupId);
      const objects =
        prefix === undefined ? [] : await objectsUnder(env.PHOTOS, prefix);
      const asked =
        known.has(groupId) || objects.some(({ key }) => GROUP_PHOTO.test(key));
      const group = asked
        ? await env.GROUPS.getByName(groupId).bucketReferences()
        : undefined;
      groupsAsked += asked ? 1 : 0;
      for (const id of group?.previewImages ?? []) {
        previewImages.add(id);
      }
      for (const object of objects) {
        rows.add(object, { ...nothing, group });
      }
    }
  );

  const withAccount = new Set(accounts.map(({ id }) => id));
  let usersAsked = 0;
  await eachAtMost(peopleDir.prefixes, async (prefix) => {
    const userId = prefix.slice(PEOPLE.length, -1);
    const objects = await objectsUnder(env.PHOTOS, prefix);
    const account = withAccount.has(userId)
      ? await env.USERS.getByName(userId).profileOf()
      : undefined;
    const usualPhoto = account?.photoId;
    usersAsked += usualPhoto === undefined ? 0 : 1;
    for (const object of objects) {
      rows.add(object, { ...nothing, usualPhoto });
    }
  });

  const rest = root.prefixes.filter(
    (prefix) => prefix !== GROUPS && prefix !== PEOPLE
  );
  for (const prefix of rest) {
    // oxlint-disable-next-line no-await-in-loop -- each prefix's pages in turn
    for await (const page of bucketPages(env.PHOTOS, { prefix })) {
      for (const object of page.objects) {
        rows.add(object, { previewImages });
      }
    }
  }

  const sorted = rows.sorted();
  const orphans = sorted.filter(({ orphan }) => orphan);
  return {
    atMs,
    graceMs: AUDIT_GRACE_MS,
    groupsAsked,
    orphans: {
      bytes: orphans.reduce((sum, row) => sum + row.bytes, 0),
      count: orphans.reduce((sum, row) => sum + row.count, 0),
    },
    rows: sorted,
    usersAsked,
  };
};
