import type { ShareGroupMember } from "@/schema";

const getDisplayNameScore = (member: ShareGroupMember) => {
  const displayName = member.displayName?.trim();

  if (!displayName) {
    return 0;
  }

  if (displayName === member.user_id) {
    return 1;
  }

  return 2;
};

export const getShareGroupMemberDisplayName = (
  member: ShareGroupMember
): string => member.displayName?.trim() || "名前未設定";

export const dedupeShareGroupMembers = (
  members: readonly ShareGroupMember[]
) => {
  const membersByGroupAndUserId = new Map<string, ShareGroupMember>();

  for (const member of members) {
    const key = `${member.groupId}:${member.user_id}`;
    const currentMember = membersByGroupAndUserId.get(key);

    if (
      !currentMember ||
      getDisplayNameScore(member) > getDisplayNameScore(currentMember)
    ) {
      membersByGroupAndUserId.set(key, member);
    }
  }

  return [...membersByGroupAndUserId.values()];
};
