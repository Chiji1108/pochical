import { makeFunctionReference } from "convex/server";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

import type { api as mobileApi } from "../../../mobile-legacy/convex/_generated/api";

// Reuse the backend's generated types without importing the Expo project at runtime.
export const api = {
  accountDeletion: {
    pending: makeFunctionReference<
      "query",
      FunctionArgs<typeof mobileApi.accountDeletion.pending>,
      FunctionReturnType<typeof mobileApi.accountDeletion.pending>
    >("accountDeletion:pending"),
  },
  accounts: {
    current: makeFunctionReference<
      "query",
      FunctionArgs<typeof mobileApi.accounts.current>,
      FunctionReturnType<typeof mobileApi.accounts.current>
    >("accounts:current"),
  },
  deleteAccount: {
    request: makeFunctionReference<
      "action",
      FunctionArgs<typeof mobileApi.deleteAccount.request>,
      FunctionReturnType<typeof mobileApi.deleteAccount.request>
    >("deleteAccount:request"),
  },
};
