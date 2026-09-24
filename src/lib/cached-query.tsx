import {
  type OptionalRestArgsOrSkip,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  type FunctionReference,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";
import { convexToJson, type Value } from "convex/values";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { api } from "../../convex/_generated/api";
import { createAccountStorage } from "./account-storage";
import { QueryCache } from "./query-cache";

const Context = createContext<QueryCache | null>(null);
export const QueryCacheProvider = ({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) => {
  const cache = useMemo(
    () => new QueryCache(createAccountStorage("query", "display"), owner),
    [owner]
  );
  const groups = useQuery(api.groups.listForCurrentUser, {});
  useEffect(() => {
    if (groups !== undefined) {
      cache.reconcileGroups(groups.map((group) => group._id));
    }
  }, [cache, groups]);
  return <Context value={cache}>{children}</Context>;
};
export const useQueryCache = () => {
  const cache = use(Context);
  if (!cache) {
    throw new Error("Missing query cache provider");
  }
  return cache;
};
const keyFor = (name: string, args: unknown) =>
  `${name}:${JSON.stringify(convexToJson(args as Value))}`;
const groupFor = (args: unknown): string | undefined => {
  if (
    args &&
    typeof args === "object" &&
    "groupId" in args &&
    typeof args.groupId === "string"
  ) {
    return args.groupId;
  }
};
const memberFor = (args: unknown): string | undefined => {
  if (!args || typeof args !== "object") {
    return;
  }
  if ("targetUserId" in args && typeof args.targetUserId === "string") {
    return args.targetUserId;
  }
  if ("memberUserId" in args && typeof args.memberUserId === "string") {
    return args.memberUserId;
  }
};
export const useCachedQuery = <Q extends FunctionReference<"query">>(
  query: Q,
  ...args: OptionalRestArgsOrSkip<Q>
): FunctionReturnType<Q> | undefined => {
  const live = useQuery(query, ...args);
  const cache = useQueryCache();
  useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot);
  const name = getFunctionName(query);
  const input = args[0] ?? {};
  const key = keyFor(name, input);
  const groupId = groupFor(input);
  const memberId = memberFor(input);
  const skipped = input === "skip";
  const cached = cache.read<FunctionReturnType<Q>>(key);
  useEffect(() => {
    if (skipped || live === undefined) {
      return;
    }
    if (name === "groups:getDetail" && live === null && groupId) {
      cache.removeGroup(groupId);
    } else {
      if (name === "groups:getDetail" && live && groupId) {
        const detail = live as FunctionReturnType<typeof api.groups.getDetail>;
        if (detail) {
          cache.reconcileMembers(
            groupId,
            detail.members.map((member) => member.userId)
          );
        }
      }
      cache.write(key, live, groupId, memberId);
    }
  }, [cache, skipped, key, live, groupId, memberId, name]);
  if (skipped) {
    return;
  }
  return live === undefined ? cached : live;
};
export const useCachedPaginatedQuery = <Q extends PaginatedQueryReference>(
  query: Q,
  args: PaginatedQueryArgs<Q> | "skip",
  options: { initialNumItems: number }
) => {
  const live = usePaginatedQuery(query, args, options);
  const cache = useQueryCache();
  useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot);
  const key = keyFor(getFunctionName(query), args);
  const groupId = groupFor(args);
  const memberId = memberFor(args);
  const skipped = args === "skip";
  const loading = live.status === "LoadingFirstPage";
  useEffect(() => {
    if (skipped || loading) {
      return;
    }
    // Pending optimistic messages are not confirmed server data.
    const confirmed = live.results.filter(
      (row: { _id?: string }) => !row._id?.startsWith("message:")
    );
    cache.write(
      key,
      confirmed.slice(0, options.initialNumItems),
      groupId,
      memberId
    );
  }, [
    cache,
    skipped,
    key,
    groupId,
    memberId,
    loading,
    live.results,
    options.initialNumItems,
  ]);
  const cached =
    loading && !skipped ? cache.read<typeof live.results>(key) : undefined;
  return {
    ...live,
    results: cached ?? live.results,
    isShowingCache: cached !== undefined,
  };
};
