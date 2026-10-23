/**
 * A Durable Object's alarm, set only through here (spec/sync-protocol.md,
 * Group projection). workerd keeps and never runs an alarm set for the
 * very time of the run it has taken up, before or while it runs: storage
 * still holds that time, so the set reads as no change and never reaches
 * the scheduler, which lets the time go once the run ends
 * (cloudflare/workerd#7915). getAlarm() reads null meanwhile, so the
 * run's time is kept here as each run begins, and an alarm asked for it
 * is set a millisecond after it, which the scheduler takes as any other.
 * Remove this once workerd schedules such a set.
 *
 * One set for the run's time before the run began is the exception: the
 * run is already to see the change that set it, and storage keeps that
 * time with nothing to run it. Read here as no alarm, it goes as the run
 * ends.
 */
export class Alarm {
  /** When the latest run this object began was set for. */
  private lastRun: number | undefined;

  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  /** Called as each run of the alarm begins, with what the runtime gave it. */
  begin(run: AlarmInvocationInfo): void {
    this.lastRun = run.scheduledTime;
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

  /** The alarm set for `due` at the latest: one set earlier stays. */
  async setBy(due: number): Promise<void> {
    const set = await this.stored();
    if (set === null || set > due) {
      await this.set(due);
    }
  }

  /**
   * As a run ends: the alarm set for `due`, what is still to do, unless
   * one was set earlier meanwhile, as by a change made while it ran.
   */
  async end(due: number | undefined): Promise<void> {
    if (due !== undefined) {
      await this.setBy(due);
    } else if ((await this.storage.getAlarm()) === this.lastRun) {
      await this.storage.deleteAlarm();
    }
  }

  /** The alarm that will run, if any. */
  private async stored(): Promise<number | null> {
    const set = await this.storage.getAlarm();
    return set === this.lastRun ? null : set;
  }
}
