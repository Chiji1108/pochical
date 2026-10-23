import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUDIT_GRACE_MS } from "../src/bucket-audit";
import type { BucketAudit } from "../src/bucket-audit";
import { chatLines, groupPhotos } from "../src/group-do-schema";
import {
  deletePhotosUnder,
  personPhotoKey,
  photoKey,
  sharePersonPhoto,
  uploadedPhotoKey,
} from "../src/photos";
import { call, ORIGIN } from "./helpers";
import {
  PAIR_ROSTER,
  pair,
  push,
  sendFrame,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const upload = async (path: string, token: string): Promise<number> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  return put.status;
};

/** Each row as `prefix verdict`, with its count and its keys sorted. */
const rowsOf = (audit: BucketAudit) =>
  Object.fromEntries(
    audit.rows.map((row) => [
      `${row.prefix} ${row.verdict}`,
      { bytes: row.bytes, count: row.count, keys: row.sample.toSorted() },
    ])
  );

const keysOf = (...keys: string[]) => ({
  bytes: keys.length * JPEG.byteLength,
  count: keys.length,
  keys: keys.toSorted(),
});

const photoLine = (id: string) => ({
  kind: {
    case: "send" as const,
    value: {
      content: {
        kind: {
          case: "photos" as const,
          value: { photos: [{ height: 10, id, width: 10 }] },
        },
      },
      threadId: "group",
    },
  },
  opId: crypto.randomUUID(),
});

/**
 * A group and its maker's account with an object of every verdict: the
 * group's photos on lines, one taken back, one 0035 left on no line, one
 * uploaded and not sent, two stored with no note; the maker's usual photo,
 * their uploads, and a spare; a group and a user gone; preview pictures
 * named and not; an expired page; and keys the server never writes.
 */
const seedBucket = async () => {
  const { groupId, maker, makerId } = await pair();
  const mine = await syncSocket(
    `/v1/groups/${groupId}/socket`,
    maker,
    PAIR_ROSTER
  );
  const photosPath = `/v1/groups/${groupId}/photos`;
  const ids = {
    kept: crypto.randomUUID(),
    lost: crypto.randomUUID(),
    raced: crypto.randomUUID(),
    spare: crypto.randomUUID(),
    stray: crypto.randomUUID(),
    taken: crypto.randomUUID(),
    usual: crypto.randomUUID(),
    waiting: crypto.randomUUID(),
  };
  for (const id of [ids.kept, ids.lost]) {
    // oxlint-disable-next-line no-await-in-loop -- one upload at a time
    await expect(upload(`${photosPath}/${id}`, maker)).resolves.toBe(204);
    // oxlint-disable-next-line no-await-in-loop -- as above
    await expect(upload(`${photosPath}/${id}?size=small`, maker)).resolves.toBe(
      204
    );
  }
  await expect(upload(`${photosPath}/${ids.taken}`, maker)).resolves.toBe(204);
  await expect(upload(`${photosPath}/${ids.waiting}`, maker)).resolves.toBe(
    204
  );
  // pair()'s notice is at seq 1: the photos' lines at 2, 3 and 4, and
  // words at 5.
  sendFrame(mine.socket, {
    case: "chatEdits",
    value: {
      edits: [
        photoLine(ids.kept),
        photoLine(ids.taken),
        photoLine(ids.lost),
        {
          kind: {
            case: "send",
            value: {
              content: { kind: { case: "words", value: { text: "見て" } } },
              threadId: "group",
            },
          },
          opId: crypto.randomUUID(),
        },
      ],
    },
  });
  await untilAcked(mine.frames);
  sendFrame(mine.socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: { case: "unsend", value: { seq: 3n, threadId: "group" } },
          opId: crypto.randomUUID(),
        },
      ],
    },
  });
  await untilAcked(mine.frames);
  // The sweep deletes the photo taken back, and notes it so.
  await runDurableObjectAlarm(env.GROUPS.getByName(groupId));
  const linked = crypto.randomUUID();
  await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
    const db = drizzle(state.storage);
    // The line 0035 left without its photo, as 0036 took it back.
    db.update(chatLines)
      .set({ content: { kind: "unsent" } })
      .where(eq(chatLines.seq, 4))
      .run();
    db.update(chatLines)
      .set({
        content: {
          edited: false,
          kind: "words",
          preview: {
            imageHeight: 1,
            imageId: linked,
            imageWidth: 1,
            site: "example.com",
            title: "Example",
            url: "https://example.com",
          },
          text: "見て",
        },
      })
      .where(eq(chatLines.seq, 5))
      .run();
  });

  await expect(upload(`/v1/me/photos/${ids.usual}`, maker)).resolves.toBe(204);
  await expect(upload(`/v1/me/photos/${ids.spare}`, maker)).resolves.toBe(204);
  await call(
    "UserService/SetProfile",
    { name: "さくら", photoId: ids.usual },
    maker
  );
  await push(makerId);

  const keys = {
    foreign: `groups/${crypto.randomUUID()}/notes`,
    goneGroup: photoKey(crypto.randomUUID(), crypto.randomUUID()),
    goneUser: personPhotoKey(crypto.randomUUID(), crypto.randomUUID()),
    page: `previews/pages/${"0".repeat(64)}.json`,
  };
  await Promise.all(
    [
      // Taken back, as its line's deletion missed before the sweep did it.
      photoKey(groupId, ids.taken),
      // Spare, as SetProfile left one before uploads were kept apart.
      personPhotoKey(makerId, ids.spare),
      photoKey(groupId, ids.stray),
      photoKey(groupId, ids.raced),
      `groups/${groupId}/notes`,
      // Under a group, but no photo the server stored: its DO is not asked.
      keys.foreign,
      "groups/loose",
      keys.goneGroup,
      keys.goneUser,
      `previews/images/${linked}`,
      `previews/images/${ids.stray}`,
      keys.page,
      "misc/thing",
    ].map(async (key) => {
      await env.PHOTOS.put(key, JPEG);
    })
  );
  return { groupId, ids, keys, linked, maker, makerId, photosPath };
};

