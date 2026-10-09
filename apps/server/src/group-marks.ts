import { Code, ConnectError } from "@connectrpc/connect";
import { markColors } from "@pochical/design/colors";
import { textLimits } from "@pochical/design/limits";
import { markIconGlyphs } from "@pochical/design/mark-icons";

import type { GroupMark } from "./gen/pochical/v1/marks_pb";
import { characterCount, isEmoji } from "./text-limits";

/**
 * A group's mark as the server keeps and sends it (proto GroupMark): one
 * of emoji, icon and letter set, the color for the last two.
 */
export type MarkValue = {
  emoji: string;
  icon: string;
  letter: string;
  color: number;
};

// "letter" draws a pattern's letter in a circle; a group's letters are a
// mark of their own.
const isMarkIcon = (name: string): boolean =>
  name !== "letter" && Object.hasOwn(markIconGlyphs, name);

/**
 * A mark as a call gave it, checked: exactly one of one emoji, a mark
 * icon's name and up to groupMark letters, in a color of the palette.
 * INVALID_ARGUMENT otherwise.
 */
export const requireMark = (mark: GroupMark | undefined): MarkValue => {
  const { emoji = "", icon = "", letter = "", color = 0 } = mark ?? {};
  const given = [emoji, icon, letter].filter((part) => part !== "").length;
  const fits =
    given === 1 &&
    (emoji === "" || isEmoji(emoji)) &&
    (icon === "" || isMarkIcon(icon)) &&
    (letter === "" ||
      (letter.trim() !== "" &&
        characterCount(letter) <= textLimits.groupMark)) &&
    color < markColors.length;
  if (!fits) {
    throw new ConnectError(
      "mark must be one emoji, mark icon or up to groupMark letters, in a palette color",
      Code.InvalidArgument
    );
  }
  return { color: emoji === "" ? color : 0, emoji, icon, letter };
};

/** A mark as a row's columns keep it. */
export const markColumns = ({ emoji, icon, letter, color }: MarkValue) => ({
  color,
  emoji: emoji === "" ? null : emoji,
  icon: icon === "" ? null : icon,
  letter: letter === "" ? null : letter,
});

/** A mark from a row's columns. */
export const markOfRow = (row: {
  emoji: string | null;
  icon: string | null;
  letter: string | null;
  color: number;
}): MarkValue => ({
  color: row.color,
  emoji: row.emoji ?? "",
  icon: row.icon ?? "",
  letter: row.letter ?? "",
});
