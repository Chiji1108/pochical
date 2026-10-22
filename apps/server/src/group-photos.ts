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
 * one whose line was taken back (`refused`); nothing yet, as the sweep is
 * deleting the uploader's own from storage, after which the same upload
 * stores it anew (`going`).
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
  if (noted?.state === "deleting" || noted?.state === "reviving") {
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
 * (`markStalePhotos`); one noted again while the sweep deletes it is
 * reviving, and the sweep copies it in anew once storage has deleted it
 * (`revivingPhotos`).
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
  const going = noted?.state === "deleting" || noted?.state === "reviving";
  const kept =
    noted === undefined ||
    noted.state === "shown" ||
    (going && noted.userId === userId);
  if (!kept) {
    return false;
  }
  const now = new Date();
  // Noted again while the sweep deletes it: reviving, for the sweep to
  // copy it in anew once storage has deleted it (`settleSwept`).
  const state = going ? "reviving" : "shown";
  db.insert(groupPhotos)
    .values({ id: photoId, state, uploadedAt: now, userId })
    .onConflictDoUpdate({
      set: { state, uploadedAt: now },
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

/**
 * The copies noted again while the sweep deleted them (`noteSharedPhoto`),
 * and whose they are: for the sweep to delete from storage and copy in
 * anew, as a copy made meanwhile may have found the photo still stored
 * and stored nothing.
 */
export const revivingPhotos = (
  db: DrizzleSqliteDODatabase
): { id: string; userId: string }[] =>
  db
    .select({ id: groupPhotos.id, userId: groupPhotos.userId })
    .from(groupPhotos)
    .where(eq(groupPhotos.state, "reviving"))
    .all();

/**
 * The photos settled once storage has none of `going` and `reviving`,
 * and those of `reviving` are copied in anew: those still going
 * forgotten, those copied in shown again. One that came to revive whose
 * photo the sweep did not delete stays reviving, for the next.
 */
export const settleSwept = (
  db: DrizzleSqliteDODatabase,
  going: string[],
  reviving: string[]
): void => {
  db.delete(groupPhotos)
    .where(
      and(
        eq(groupPhotos.state, "deleting"),
        inArray(groupPhotos.id, idList(going))
      )
    )
    .run();
  db.update(groupPhotos)
    .set({ state: "shown" })
    .where(
      and(
        eq(groupPhotos.state, "reviving"),
        inArray(groupPhotos.id, idList(reviving))
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
 * time while some are to be deleted now (let go, taken back, reviving,
 * or left so by a sweep that stopped part way), so the sweep comes at once;
 * none without any.
 */
export const oldestStalePhoto = (
  db: DrizzleSqliteDODatabase
): Date | undefined => {
  const going = db
    .select({ id: groupPhotos.id })
    .from(groupPhotos)
    .where(inArray(groupPhotos.state, ["deleting", "reviving", "takingBack"]))
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
