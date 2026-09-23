/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as groupEvents from "../groupEvents.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as nativeAuth from "../nativeAuth.js";
import type * as presence from "../presence.js";
import type * as sharedWork from "../sharedWork.js";
import type * as shiftMembers from "../shiftMembers.js";
import type * as shiftPatterns from "../shiftPatterns.js";
import type * as shifts from "../shifts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  chat: typeof chat;
  groupEvents: typeof groupEvents;
  groups: typeof groups;
  http: typeof http;
  invites: typeof invites;
  nativeAuth: typeof nativeAuth;
  presence: typeof presence;
  sharedWork: typeof sharedWork;
  shiftMembers: typeof shiftMembers;
  shiftPatterns: typeof shiftPatterns;
  shifts: typeof shifts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  replicate: import("@trestleinc/replicate/_generated/component.js").ComponentApi<"replicate">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  unreadTracking: import("convex-unread-tracking/_generated/component.js").ComponentApi<"unreadTracking">;
};
