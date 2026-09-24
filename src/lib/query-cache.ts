import { convexToJson, jsonToConvex, type Value } from "convex/values";

type Storage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};
type Entry = {
  data: string;
  groupId?: string;
  memberId?: string;
  savedAt: number;
};
const MAX_ENTRIES = 100;
const MAX_BYTES = 2_000_000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// A disposable display cache. It never queues writes or stores pagination cursors.
export class QueryCache {
  private readonly decoded = new WeakMap<Entry, unknown>();
  private entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private readonly members = new Map<string, Set<string>>();
  private groups: Set<string> | undefined;
  private readonly blockedGroups = new Set<string>();

  private readonly persistent: boolean = true;
  private readonly session = `${Date.now()}:${Math.random()}`;
  private readonly storage: Storage;
  readonly owner: string;
  constructor(storage: Storage, owner: string) {
    this.storage = storage;
    this.owner = owner;
    try {
      this.storage.set("session", this.session);
    } catch {
      this.persistent = false;
    }
    try {
      const saved = JSON.parse(storage.getString("cache") ?? "null");
      if (
        saved?.version === 1 &&
        saved.owner === owner &&
        Array.isArray(saved.entries)
      ) {
        for (const [key, entry] of saved.entries) {
          if (
            typeof key === "string" &&
            typeof entry?.data === "string" &&
            typeof entry.savedAt === "number" &&
            Date.now() - entry.savedAt < MAX_AGE
          ) {
            this.entries.set(key, entry);
          }
        }
      }
    } catch {
      this.entries.clear();
    }
    this.persist();
  }

  private isActive() {
    if (!this.persistent) {
      return true;
    }
    try {
      return this.storage.getString("session") === this.session;
    } catch {
      return false;
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.revision;
  private allowed(groupId?: string, memberId?: string) {
    return (
      !groupId ||
      (!this.blockedGroups.has(groupId) &&
        (!this.groups || this.groups.has(groupId)) &&
        (!(memberId && this.members.has(groupId)) ||
          this.members.get(groupId)?.has(memberId)))
    );
  }
  read<T>(key: string): T | undefined {
    if (!this.isActive()) {
      return;
    }
    const entry = this.entries.get(key);
    if (
      !(entry && this.allowed(entry.groupId, entry.memberId)) ||
      Date.now() - entry.savedAt >= MAX_AGE
    ) {
      return;
    }
    try {
      if (!this.decoded.has(entry)) {
        this.decoded.set(entry, jsonToConvex(JSON.parse(entry.data)));
      }
      return this.decoded.get(entry) as T;
    } catch {
      return;
    }
  }
  write(key: string, value: unknown, groupId?: string, memberId?: string) {
    if (!(this.isActive() && this.allowed(groupId, memberId))) {
      return;
    }
    const data = JSON.stringify(convexToJson(value as Value));
    if (data.length * 2 > MAX_BYTES / 2) {
      if (this.entries.delete(key)) {
        this.persist();
        this.notify();
      }
      return;
    }
    if (
      this.entries.get(key)?.data === data &&
      Date.now() - (this.entries.get(key)?.savedAt ?? 0) < MAX_AGE / 2
    ) {
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, { data, savedAt: Date.now(), groupId, memberId });
    this.persist();
    this.notify();
  }
  reconcileGroups(ids: string[]) {
    this.groups = new Set(ids);
    for (const id of ids) {
      this.blockedGroups.delete(id);
    }
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (entry.groupId && !this.groups.has(entry.groupId)) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
  }
  reconcileMembers(groupId: string, ids: string[]) {
    const members = new Set(ids);
    this.members.set(groupId, members);
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (
        entry.groupId === groupId &&
        entry.memberId &&
        !members.has(entry.memberId)
      ) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
  }
  removeGroup(groupId: string) {
    this.blockedGroups.add(groupId);
    for (const [key, entry] of this.entries) {
      if (entry.groupId === groupId) {
        this.entries.delete(key);
      }
    }
    this.persist();
    this.notify();
  }
  private notify() {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
  private persist() {
    if (!(this.persistent && this.isActive())) {
      return;
    }
    let size = 0;
    const kept = [...this.entries]
      .reverse()
      .filter(([, entry], index) => {
        size += entry.data.length * 2;
        return index < MAX_ENTRIES && size <= MAX_BYTES;
      })
      .reverse();
    this.entries = new Map(kept);
    try {
      this.storage.set(
        "cache",
        JSON.stringify({ version: 1, owner: this.owner, entries: kept })
      );
    } catch {
      // Disk caching is optional; a storage failure must not break live queries.
    }
  }
}
