import {
  type FunctionArgs,
  type FunctionReturnType,
  makeFunctionReference,
} from "convex/server";
import type { api as mobileApi } from "../../../mobile/convex/_generated/api";

// Reuse the backend's generated types without importing the Expo project at runtime.
export const api = {
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
  accountDeletion: {
    pending: makeFunctionReference<
      "query",
      FunctionArgs<typeof mobileApi.accountDeletion.pending>,
      FunctionReturnType<typeof mobileApi.accountDeletion.pending>
    >("accountDeletion:pending"),
  },
};
