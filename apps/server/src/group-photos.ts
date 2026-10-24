// Which of a group's photos are whose, and what holds each
// (group-do-schema.ts, groupPhotos): every one is noted here before it is
// stored, and stored only if no photo has its id yet (photos.ts), so an
// upload can never take or change a photo the group already has. A note
// goes only once R2 has deleted its photo (GroupDO.sweepPhotos), so R2
// never keeps one the group has no note of.
import {
  and,
  eq,
  inArray,
  isNull,
  lte,
  min,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { groupPhotos, members, profile } from "./group-do-schema";

/**
 * What an upload of a photo to the group may do: store it where nothing
 * is stored yet (`noted`: a new id, or the uploader's own not sent yet,
 * whose first bytes stay); nothing, as the uploader's line carries it
 * already (`sent`: a send tried again after its answer was lost uploads
 * it again); nothing, as it is someone else's, one the group shows, or
 * one whose line was taken back (`refused`); nothing yet, as the
 * uploader's own waits to be deleted from storage after a sweep storage
 * refused, after which the same upload stores it anew (`going`).
 */
export type PhotoNote = "noted" | "sent" | "refused" | "going";

/**
 * Notes a member's upload of a photo, so they alone may send it as a line.
 * An upload keeps all their photos not sent from going a while longer
 * (`markStalePhotos`).
 */
export const notePhoto = (
  db: DrizzleSqliteDODatabase,
  photoId: string,
  userId: string
): PhotoNote => {
  const noted = db
    .select()
    .from(groupPhotos)
    .where(eq(groupPhotos.id, photoId))
    .get();
  if (noted !== undefined && noted.userId !== userId) {
    return "refused";
  }
  if (noted?.state === "deleting") {
    return "going";
  }
  if (noted !== undefined && noted.state !== "unsent") {
    return noted.state === "sent" ? "sent" : "refused";
  }
  const now = new Date();
  if (noted === undefined) {
    db.insert(groupPhotos)
      .values({ id: photoId, uploadedAt: now, userId })
      .run();
  }
  db.update(groupPhotos)
    .set({ uploadedAt: now })
    .where(and(eq(groupPhotos.userId, userId), eq(groupPhotos.state, "unsent")))
    .run();
  return "noted";
};

/**
 * Notes a copy the server makes into the group's photos of someone's own
 * photo (their usual one, or a group mark they picked), before the group
 * names it as their face or its mark; false when the id is an upload's,
 * which then stays as it is. One nothing comes to name (a group not made
 * after all, a push that failed) goes as an upload not sent does
 * (`markStalePhotos`); one noted again while marked as going, its
 * sweep having failed at storage, is shown again and copied in anew.
 */
export const noteSharedPhoto = (
  db: DrizzleSqliteDODatabase,
  photoId: string,
  userId: string
): boolean => {
  const noted = db
    .select({ state: groupPhotos.state, userId: groupPhotos.userId })
    .from(groupPhotos)
    .where(eq(groupPhotos.id, photoId))
    .get();
  const kept =
    noted === undefined ||
    noted.state === "shown" ||
    (noted.state === "deleting" && noted.userId === userId);
  if (!kept) {
    return false;
  }
  const now = new Date();
  db.insert(groupPhotos)
    .values({ id: photoId, state: "shown", uploadedAt: now, userId })
    .onConflictDoUpdate({
      set: { state: "shown", uploadedAt: now },
      target: groupPhotos.id,
    })
    .run();
  return true;
};

/**
 * One of the member's own photos in the group shown as their face there:
 * one they uploaded and have not sent, or one shown already. False for
 * any other.
 */
export const showOwnPhoto = (
  db: DrizzleSqliteDODatabase,
  photoId: string,
  userId: string
): boolean =>
  db
    .update(groupPhotos)
    .set({ state: "shown" })
    .where(
      and(
        eq(groupPhotos.id, photoId),
        eq(groupPhotos.userId, userId),
        inArray(groupPhotos.state, ["unsent", "shown"])
      )
    )
    .returning()
    .get() !== undefined;

/** The photos the group names: its mark, and the faces of those in it. */
export const namedPhotos = (db: DrizzleSqliteDODatabase): string[] =>
  [
    db.select({ photo: profile.photo }).from(profile).get()?.photo ?? null,
    ...db
      .select({ ownPhoto: members.ownPhoto, usualPhoto: members.usualPhoto })
      .from(members)
      .where(isNull(members.leftAt))
      .all()
      .flatMap(({ ownPhoto, usualPhoto }) => [ownPhoto, usualPhoto]),
  ].filter((id): id is string => id !== null && id !== "");

/** `photoIds` as a list SQL reads from one bound value, as SQLite takes a hundred at most. */
const idList = (photoIds: string[]) =>
  sql`(select value from json_each(${JSON.stringify(photoIds)}))`;

/** Photos let go at once: marked as going, for the sweep to delete. */
const letGo = (db: DrizzleSqliteDODatabase, which: SQL | undefined) =>
  db
    .update(groupPhotos)
    .set({ state: "deleting" })
    .where(which)
    .returning({ id: groupPhotos.id })
    .all();

/**
 * The shown photos among `photoIds` that nothing names any more, neither
 * the group's mark nor anyone in the group as their usual or own photo,
 * let go, for the sweep to delete from storage: whether any were. Call it
 * once the change that let them go is written, in its transaction.
 */
export const forgetUnshown = (
  db: DrizzleSqliteDODatabase,
  photoIds: (string | null)[]
): boolean => {
  const named = new Set(namedPhotos(db));
  const unnamed = photoIds.filter(
    (id): id is string => id !== null && id !== "" && !named.has(id)
  );
  return (
    unnamed.length > 0 &&
    letGo(
      db,
      and(inArray(groupPhotos.id, unnamed), eq(groupPhotos.state, "shown"))
    ).length > 0
  );
};

/**
 * The uploads among `photoIds` that no line will ever carry (their send
 * recalled before it came) let go, for the sweep to delete from storage
 * at once rather than once their time is up.
 */
export const letGoUnsent = (
  db: DrizzleSqliteDODatabase,
  photoIds: string[]
): void => {
  letGo(
    db,
    and(
      inArray(groupPhotos.id, idList(photoIds)),
      eq(groupPhotos.state, "unsent")
    )
  );
};

/**
 * The sent photos among `photoIds` noted as being taken back, as their
 * line is (or no line carries them, as for the lines Group DO migration
 * 0035 emptied), for the sweep to delete from storage: the note stays, so
 * no upload stores their ids again.
 */
export const takeBack = (
  db: DrizzleSqliteDODatabase,
  photoIds: string[]
): void => {
  db.update(groupPhotos)
    .set({ state: "takingBack" })
    .where(
      and(
        eq(groupPhotos.state, "sent"),
        inArray(groupPhotos.id, idList(photoIds))
      )
    )
    .run();
};

/**
 * The photos nothing holds: uploads not sent, and copies noted as shown
 * that nothing names; noted by `before` when given.
 */
const stale = (db: DrizzleSqliteDODatabase, before?: Date) =>
  and(
    or(
      eq(groupPhotos.state, "unsent"),
      and(
        eq(groupPhotos.state, "shown"),
        notInArray(groupPhotos.id, idList(namedPhotos(db)))
      )
    ),
    before === undefined ? undefined : lte(groupPhotos.uploadedAt, before)
  );

/**
 * Marks as going the photos nothing has held since `before`: uploads
 * whose uploader last uploaded by then, and copies noted by then that
 * nothing names. Their ids, with those of any a sweep marked and did not
 * finish, to delete from storage.
 */
export const markStalePhotos = (
  db: DrizzleSqliteDODatabase,
  before: Date
): string[] =>
  db
    .update(groupPhotos)
    .set({ state: "deleting" })
    .where(or(stale(db, before), eq(groupPhotos.state, "deleting")))
    .returning({ id: groupPhotos.id })
    .all()
    .map(({ id }) => id);

/** The photos in `going` forgotten once storage has none of them. */
export const settleSwept = (
  db: DrizzleSqliteDODatabase,
  going: string[]
): void => {
  db.delete(groupPhotos)
    .where(
      and(
        eq(groupPhotos.state, "deleting"),
        inArray(groupPhotos.id, idList(going))
      )
    )
    .run();
};

/** The photos being taken back, for the sweep to delete from storage. */
export const photosTakingBack = (db: DrizzleSqliteDODatabase): string[] =>
  db
    .select({ id: groupPhotos.id })
    .from(groupPhotos)
    .where(eq(groupPhotos.state, "takingBack"))
    .all()
    .map(({ id }) => id);

/** The photos among `photoIds` noted as taken back, once storage has none. */
export const settleTakenBack = (
  db: DrizzleSqliteDODatabase,
  photoIds: string[]
): void => {
  db.update(groupPhotos)
    .set({ state: "takenBack" })
    .where(
      and(
        eq(groupPhotos.state, "takingBack"),
        inArray(groupPhotos.id, idList(photoIds))
      )
    )
    .run();
};

/**
 * When the photos nothing holds were noted, the earliest; the start of
 * time while some are to be deleted now (let go, taken back, or left so
 * by a sweep that stopped part way), so the sweep comes at once;
 * none without any.
 */
export const oldestStalePhoto = (
  db: DrizzleSqliteDODatabase
): Date | undefined => {
  const going = db
    .select({ id: groupPhotos.id })
    .from(groupPhotos)
    .where(inArray(groupPhotos.state, ["deleting", "takingBack"]))
    .get();
  if (going !== undefined) {
    return new Date(0);
  }
  return (
    db
      .select({ at: min(groupPhotos.uploadedAt) })
      .from(groupPhotos)
      .where(stale(db))
      .get()?.at ?? undefined
  );
};
