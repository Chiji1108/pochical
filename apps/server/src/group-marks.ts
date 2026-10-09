import { Code, ConnectError } from "@connectrpc/connect";
import { markColors } from "@pochical/design/colors";
import { textLimits } from "@pochical/design/limits";
import { markIconGlyphs } from "@pochical/design/mark-icons";

import type { GroupMark } from "./gen/pochical/v1/marks_pb";
import { isId } from "./ids";
import { hasPersonPhoto, sharePersonPhoto } from "./photos";
import { characterCount, isEmoji } from "./text-limits";

/**
 * A group's mark as the server keeps and sends it (proto GroupMark): one
 * of emoji, icon, letter and photo set, the color for icon and letter.
 */
export type MarkValue = {
  emoji: string;
  icon: string;
  letter: string;
  color: number;
  photoId: string;
};

// "letter" draws a pattern's letter in a circle; a group's letters are a
// mark of their own.
const isMarkIcon = (name: string): boolean =>
  name !== "letter" && Object.hasOwn(markIconGlyphs, name);

const invalidMark = (): ConnectError =>
  new ConnectError(
    "mark must be one emoji, mark icon, up to groupMark letters in a palette color, or a photo of the caller's",
    Code.InvalidArgument
  );

/**
 * A mark as a call gave it, checked: exactly one of one emoji, a mark
 * icon's name, up to groupMark letters, the last two in a color of the
 * palette, and a photo's id. INVALID_ARGUMENT otherwise.
 */
export const requireMark = (mark: GroupMark | undefined): MarkValue => {
  const {
    emoji = "",
    icon = "",
    letter = "",
    color = 0,
    photoId = "",
  } = mark ?? {};
  const given = [emoji, icon, letter, photoId].filter(
    (part) => part !== ""
  ).length;
  const fits =
    given === 1 &&
    (emoji === "" || isEmoji(emoji)) &&
    (icon === "" || isMarkIcon(icon)) &&
    (letter === "" ||
      (letter.trim() !== "" &&
        characterCount(letter) <= textLimits.groupMark)) &&
    (photoId === "" || isId(photoId)) &&
    color < markColors.length;
  if (!fits) {
    throw invalidMark();
  }
  const colored = icon !== "" || letter !== "";
  return { color: colored ? color : 0, emoji, icon, letter, photoId };
};

/**
 * A photo mark into the group's photos before the group shows it: a new
 * one must be one of the caller's own photos, which the group takes a
 * copy of; the group's photo already (`current`) stays as it is.
 * INVALID_ARGUMENT when the caller has no such photo.
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
  if (!(await hasPersonPhoto(env, userId, photoId))) {
    throw invalidMark();
  }
  await sharePersonPhoto(env, userId, photoId, groupId);
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
