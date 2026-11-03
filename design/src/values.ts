// What the server takes of each value the apps edit (spec/vectors/fits.json),
// so an app checks the same before it saves and a value it keeps stays once
// sent. The server holds every edit to these; the web prototype checks
// with them too, and iOS's and Android's kits follow the same vectors.
import { markColors } from "./colors";
import { syncLimits, textLimits } from "./limits";
import { markIconGlyphs } from "./mark-icons";
import { fitsText, isEmoji, withinLimit } from "./text";

// The ids the apps make (patterns, coworkers, devices) and the icon names
// they use: kept short, and without spaces, since a day's people are
// coworker ids separated by spaces (spec/sync-protocol.md, Coworkers).
const SPACE = /\s/u;

/** Whether the text can be an id: 1 to syncLimits.idLength, no spaces. */
export const isId = (text: string): boolean =>
  text !== "" && text.length <= syncLimits.idLength && !SPACE.test(text);

/** Whether a list is ids, each once, and at most `max` of them when given. */
export const isIdList = (
  ids: readonly string[],
  max = Number.POSITIVE_INFINITY
): boolean =>
  ids.length <= max &&
  new Set(ids).size === ids.length &&
  ids.every((id) => isId(id));

/** A day's memo: up to textLimits.dayNote characters, spaces and all. */
export const fitsDayNote = (note: string): boolean =>
  withinLimit(note, textLimits.dayNote);

/** A day's people: coworker ids, each once, and syncLimits.peopleADay at most. */
export const fitsDayPeople = (ids: readonly string[]): boolean =>
  ids.length > 0 && isIdList(ids, syncLimits.peopleADay);

/** A coworker's name: 1 to textLimits.personName characters, not only spaces. */
export const fitsCoworkerName = (name: string): boolean =>
  fitsText(name, textLimits.personName);

/**
 * A person's name as their profile or a group shows it, trimmed: up to
 * textLimits.personName characters; empty is no name of their own (a
 * group's then the usual one).
 */
export const fitsPersonName = (name: string): boolean =>
  withinLimit(name.trim(), textLimits.personName);

/** A group's name: 1 to textLimits.groupName characters, not only spaces. */
export const fitsGroupName = (name: string): boolean =>
  fitsText(name, textLimits.groupName);

/**
 * A group's mark as the wire carries it (proto GroupMark), each part ""
 * when not set.
 */
export type GroupMarkParts = {
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

/**
 * A group's mark: exactly one of one emoji, a mark icon's name, 1 to
 * textLimits.groupMark letters, not only spaces, and a photo's id, with a
 * color of the palette.
 */
export const fitsGroupMark = ({
  emoji,
  icon,
  letter,
  color,
  photoId,
}: GroupMarkParts): boolean =>
  [emoji, icon, letter, photoId].filter((part) => part !== "").length === 1 &&
  (emoji === "" || isEmoji(emoji)) &&
  (icon === "" || isMarkIcon(icon)) &&
  (letter === "" || fitsText(letter, textLimits.groupMark)) &&
  (photoId === "" || isId(photoId)) &&
  Number.isInteger(color) &&
  color >= 0 &&
  color < markColors.length;
