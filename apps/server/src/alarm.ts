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
   * it; the run's time is kept before anything else is done. Storage
   * holding that time means a set for it came after the runtime took the
   * run up and before it began, and was kept, not scheduled: it is set
   * again by the same rule, so storage never holds an alarm that will not
   * run.
   */
  async begin(run: AlarmInvocationInfo): Promise<void> {
    this.lastRun = run.scheduledTime;
    if ((await this.storage.getAlarm()) === run.scheduledTime) {
      await this.set(run.scheduledTime);
    }
  }

  /**
   * The alarm set for `at`, or now if that is past, as the runtime sets
   * it; a millisecond later when that is the time of the latest run.
   * Written in the turn it is called, with the writes before it.
   */
  async set(at: number): Promise<void> {
    const time = Math.max(at, Date.now());
    await this.storage.setAlarm(time === this.lastRun ? time + 1 : time);
  }

  /**
   * The alarm set for `due` at the latest: one set earlier stays, as one
   * a change set while a run went, which getAlarm() reads then.
   */
  async setBy(due: number): Promise<void> {
    const set = await this.storage.getAlarm();
    if (set === null || set > due) {
      await this.set(due);
    }
  }
}
