// Which of a group's photos are whose, and what holds each
// (group-do-schema.ts, groupPhotos): every one is noted here before it is
// stored, and stored only if no photo has its id yet (photos.ts), so an
// upload can never take or change a photo the group already has.
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  min,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
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
 * (`markStalePhotos`); one noted again while the sweep deletes it is
 * kept, and the sweep copies it in anew once storage has deleted it
 * (`revivedPhotos`).
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
  // Noted again while the sweep deletes it: it stays going, noted since
  // the sweep began, for the sweep to copy it in anew (`settleSwept`).
  db.insert(groupPhotos)
    .values({ id: photoId, state: "shown", uploadedAt: now, userId })
    .onConflictDoUpdate({ set: { uploadedAt: now }, target: groupPhotos.id })
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

/**
 * The shown photos among `photoIds` that nothing names any more, neither
 * the group's mark nor anyone in the group as their usual or own photo,
 * forgotten: their ids, to delete from storage. Call it once the change
 * that let them go is written.
 */
export const forgetUnshown = (
  db: DrizzleSqliteDODatabase,
  photoIds: (string | null)[]
): string[] => {
  const named = new Set(namedPhotos(db));
  const unnamed = photoIds.filter(
    (id): id is string => id !== null && id !== "" && !named.has(id)
  );
  if (unnamed.length === 0) {
    return [];
  }
  return db
    .delete(groupPhotos)
    .where(
      and(inArray(groupPhotos.id, unnamed), eq(groupPhotos.state, "shown"))
    )
    .returning({ id: groupPhotos.id })
    .all()
    .map(({ id }) => id);
};

/** `photoIds` as a list SQL reads from one bound value, as SQLite takes a hundred at most. */
const idList = (photoIds: string[]) =>
  sql`(select value from json_each(${JSON.stringify(photoIds)}))`;

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
 * The copies among `photoIds`, deleted from storage by the sweep that
 * began at `before`, noted again since (`noteSharedPhoto`), and whose
 * they are: for the sweep to copy in anew, as a copy made meanwhile may
 * have found the photo still stored and stored nothing.
 */
export const revivedPhotos = (
  db: DrizzleSqliteDODatabase,
  photoIds: string[],
  before: Date
): { id: string; userId: string }[] =>
  db
    .select({ id: groupPhotos.id, userId: groupPhotos.userId })
    .from(groupPhotos)
    .where(
      and(
        eq(groupPhotos.state, "deleting"),
        gt(groupPhotos.uploadedAt, before),
        inArray(groupPhotos.id, idList(photoIds))
      )
    )
    .all();

/**
 * The photos among `photoIds` settled once storage has none and the
 * revived ones are copied in anew: those noted since `before` shown
 * again, the rest forgotten.
 */
export const settleSwept = (
  db: DrizzleSqliteDODatabase,
  photoIds: string[],
  before: Date
): void => {
  const going = and(
    eq(groupPhotos.state, "deleting"),
    inArray(groupPhotos.id, idList(photoIds))
  );
  db.update(groupPhotos)
    .set({ state: "shown" })
    .where(and(going, gt(groupPhotos.uploadedAt, before)))
    .run();
  db.delete(groupPhotos).where(going).run();
};

/**
 * When the photos nothing holds were noted, the earliest; the start of
 * time while a sweep that stopped part way left some going, so the next
 * comes at once; none without any.
 */
export const oldestStalePhoto = (
  db: DrizzleSqliteDODatabase
): Date | undefined => {
  const going = db
    .select({ id: groupPhotos.id })
    .from(groupPhotos)
    .where(eq(groupPhotos.state, "deleting"))
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
