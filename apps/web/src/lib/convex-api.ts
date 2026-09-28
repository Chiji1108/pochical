import { makeFunctionReference } from "convex/server";

// The legacy Convex backend's functions this site calls, typed by hand
// after apps/mobile-legacy/convex so the site neither imports nor
// typechecks the reference-only Expo project. Keep them in step with
// accountDeletion.ts, accounts.ts and deleteAccount.ts there.

type CurrentAccount = {
  name: string | null;
  email: string | null;
  deletionPending: boolean;
  canRevokeApple: boolean;
  authUserId: string;
  userId: string;
  isAnonymous: boolean;
  providers: string[];
} | null;

export const api = {
  accountDeletion: {
    pending: makeFunctionReference<"query", { receipt: string }, boolean>(
      "accountDeletion:pending"
    ),
  },
  accounts: {
    current: makeFunctionReference<
      "query",
      Record<string, never>,
      CurrentAccount
    >("accounts:current"),
  },
  deleteAccount: {
    request: makeFunctionReference<
      "action",
      { appleAuthorizationCode?: string },
      string
    >("deleteAccount:request"),
  },
};
