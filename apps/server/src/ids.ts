import { syncLimits } from "@pochical/design/limits";

import { SERVER_DEVICE } from "./hlc";

// The ids the apps make (patterns, coworkers, devices) and the icon names
// they use: kept short, and without spaces, since a day's people are
// coworker ids separated by spaces (spec/sync-protocol.md, Coworkers).

const SPACE = /\s/u;

/** Whether the text can be an id: 1 to syncLimits.idLength, no spaces. */
export const isId = (text: string): boolean =>
  text !== "" && text.length <= syncLimits.idLength && !SPACE.test(text);

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
