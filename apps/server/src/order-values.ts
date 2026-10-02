import { textLimits } from "@pochical/design/limits";

import { isDate } from "./day-values";
import type { RepeatOrder } from "./gen/pochical/v1/sync_pb";
import { isId } from "./pattern-values";
import { characterCount } from "./text-limits";

// What a user's repeating orders and coworkers may hold
// (spec/shift-patterns.md, Repeating orders; spec/sync-protocol.md,
// Coworkers), checked as the owner's edits arrive. The counts are far past
// what one person keeps, so they only bound what one value can carry.

// Orders in one timeline: a change of rotation or job each.
export const MAX_ORDERS = 200;
// Shifts in one order: a rotation a year long.
export const MAX_SEQUENCE = 366;
// Coworkers one person notes.
export const MAX_COWORKERS = 500;

// A country code as the holiday data keys it (design/scripts/holidays.ts).
const COUNTRY = /^[A-Z]{2}$/u;

const fitsOrder = (order: RepeatOrder): boolean =>
  isDate(order.start) &&
  (order.anchor === undefined || isDate(order.anchor)) &&
  order.sequence.length <= MAX_SEQUENCE &&
  order.sequence.every((id) => isId(id)) &&
  COUNTRY.test(order.holidayCountry) &&
  (order.holidayShift === undefined || isId(order.holidayShift)) &&
  // Holidays off always records the pattern they take.
  (!order.holidaysOff || order.holidayShift !== undefined);

/**
 * Whether a timeline of orders fits: each order fits, and their starts
 * only grow, so each takes over from the one before.
 */
export const fitsOrders = (orders: readonly RepeatOrder[]): boolean =>
  orders.length <= MAX_ORDERS &&
  orders.every(
    (order, index) =>
      fitsOrder(order) &&
      (index === 0 || (orders[index - 1]?.start ?? "") < order.start)
  );

/** Whether a coworker's name is one a person could type. */
export const fitsCoworkerName = (name: string): boolean =>
  name.trim() !== "" && characterCount(name) <= textLimits.personName;

/** Whether an order of coworkers is ids, each once, and not too many. */
export const fitsCoworkerOrder = (ids: readonly string[]): boolean =>
  ids.length <= MAX_COWORKERS &&
  new Set(ids).size === ids.length &&
  ids.every((id) => isId(id));
