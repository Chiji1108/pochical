// Which of a group's photos are whose, and what holds each
// (group-do-schema.ts, groupPhotos): every one is noted here before it is
// stored, and stored only if no photo has its id yet (photos.ts), so an
// upload can never take or change a photo the group already has.
import { and, eq, inArray, isNull, lte, min } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { groupPhotos, members, profile } from "./group-do-schema";

/**
 * What an upload of a photo to the group may do: store it (`noted`, a new
 * id, or the uploader's own not sent yet, which keeps the one stored);
 * nothing as the uploader's line carries it already (`sent`); nothing as
 * it is someone else's or one the group shows (`refused`).
 */
export type PhotoNote = "noted" | "sent" | "refused";

/**
 * Notes a member's upload of a photo, so they alone may send it as a line.
 * An upload keeps all their photos not sent from going a while longer
 * (`unsentPhotos`).
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
 * photo (their usual one, or a group mark they picked), shown from then
 * on; false when the id is an upload's, which then stays as it is.
 */
export const noteSharedPhoto = (
  db: DrizzleSqliteDODatabase,
  photoId: string,
  userId: string
): boolean => {
  const noted = db
    .select({ state: groupPhotos.state })
    .from(groupPhotos)
    .where(eq(groupPhotos.id, photoId))
    .get();
  if (noted !== undefined) {
    return noted.state === "shown";
  }
  db.insert(groupPhotos).values({ id: photoId, state: "shown", userId }).run();
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
  const named = new Set<string | null>([
    db.select({ photo: profile.photo }).from(profile).get()?.photo ?? null,
    ...db
      .select({ ownPhoto: members.ownPhoto, usualPhoto: members.usualPhoto })
      .from(members)
      .where(isNull(members.leftAt))
      .all()
      .flatMap(({ ownPhoto, usualPhoto }) => [ownPhoto, usualPhoto]),
  ]);
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

const unsentBy = (before: Date) =>
  and(eq(groupPhotos.state, "unsent"), lte(groupPhotos.uploadedAt, before));

/** The photos not sent whose uploader last uploaded by `before`. */
export const unsentPhotos = (
  db: DrizzleSqliteDODatabase,
  before: Date
): string[] =>
  db
    .select({ id: groupPhotos.id })
    .from(groupPhotos)
    .where(unsentBy(before))
    .all()
    .map(({ id }) => id);

/**
 * Forgets the photos `unsentPhotos` gave for `before`, but those uploaded
 * again or sent since.
 */
export const forgetUnsentPhotos = (
  db: DrizzleSqliteDODatabase,
  before: Date
): void => {
  db.delete(groupPhotos).where(unsentBy(before)).run();
};

/** When the photos not sent were last uploaded, the earliest; none without any. */
export const oldestUnsentPhoto = (
  db: DrizzleSqliteDODatabase
): Date | undefined =>
  db
    .select({ at: min(groupPhotos.uploadedAt) })
    .from(groupPhotos)
    .where(eq(groupPhotos.state, "unsent"))
    .get()?.at ?? undefined;
