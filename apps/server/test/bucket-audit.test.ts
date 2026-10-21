import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUDIT_GRACE_MS } from "../src/bucket-audit";
import type { BucketAudit } from "../src/bucket-audit";
import { chatLines } from "../src/group-do-schema";
import { personPhotoKey, photoKey } from "../src/photos";
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

const upload = async (path: string, token: string): Promise<void> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  expect(put.status).toBe(204);
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
    value: { photos: [{ height: 10, id, width: 10 }], threadId: "group" },
  },
  opId: crypto.randomUUID(),
});

describe("the photos bucket's audit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports what nothing names, by prefix and why, and nothing it names", async () => {
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
      spare: crypto.randomUUID(),
      stray: crypto.randomUUID(),
      taken: crypto.randomUUID(),
      usual: crypto.randomUUID(),
      waiting: crypto.randomUUID(),
    };
    for (const id of [ids.kept, ids.lost]) {
      // oxlint-disable-next-line no-await-in-loop -- one upload at a time
      await upload(`${photosPath}/${id}`, maker);
      // oxlint-disable-next-line no-await-in-loop -- as above
      await upload(`${photosPath}/${id}?size=small`, maker);
    }
    await upload(`${photosPath}/${ids.taken}`, maker);
    await upload(`${photosPath}/${ids.waiting}`, maker);
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
              value: { text: "見て", threadId: "group" },
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
    const linked = crypto.randomUUID();
    await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
      const db = drizzle(state.storage);
      // The line 0035 left without its photo, as 0036 took it back.
      db.update(chatLines)
        .set({ photos: null, unsent: true })
        .where(eq(chatLines.seq, 4))
        .run();
      db.update(chatLines)
        .set({
          preview: {
            imageHeight: 1,
            imageId: linked,
            imageWidth: 1,
            site: "example.com",
            title: "Example",
            url: "https://example.com",
          },
        })
        .where(eq(chatLines.seq, 5))
        .run();
    });

    await upload(`/v1/me/photos/${ids.usual}`, maker);
    await upload(`/v1/me/photos/${ids.spare}`, maker);
    await call(
      "UserService/SetProfile",
      { name: "さくら", photoId: ids.usual },
      maker
    );
    await push(makerId);

    const goneGroup = photoKey(crypto.randomUUID(), crypto.randomUUID());
    const goneUser = personPhotoKey(crypto.randomUUID(), crypto.randomUUID());
    // Under a group, but no photo the server stored: its DO is not asked.
    const foreign = `groups/${crypto.randomUUID()}/notes`;
    const page = `previews/pages/${"0".repeat(64)}.json`;
    const leftovers = [
      // Taken back, its line's deletion missed.
      photoKey(groupId, ids.taken),
      photoKey(groupId, ids.stray),
      `groups/${groupId}/notes`,
      foreign,
      "groups/loose",
      goneGroup,
      goneUser,
      `previews/images/${linked}`,
      `previews/images/${ids.stray}`,
      page,
      "misc/thing",
    ];
    await Promise.all(
      leftovers.map(async (key) => {
        await env.PHOTOS.put(key, JPEG);
      })
    );

    const admin = exports.AdminEntrypoint;
    // Just stored, each might still come to be named: none is judged but
    // the keys the server never writes.
    const now = await admin.bucketAudit();
    expect(new Set(now.rows.map(({ verdict }) => verdict))).toStrictEqual(
      new Set(["recent", "unknown"])
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + AUDIT_GRACE_MS + 60_000);
    const later = await admin.bucketAudit();
    const group = (id: string) => photoKey(groupId, id);
    expect(rowsOf(later)).toStrictEqual({
      " unknown": keysOf("misc/thing"),
      "groups/ groupGone": keysOf(goneGroup),
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
        foreign,
        "groups/loose"
      ),
      "groups/ unnoted": keysOf(group(ids.stray)),
      "people/ notUsual": keysOf(personPhotoKey(makerId, ids.spare)),
      "people/ referenced": keysOf(personPhotoKey(makerId, ids.usual)),
      "people/ userGone": keysOf(goneUser),
      "previews/images/ referenced": keysOf(`previews/images/${linked}`),
      "previews/images/ unlinked": keysOf(`previews/images/${ids.stray}`),
      "previews/pages/ expired": keysOf(page),
    });
    expect([later.groupsAsked, later.usersAsked, later.orphans]).toStrictEqual([
      2,
      1,
      { bytes: 13 * JPEG.byteLength, count: 13 },
    ]);
    // Asked again, the same.
    await expect(admin.bucketAudit()).resolves.toMatchObject({
      rows: later.rows,
    });
  });
});
