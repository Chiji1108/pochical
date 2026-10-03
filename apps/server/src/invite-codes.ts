import { Code, ConnectError } from "@connectrpc/connect";
import { INVITE_CODE, inviteRules } from "@pochical/design/invite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { invites } from "./db/schema";

// What a code is made of is design/src/invite.ts, shared with the apps.
const ALPHABET = inviteRules.codeAlphabet;
const CODE_LENGTH = inviteRules.codeLength;
// Two codes clashing is about one in 10^14; three in a row means a bug.
const MAX_ATTEMPTS = 3;

// Bytes past the last whole run of the alphabet are drawn again, so every
// character is equally likely.
const FAIR_BELOW = 256 - (256 % ALPHABET.length);

const newInviteCode = (): string => {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (byte < FAIR_BELOW && code.length < CODE_LENGTH) {
        code += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return code;
};

/** The group a live code opens, or null. */
export const groupOfCode = async (
  d1: D1Database,
  code: string
): Promise<string | null> => {
  const row = await drizzle(d1)
    .select({ groupId: invites.groupId })
    .from(invites)
    .where(eq(invites.code, code))
    .get();
  return row?.groupId ?? null;
};

/** NOT_FOUND for a code no group uses, or whose group is gone. */
export const noGroupOfCode = (): ConnectError =>
  new ConnectError("No group uses this invite code", Code.NotFound);

/** The group a live code opens; INVALID_ARGUMENT or NOT_FOUND otherwise. */
export const requireGroupOfCode = async (
  d1: D1Database,
  inviteCode: string
): Promise<string> => {
  if (!INVITE_CODE.test(inviteCode)) {
    throw new ConnectError("Malformed invite code", Code.InvalidArgument);
  }
  const groupId = await groupOfCode(d1, inviteCode);
  if (groupId === null) {
    throw noGroupOfCode();
  }
  return groupId;
};

/** The group's live code, or null before it has one. */
const codeOfGroup = async (
  d1: D1Database,
  groupId: string
): Promise<string | null> => {
  const row = await drizzle(d1)
    .select({ code: invites.code })
    .from(invites)
    .where(eq(invites.groupId, groupId))
    .get();
  return row?.code ?? null;
};

/** Inserts a newly drawn code with `insert`, and returns the code. */
const insertNewCode = async (
  insert: (code: string) => Promise<unknown>
): Promise<string> => {
  for (let attempt = 1; ; attempt += 1) {
    const code = newInviteCode();
    try {
      // oxlint-disable-next-line no-await-in-loop -- a retry, after a clash
      await insert(code);
      return code;
    } catch (error) {
      // Another group holds the code (the primary key): draw again.
      if (attempt >= MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
};

/**
 * The group's live code, issuing its first when it has none. Calls at once
 * agree on one: each issues only where no code is yet, then reads back
 * the one that is.
 */
export const liveInviteCode = async (
  d1: D1Database,
  groupId: string
): Promise<string> => {
  const live = await codeOfGroup(d1, groupId);
  if (live !== null) {
    return live;
  }
  await insertNewCode(
    async (code) =>
      await drizzle(d1)
        .insert(invites)
        .values({ code, groupId })
        .onConflictDoNothing({ target: invites.groupId })
  );
  return await liveInviteCode(d1, groupId);
};

/**
 * Gives the group a new live code, replacing any it had, so the old link
 * stops working at once.
 */
export const issueInviteCode = async (
  d1: D1Database,
  groupId: string
): Promise<string> =>
  await insertNewCode(
    async (code) =>
      await drizzle(d1)
        .insert(invites)
        .values({ code, groupId })
        .onConflictDoUpdate({ set: { code }, target: invites.groupId })
  );
