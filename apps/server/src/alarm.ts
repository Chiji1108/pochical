/**
 * A Durable Object's alarm, set only through here (spec/sync-protocol.md,
 * Group projection). workerd keeps and never runs an alarm set for the
 * very time of the run it has taken up, before or while it runs: storage
 * still holds that time, so the set reads as no change and never reaches
 * the scheduler, which lets the time go once the run ends
 * (cloudflare/workerd#7915). getAlarm() reads null meanwhile, so the
 * run's time is kept here as each run begins, and an alarm asked for it
 * is set a millisecond after it, which the scheduler takes as any other.
 * Remove this once workerd schedules such a set (POC-266).
 */
export class Alarm {
  /** When the latest run this object began was set for. */
  private lastRun: number | undefined;

  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  /**
   * Called as each run of the alarm begins, with what the runtime gave
   * it, before the run does anything else. A first run finding its own
   * time stored means a set for it came after the runtime took the run up
   * and before it began, and was kept, not scheduled: it is set again by
   * the same rule, so storage never holds an alarm that will not run. A
   * retry is left alone: the runtime keeps the time to retry it, and no
   * set lands on it, the clock being past it by the retry's wait.
   */
  async begin(run: AlarmInvocationInfo): Promise<void> {
    this.lastRun = run.scheduledTime;
    if (run.isRetry) {
      return;
    }
    if ((await this.storage.getAlarm()) === run.scheduledTime) {
      this.set(run.scheduledTime);
    }
  }

  /**
   * The alarm set for `at`, or now if that is past, as the runtime sets
   * it; a millisecond later when that is the time of the latest run.
   * Written in the call, in order with the object's other writes, and
   * kept before any reply leaves (the output gate, which a failed write
   * breaks, failing the call), so a caller has nothing to wait for.
   */
  set(at: number): void {
    const time = Math.max(at, Date.now());
    void this.storage.setAlarm(time === this.lastRun ? time + 1 : time);
  }

  /**
   * The alarm set for `due` at the latest: one set earlier stays, as one
   * a change set while a run went, which getAlarm() reads then. Nothing
   * comes between the read and the write: a SQLite-backed object answers
   * getAlarm() with a promise already resolved (workerd's actor-state.c++,
   * transformCacheResult), so the write follows in the same turn's
   * microtasks, and a read that did wait would hold the input gate.
   */
  async setBy(due: number): Promise<void> {
    const set = await this.storage.getAlarm();
    if (set === null || set > due) {
      this.set(due);
    }
  }
}
