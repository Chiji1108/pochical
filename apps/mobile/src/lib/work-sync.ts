import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import type {
  MemberRecord,
  PatternRecord,
  ShiftRecord,
} from "../../shared/work-schema";

export type Records = {
  shiftPatterns: PatternRecord;
  shiftMembers: MemberRecord;
  shifts: ShiftRecord;
};
export type WorkTable = keyof Records;
export const WORK_TABLES: WorkTable[] = [
  "shiftPatterns",
  "shiftMembers",
  "shifts",
];
type StoredDoc = { bytes: number[]; pending: boolean; version: number };
type DiskState = Record<WorkTable, Record<string, StoredDoc>>;
export type WorkChange = {
  [K in WorkTable]: {
    table: K;
    id: string;
    values?: Partial<Records[K]>;
    remove?: boolean;
    create?: boolean;
  };
}[WorkTable];
export type RecordSnapshot = { [K in WorkTable]: Records[K][] };
const emptyDisk = (): DiskState => ({
  shiftPatterns: {},
  shiftMembers: {},
  shifts: {},
});

const restore = (stored?: StoredDoc) => {
  const doc = new Doc();
  if (stored) {
    applyUpdateV2(doc, Uint8Array.from(stored.bytes));
  }
  return doc;
};

type Send = (
  table: WorkTable,
  id: string,
  bytes: ArrayBuffer
) => Promise<unknown>;
export class WorkSync {
  readonly ownerId: string;
  private readonly persist: (value: string) => void;
  private readonly send: Send;
  private disk: DiskState;
  private readonly listeners = new Set<() => void>();
  private snapshot: RecordSnapshot = {
    shiftPatterns: [],
    shiftMembers: [],
    shifts: [],
  };
  private readonly decoded = new WeakMap<
    StoredDoc,
    Records[WorkTable] | null
  >();
  private sending = false;
  private stopped = false;

  constructor(
    ownerId: string,
    raw: string | undefined,
    persist: (value: string) => void,
    send: Send
  ) {
    this.ownerId = ownerId;
    this.persist = persist;
    this.send = send;
    this.disk = raw ? (JSON.parse(raw) as DiskState) : emptyDisk();
    this.rebuild();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private decode(
    stored: StoredDoc,
    previous: Map<string, Records[WorkTable]>
  ): Records[WorkTable] | null {
    let record = this.decoded.get(stored);
    if (record !== undefined) {
      return record;
    }
    const doc = restore(stored);
    try {
      record =
        doc.getMap("meta").get("deleted") === true
          ? null
          : (doc.getMap("fields").toJSON() as Records[WorkTable]);
      if (record && record.ownerId !== this.ownerId) {
        record = null;
      }
      const old = record ? previous.get(record.id) : undefined;
      if (old && JSON.stringify(old) === JSON.stringify(record)) {
        record = old;
      }
      this.decoded.set(stored, record);
      return record;
    } finally {
      doc.destroy();
    }
  }

  private rebuild() {
    const next: RecordSnapshot = {
      shiftPatterns: [],
      shiftMembers: [],
      shifts: [],
    };
    for (const table of WORK_TABLES) {
      const previous = new Map(
        this.snapshot[table].map((record) => [record.id, record])
      );
      for (const stored of Object.values(this.disk[table])) {
        const record = this.decode(stored, previous);
        if (record) {
          (next[table] as Records[WorkTable][]).push(record);
        }
      }
      if (
        next[table].length === this.snapshot[table].length &&
        next[table].every(
          (record, index) => record === this.snapshot[table][index]
        )
      ) {
        (next[table] as Records[WorkTable][]) = this.snapshot[table];
      }
    }
    if (WORK_TABLES.every((table) => next[table] === this.snapshot[table])) {
      return;
    }
    this.snapshot = next;
  }

  private commit(next: DiskState) {
    this.persist(JSON.stringify(next));
    this.disk = next;
    const previous = this.snapshot;
    this.rebuild();
    if (this.snapshot === previous) {
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  change(changes: WorkChange[]) {
    if (this.stopped) {
      throw new Error("Work store closed");
    }
    const next: DiskState = {
      shiftPatterns: { ...this.disk.shiftPatterns },
      shiftMembers: { ...this.disk.shiftMembers },
      shifts: { ...this.disk.shifts },
    };
    for (const change of changes) {
      const existing = next[change.table][change.id];
      if (!(existing || change.create)) {
        continue;
      }
      const doc = restore(existing);
      try {
        if (doc.getMap("meta").get("deleted") === true) {
          continue;
        }
        if (change.remove) {
          doc.getMap("meta").set("deleted", true);
        } else {
          const fields = doc.getMap("fields");
          for (const [key, value] of Object.entries(change.values ?? {})) {
            if (value !== undefined) {
              fields.set(key, value);
            }
          }
          fields.set("id", change.id);
          fields.set("ownerId", this.ownerId);
        }
        next[change.table][change.id] = {
          bytes: Array.from(encodeStateAsUpdateV2(doc)),
          pending: true,
          version: (existing?.version ?? 0) + 1,
        };
      } finally {
        doc.destroy();
      }
    }
    this.commit(next);
    this.flush().catch(() => undefined);
  }

  receive(table: WorkTable, rows: { id: string; bytes: ArrayBuffer | null }[]) {
    if (this.stopped) {
      return;
    }
    const next = { ...this.disk, [table]: { ...this.disk[table] } };
    let changed = false;
    for (const row of rows) {
      if (!row.bytes) {
        continue;
      }
      const existing = next[table][row.id];
      const doc = restore(existing);
      try {
        applyUpdateV2(doc, new Uint8Array(row.bytes));
        const bytes = Array.from(encodeStateAsUpdateV2(doc));
        if (
          existing &&
          bytes.length === existing.bytes.length &&
          bytes.every((byte, index) => byte === existing.bytes[index])
        ) {
          continue;
        }
        next[table][row.id] = {
          bytes,
          pending: existing?.pending ?? false,
          version: existing?.version ?? 0,
        };
        changed = true;
      } finally {
        doc.destroy();
      }
    }
    if (changed) {
      this.commit(next);
    }
  }

  async flush() {
    if (this.sending || this.stopped) {
      return;
    }
    this.sending = true;
    try {
      for (const table of WORK_TABLES) {
        for (const [id, stored] of Object.entries(this.disk[table])) {
          if (!stored.pending || this.stopped) {
            continue;
          }
          await this.send(table, id, Uint8Array.from(stored.bytes).buffer);
          if (this.stopped) {
            return;
          }
          // An edit made during the request remains pending for the next pass.
          if (this.disk[table][id].version === stored.version) {
            const next = {
              ...this.disk,
              [table]: {
                ...this.disk[table],
                [id]: { ...this.disk[table][id], pending: false },
              },
            };
            this.persist(JSON.stringify(next));
            this.disk = next;
          }
        }
      }
    } finally {
      this.sending = false;
    }
    if (
      WORK_TABLES.some((table) =>
        Object.values(this.disk[table]).some((doc) => doc.pending)
      )
    ) {
      await this.flush();
    }
  }

  resume() {
    this.stopped = false;
  }
  close() {
    this.stopped = true;
    this.listeners.clear();
  }
}
