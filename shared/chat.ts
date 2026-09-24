export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const CHAT_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "👎",
] as const;

// A single Unicode emoji, including flags, skin tones and joined families.
const REACTION_EMOJI =
  /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)$/u;
export const isReactionEmoji = (value: string): boolean =>
  value.length <= 64 && REACTION_EMOJI.test(value);

export const toggleMessageReaction = (
  reactions: { emoji: string; userIds: string[] }[],
  emoji: string,
  userId: string
): { emoji: string; userIds: string[] }[] => {
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (!existing) {
    return [...reactions, { emoji, userIds: [userId] }];
  }
  const userIds = existing.userIds.includes(userId)
    ? existing.userIds.filter((id) => id !== userId)
    : [...existing.userIds, userId];
  return reactions.flatMap((reaction) => {
    if (reaction.emoji !== emoji) {
      return [reaction];
    }
    return userIds.length > 0 ? [{ emoji, userIds }] : [];
  });
};
