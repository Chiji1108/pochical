/**
 * A Durable Object's alarm, set only through here (spec/sync-protocol.md,
 * Group projection). workerd keeps and never runs an alarm set for the
 * very time of the run it has taken up, before or while it runs: storage
 * still holds that time, so the set reads as no change and never reaches
 * the scheduler, which lets the time go once the run ends
 * (cloudflare/workerd#7915). getAlarm() reads null meanwhile, so the
 * run's time is kept here as each run begins, and an alarm asked for it,
 * or for any time before it, is set a millisecond after it, which the
 * scheduler takes as any other. Remove this once workerd schedules such
 * a set (POC-266).
 */
export class Alarm {
  /** When the latest run this object began was set for. */
  private lastRun: number | undefined;

  readonly storage: DurableObjectStorage;

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
   *
   * Storage holds a run's own time only so: while a run goes, getAlarm()
   * reads null until something sets the alarm, in workerd's own code, not
   * the alarm manager's. Before calling alarm(), runAlarm in
   * api/global-scope.c++ calls armAlarmHandler, and ActorSqlite's
   * (io/actor-sqlite.c++), finding the stored time to be the run's, arms
   * the deferred delete, for which ActorSqlite::getAlarm reads null.
   * SQLite-backed objects run that same code in production, as the docs
   * say getAlarm() reads null while alarm() runs. So the set below never
   * comes round again for the time it sets. Should the run then throw,
   * the runtime runs it again too: at least once, as every alarm here
   * does only what is left, the same whichever run does it.
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
   * The alarm set for `at`, which the runtime sets for now if that is
   * past; a millisecond after the latest run's time when `at` is not past
   * it. The runtime runs no alarm before its time, so now is never before
   * that run's, and whatever the runtime sets is not that time. Written in
   * the call, in order with the object's other writes, and kept before any
   * reply leaves (the output gate, which a failed write breaks, failing
   * the call), so a caller has nothing to wait for. The time asked of
   * the runtime, which it sets unless that is past.
   */
  set(at: number): number {
    const time =
      this.lastRun === undefined ? at : Math.max(at, this.lastRun + 1);
    void this.storage.setAlarm(time);
    return time;
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
