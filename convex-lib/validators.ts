import { ConvexError } from "convex/values";

const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_GROUP_EMOJI_LENGTH = 16;
const MAX_GROUP_NAME_LENGTH = 80;

export const normalizeRequiredText = (
  value: string,
  label: string,
  maxLength: number
) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new ConvexError(`${label} is required`);
  }

  if (trimmedValue.length > maxLength) {
    throw new ConvexError(`${label} is too long`);
  }

  return trimmedValue;
};

export const normalizeDisplayName = (displayName: string) =>
  normalizeRequiredText(displayName, "Display name", MAX_DISPLAY_NAME_LENGTH);

export const normalizeGroupEmoji = (emoji: string) =>
  normalizeRequiredText(emoji, "Group emoji", MAX_GROUP_EMOJI_LENGTH);

export const normalizeGroupName = (name: string) =>
  normalizeRequiredText(name, "Group name", MAX_GROUP_NAME_LENGTH);
