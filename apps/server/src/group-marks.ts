import { Code, ConnectError } from "@connectrpc/connect";
import { fitsGroupMark } from "@pochical/design/values";
import type { GroupMarkParts } from "@pochical/design/values";

import type { GroupMark } from "./gen/pochical/v1/marks_pb";
import { hasPersonPhoto, sharePersonPhoto } from "./photos";

/**
 * A group's mark as the server keeps and sends it (proto GroupMark): one
 * of emoji, icon, letter and photo set, the color for icon and letter.
 */
export type MarkValue = GroupMarkParts;

const invalidMark = (): ConnectError =>
  new ConnectError(
    "mark must be one emoji, mark icon, up to groupMark letters in a palette color, or a photo of the caller's",
    Code.InvalidArgument
  );

/**
 * A mark as a call gave it, checked (spec/vectors/fits.json, groupMark):
 * exactly one of one emoji, a mark icon's name, up to groupMark letters,
 * the last two in a color of the palette, and a photo's id.
 * INVALID_ARGUMENT otherwise.
 */
export const requireMark = (mark: GroupMark | undefined): MarkValue => {
  const {
    emoji = "",
    icon = "",
    letter = "",
    color = 0,
    photoId = "",
  } = mark ?? {};
  const given = { color, emoji, icon, letter, photoId };
  if (!fitsGroupMark(given)) {
    throw invalidMark();
  }
  const colored = icon !== "" || letter !== "";
  return { ...given, color: colored ? color : 0 };
};

/**
 * A photo mark into the group's photos before the group shows it: a new
 * one must be one of the caller's own photos (an upload, which the
 * bucket lets go of after its day, or their usual photo), which the group
 * takes a copy of; the group's photo already (`current`) stays as it is.
 * INVALID_ARGUMENT when the caller has no such photo, looked for first
 * and again by the copy, as the bucket's delete may take it between.
 */
export const shareMarkPhoto = async (
  env: Env,
  userId: string,
  mark: MarkValue,
  groupId: string,
  current = ""
): Promise<void> => {
  const { photoId } = mark;
  if (photoId === "" || photoId === current) {
    return;
  }
  if (
    !(
      (await hasPersonPhoto(env, userId, photoId)) &&
      (await sharePersonPhoto(env, userId, photoId, groupId))
    )
  ) {
    throw invalidMark();
  }
};

/** A mark as a row's columns keep it. */
export const markColumns = ({
  emoji,
  icon,
  letter,
  color,
  photoId,
}: MarkValue) => ({
  color,
  emoji: emoji === "" ? null : emoji,
  icon: icon === "" ? null : icon,
  letter: letter === "" ? null : letter,
  photo: photoId === "" ? null : photoId,
});

/** A mark from a row's columns. */
export const markOfRow = (row: {
  emoji: string | null;
  icon: string | null;
  letter: string | null;
  color: number;
  photo: string | null;
}): MarkValue => ({
  color: row.color,
  emoji: row.emoji ?? "",
  icon: row.icon ?? "",
  letter: row.letter ?? "",
  photoId: row.photo ?? "",
});

/** Whether two marks are the same mark, as every member sees it. */
export const sameMark = (a: MarkValue | undefined, b: MarkValue): boolean =>
  a !== undefined &&
  a.color === b.color &&
  a.emoji === b.emoji &&
  a.icon === b.icon &&
  a.letter === b.letter &&
  a.photoId === b.photoId;
