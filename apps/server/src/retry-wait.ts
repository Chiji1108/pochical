/**
 * How long a retry on the server waits after `failures` in a row: twice as
 * long each time, from `firstMs` up to `mostMs`. The User DO's pushes to
 * its groups and a support chat's relay to Slack wait so.
 */
export const retryWait = (
  failures: number,
  firstMs: number,
  mostMs: number
): number => Math.min(firstMs * 2 ** (failures - 1), mostMs);

/**
 * One more failure in a row counted under `key` in a Durable Object's
 * storage: how many now. Deleting the key starts the count again.
 */
export const countFailure = (kv: SyncKvStorage, key: string): number => {
  const stored: unknown = kv.get(key);
  const failures = (typeof stored === "number" ? stored : 0) + 1;
  kv.put(key, failures);
  return failures;
};

/**
 * How long a delete from R2 waits after failing again, as the photos'
 * sweeps in the Group and User DOs retry: from 10 seconds, up to an hour,
 * for as long as it takes, as R2 must come to hold only what is named.
 */
export const bucketRetryWait = (failures: number): number =>
  retryWait(failures, 10_000, 3_600_000);
