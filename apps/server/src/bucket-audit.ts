// The photos bucket held up against what names each object in it
// (spec/admin.md, 棚卸し): the objects nothing names, counted and weighed
// by where they are kept and why nothing names them, for Pochical's people
// to read before anything is deleted. It only reads.
import { chatRules } from "@pochical/design/chat";
import { isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { user } from "./db/auth-schema";
import { invites, supportChats } from "./db/schema";
import { chatLines, groupPhotos, profile } from "./group-do-schema";
import type { photoStates } from "./group-do-schema";
import { namedPhotos } from "./group-photos";
import { PREVIEW_CACHE_MS } from "./link-preview";
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
  count: number;
  bytes: number;
  sample: string[];
};

export type BucketAudit = {
  atMs: number;
  /** Objects uploaded since `atMs - graceMs` are `recent`. */
  graceMs: number;
  groups: number;
  users: number;
  rows: AuditRow[];
};

/**
 * Longer than anything new stays unnamed on purpose: an upload not yet
 * sent (chatRules.unsentAfterMs), and a page's preview, whose picture a
 * line may still take while it is cached.
 */
export const AUDIT_GRACE_MS = Math.max(
  PREVIEW_CACHE_MS,
  chatRules.unsentAfterMs
);

// Durable Objects asked at once.
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

/** What the audit holds the bucket's objects up against. */
type References = {
  groups: Map<string, GroupReferences>;
  /** Each user with an account, by their usual photo (empty for none). */
  usualPhotos: Map<string, string>;
  previewImages: Set<string>;
};

/** One kind of key the server writes, and what names an object of it. */
type KeyKind = {
  prefix: string;
  pattern: RegExp;
  judge: (parts: Record<string, string>, refs: References) => Verdict;
};

// The keys the server writes (photos.ts, link-preview.ts), each prefix
// once; a key under none of them is `unknown`.
const KEY_KINDS: KeyKind[] = [
  {
    // A group's or a support chat's photo, and its small version.
    judge: ({ groupId = "", photoId = "" }, refs) => {
      const group = refs.groups.get(groupId);
      if (group?.setUp !== true) {
        return "groupGone";
      }
      return group.photos[photoId] ?? "unnoted";
    },
    pattern:
      /^groups\/(?<groupId>[^/]+)\/photos\/(?<photoId>[^/]+)(?:\/small)?$/u,
    prefix: "groups/",
  },
  {
    judge: ({ userId = "", photoId = "" }, refs) => {
      const usual = refs.usualPhotos.get(userId);
      if (usual === undefined) {
        return "userGone";
      }
      return usual === photoId ? "referenced" : "notUsual";
    },
    pattern: /^people\/(?<userId>[^/]+)\/photos\/(?<photoId>[^/]+)$/u,
    prefix: "people/",
  },
  {
    judge: ({ imageId = "" }, refs) =>
      refs.previewImages.has(imageId) ? "referenced" : "unlinked",
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

/** Where an object is kept, and what became of it. */
const judgeObject = (
  object: { key: string; uploaded: Date },
  refs: References,
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
  return { prefix: kind.prefix, verdict: kind.judge(parts.groups ?? {}, refs) };
};

/**
 * The bucket's listing, page by page.
 * @yields {R2Objects} Each page, the next asked for by its cursor.
 */
async function* listed(
  bucket: R2Bucket,
  options: { prefix?: string; delimiter?: string }
): AsyncGenerator<R2Objects> {
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line no-await-in-loop -- each page names the next
    const page = await bucket.list({ ...options, cursor });
    yield page;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor !== undefined);
}

/** The owners the bucket keeps objects under: `{prefix}{owner}/...`. */
const ownersIn = async (bucket: R2Bucket, prefix: string) => {
  const owners: string[] = [];
  for await (const page of listed(bucket, { delimiter: "/", prefix })) {
    owners.push(
      ...page.delimitedPrefixes.map((under) => under.slice(prefix.length, -1))
    );
  }
  return owners;
};

/** Each of `items` asked of its Durable Object, FAN_OUT at a time. */
const askAll = async <T>(
  items: string[],
  ask: (item: string) => Promise<T>
): Promise<Map<string, T>> => {
  const answers: (readonly [string, T])[] = [];
  for (let at = 0; at < items.length; at += FAN_OUT) {
    // oxlint-disable-next-line no-await-in-loop -- one batch at a time
    const batch = await Promise.all(
      items
        .slice(at, at + FAN_OUT)
        .map(async (item) => [item, await ask(item)] as const)
    );
    answers.push(...batch);
  }
  return new Map(answers);
};

/**
 * What names the bucket's objects. Only Durable Objects that must exist
 * are asked, so none is made by asking: each group with a live invitation
 * or with photos (noted before they were stored), each support chat D1
 * indexes or with photos, and each user with an account and photos of
 * their own.
 */
const referencesIn = async (env: Env): Promise<References> => {
  const db = drizzle(env.DB);
  const [inBucket, invited, supported, accounts, photographers] =
    await Promise.all([
      ownersIn(env.PHOTOS, "groups/"),
      db.select({ id: invites.groupId }).from(invites).all(),
      db.select({ id: supportChats.userId }).from(supportChats).all(),
      db.select({ id: user.id }).from(user).all(),
      ownersIn(env.PHOTOS, "people/"),
    ]);
  const groupIds = new Set([
    ...inBucket,
    ...invited.map(({ id }) => id),
    ...supported.map(({ id }) => supportPlace(id)),
  ]);
  const withAccount = new Set(accounts.map(({ id }) => id));
  const [groups, profiles] = await Promise.all([
    askAll(
      [...groupIds],
      async (id) => await env.GROUPS.getByName(id).bucketReferences()
    ),
    askAll(
      photographers.filter((id) => withAccount.has(id)),
      async (id) => await env.USERS.getByName(id).profileOf()
    ),
  ]);
  const usualPhotos = new Map(
    [...profiles].map(([id, { photoId }]) => [id, photoId])
  );
  const previewImages = new Set(
    [...groups.values()].flatMap(({ previewImages: ids }) => ids)
  );
  return { groups, previewImages, usualPhotos };
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

/**
 * The bucket audited as of `atMs`: every object listed, page by page, and
 * counted and weighed with the others of its prefix and verdict.
 */
export const auditBucket = async (
  env: Env,
  atMs: number
): Promise<BucketAudit> => {
  const refs = await referencesIn(env);
  const since = atMs - AUDIT_GRACE_MS;
  const rows = new Map<string, AuditRow>();
  for await (const page of listed(env.PHOTOS, {})) {
    for (const object of page.objects) {
      const { prefix, verdict } = judgeObject(object, refs, since);
      const id = `${prefix}\n${verdict}`;
      const row = rows.get(id) ?? {
        bytes: 0,
        count: 0,
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
    }
  }
  const order = (row: AuditRow) =>
    PREFIXES.indexOf(row.prefix) * VERDICTS.length +
    VERDICTS.indexOf(row.verdict);
  return {
    atMs,
    graceMs: AUDIT_GRACE_MS,
    groups: refs.groups.size,
    rows: [...rows.values()].toSorted((a, b) => order(a) - order(b)),
    users: refs.usualPhotos.size,
  };
};