/** Past the grace, as of the objects just stored. */
const afterGrace = () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + AUDIT_GRACE_MS + 60_000);
};

/** Each row of a delete as `verdict`, with what became of its objects. */
const outcomes = (deleted: number, skipped = 0, failed = 0) => ({
  deleted: { bytes: deleted * JPEG.byteLength, count: deleted },
  failed: { bytes: failed * JPEG.byteLength, count: failed },
  skipped: { bytes: skipped * JPEG.byteLength, count: skipped },
});

describe("the photos bucket's audit", () => {
  // The bucket is the file's: each test audits it whole.
  beforeEach(async () => {
    await deletePhotosUnder(env, "");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports what nothing names, by prefix and why, and nothing it names", async () => {
    const { groupId, ids, keys, linked, makerId } = await seedBucket();
    const admin = exports.AdminEntrypoint;
    // Just stored, each might still come to be named: none is judged but
    // the keys the server never writes.
    const now = await admin.bucketAudit();
    expect(new Set(now.rows.map(({ verdict }) => verdict))).toStrictEqual(
      new Set(["recent", "unknown"])
    );

    afterGrace();
    const later = await admin.bucketAudit();
    const group = (id: string) => photoKey(groupId, id);
    expect(rowsOf(later)).toStrictEqual({
      " unknown": keysOf("misc/thing"),
      "groups/ groupGone": keysOf(keys.goneGroup),
      "groups/ referenced": keysOf(
        group(ids.kept),
        `${group(ids.kept)}/small`,
        group(ids.waiting),
        // The usual photo's copy, its face in the group.
        group(ids.usual)
      ),
      "groups/ sentUnnamed": keysOf(
        group(ids.lost),
        `${group(ids.lost)}/small`
      ),
      "groups/ takenBack": keysOf(group(ids.taken)),
      "groups/ unknown": keysOf(
        `groups/${groupId}/notes`,
        keys.foreign,
        "groups/loose"
      ),
      "groups/ unnoted": keysOf(group(ids.stray), group(ids.raced)),
      "people/ notUsual": keysOf(personPhotoKey(makerId, ids.spare)),
      "people/ referenced": keysOf(personPhotoKey(makerId, ids.usual)),
      "people/ userGone": keysOf(keys.goneUser),
      "previews/images/ referenced": keysOf(`previews/images/${linked}`),
      "previews/images/ unlinked": keysOf(`previews/images/${ids.stray}`),
      "previews/pages/ expired": keysOf(keys.page),
      // Past their day, which the bucket's lifecycle rule did not take.
      "uploads/people/ unclaimed": keysOf(
        uploadedPhotoKey(makerId, ids.usual),
        uploadedPhotoKey(makerId, ids.spare)
      ),
    });
    expect([later.groupsAsked, later.usersAsked, later.orphans]).toStrictEqual([
      2,
      1,
      { bytes: 16 * JPEG.byteLength, count: 16 },
    ]);
    // Asked again, the same.
    await expect(admin.bucketAudit()).resolves.toMatchObject({
      rows: later.rows,
    });
  });

  it("deletes what nothing names, never what is named or new, and nothing more run again", async () => {
    await seedBucket();
    const admin = exports.AdminEntrypoint;
    // Just stored: nothing is deleted.
    await expect(
      admin.cleanBucket(Date.now(), "staff@pochical.app")
    ).resolves.toMatchObject({
      rows: [],
    });

    afterGrace();
    const audited = await admin.bucketAudit();
    const cleanup = await admin.cleanBucket(Date.now(), "staff@pochical.app");
    expect(
      Object.fromEntries(
        cleanup.rows.map(({ verdict, ...rest }) => [verdict, rest])
      )
    ).toStrictEqual({
      expired: outcomes(1),
      groupGone: outcomes(1),
      notUsual: outcomes(1),
      sentUnnamed: outcomes(2),
      takenBack: outcomes(1),
      unclaimed: outcomes(2),
      unlinked: outcomes(1),
      unnoted: outcomes(2),
      userGone: outcomes(1),
    });

    const after = await admin.bucketAudit();
    expect(after.rows.filter(({ orphan }) => orphan)).toStrictEqual(
      audited.rows.filter(({ verdict }) => verdict === "unknown")
    );
    expect(
      after.rows.filter(({ verdict }) => verdict === "referenced")
    ).toStrictEqual(
      audited.rows.filter(({ verdict }) => verdict === "referenced")
    );
    await expect(
      admin.cleanBucket(Date.now(), "staff@pochical.app")
    ).resolves.toMatchObject({
      rows: [],
    });
  });

  it("leaves the group's notes saying what the bucket holds", async () => {
    const { groupId, ids, maker, photosPath } = await seedBucket();
    afterGrace();
    await exports.AdminEntrypoint.cleanBucket(Date.now(), "staff@pochical.app");
    // The sweep the delete set notes it taken back, once R2 has none.
    await runDurableObjectAlarm(env.GROUPS.getByName(groupId));

    // The photo no line carried is taken back, so its id is never stored
    // again.
    await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
      const notes = Object.fromEntries(
        drizzle(state.storage)
          .select()
          .from(groupPhotos)
          .all()
          .map(({ id, state: held }) => [id, held])
      );
      expect(notes).toMatchObject({
        [ids.kept]: "sent",
        [ids.lost]: "takenBack",
        [ids.taken]: "takenBack",
      });
      // One stored with no note, and the upload not sent, which that
      // sweep took as past its time too.
      expect([notes[ids.stray], notes[ids.waiting]]).toStrictEqual([
        undefined,
        undefined,
      ]);
    });
    await expect(upload(`${photosPath}/${ids.lost}`, maker)).resolves.toBe(409);
    await expect(
      env.PHOTOS.head(photoKey(groupId, ids.lost))
    ).resolves.toBeNull();
  });

  it("skips what its owner finds named since the audit", async () => {
    const { groupId, ids, maker, makerId, photosPath } = await seedBucket();
    afterGrace();
    // An upload of an id the audit found unnoted, before the delete
    // reaches its group: the group notes it, and the bytes stored stay.
    const raced = photoKey(groupId, ids.raced);
    await expect(upload(`${photosPath}/${ids.raced}`, maker)).resolves.toBe(
      204
    );
    await expect(
      env.GROUPS.getByName(groupId).deleteOrphanPhotos([
        { bytes: JPEG.byteLength, key: raced, verdict: "unnoted" },
      ])
    ).resolves.toStrictEqual({
      deleted: [],
      failed: [],
      skipped: [{ bytes: JPEG.byteLength, key: raced, verdict: "unnoted" }],
    });
    // The usual photo, should an audit before it was set have found it
    // spare.
    const usual = personPhotoKey(makerId, ids.usual);
    await expect(
      env.USERS.getByName(makerId).deleteOrphanPhotos([
        { bytes: JPEG.byteLength, key: usual, verdict: "notUsual" },
      ])
    ).resolves.toMatchObject({ deleted: [], skipped: [{ key: usual }] });
    await expect(
      Promise.all([env.PHOTOS.head(raced), env.PHOTOS.head(usual)])
    ).resolves.not.toContain(null);
  });
});

