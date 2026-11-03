import { isId } from "@pochical/design/values";

import type { Hlc } from "./gen/pochical/v1/sync_pb";
import { SERVER_DEVICE } from "./hlc";

// A device's id in its clocks: ASCII letters, digits and "-", as a UUID is
// written, so every platform orders two of them alike when they break a
// tie (spec/sync-protocol.md, HLC). Swift compares strings by Unicode
// scalars and JavaScript by UTF-16 units, which differ past the BMP.
const DEVICE = /^[A-Za-z0-9-]+$/u;

/**
 * Whether the text can be a device's id: an id of ASCII letters, digits
 * and "-", and not SERVER_DEVICE, which only the server stamps.
 */
export const isDeviceId = (text: string): boolean =>
  isId(text) && DEVICE.test(text) && text !== SERVER_DEVICE;

/**
 * Whether the value carries a clock a device stamped: a value without one
 * cannot be applied or corrected, only acknowledged.
 */
export const hasDeviceClock = <T extends { hlc?: Hlc }>(
  value: T | undefined
): value is T & { hlc: Hlc } =>
  value?.hlc !== undefined && isDeviceId(value.hlc.deviceId);
