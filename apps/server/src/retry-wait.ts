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