/**
 * An upload of the maker's own photo, deleted as the bucket's lifecycle
 * rule deletes one past its day.
 */
const deletedSpare = async () => {
  const { groupId, maker, makerId } = await pair();
  const photoId = crypto.randomUUID();
  await expect(upload(`/v1/me/photos/${photoId}`, maker)).resolves.toBe(204);
  await env.PHOTOS.delete(uploadedPhotoKey(makerId, photoId));
  return { groupId, maker, makerId, photoId };
};

describe("what comes to name a photo as the delete takes it", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never sets as the usual photo one the delete took", async () => {
    const { maker, makerId, photoId } = await deletedSpare();
    const user = env.USERS.getByName(makerId);
    // Reached after a look that still found it, the user's DO looks again.
    await expect(user.setProfile("さくら", photoId)).resolves.toBeFalsy();
    const set = await call(
      "UserService/SetProfile",
      { name: "さくら", photoId },
      maker
    );
    expect(set.status).toBe(400);
    await expect(user.profileOf()).resolves.toMatchObject({ photoId: "" });
  });

  it("never makes a group's mark of one the delete took", async () => {
    const { groupId, maker, makerId, photoId } = await deletedSpare();
    // Reached after a look that still found it, the copy finds none.
    expect({
      shared: await sharePersonPhoto(env, makerId, photoId, groupId),
    }).toStrictEqual({ shared: false });
    const renamed = await call(
      "GroupService/RenameGroup",
      { groupId, mark: { photoId }, name: "いとこ会" },
      maker
    );
    expect(renamed.status).toBe(400);
    const profile = await env.GROUPS.getByName(groupId).getProfile();
    expect(profile?.mark.photoId).toBe("");
  });

  it("deletes as of the audit read, not what passed the grace since", async () => {
    const readAt = Date.now();
    await seedBucket();
    afterGrace();
    await expect(
      exports.AdminEntrypoint.cleanBucket(readAt, "staff@pochical.app")
    ).resolves.toMatchObject({ rows: [] });
  });
});
