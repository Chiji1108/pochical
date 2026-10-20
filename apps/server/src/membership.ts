/**
 * Whether the user is in the group (spec/sync-protocol.md, Groups): their
 * own DO is asked first, so an id that is not theirs never wakes or
 * creates a Group DO, and then the group, which decides.
 */
export const isMemberOf = async (
  env: Env,
  userId: string,
  groupId: string
): Promise<boolean> =>
  (await env.USERS.getByName(userId).isMember(groupId)) &&
  (await env.GROUPS.getByName(groupId).isMember(userId));
