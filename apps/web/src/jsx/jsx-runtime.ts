import { jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";

import { withPhrases } from "./phrased";

// React's own runtime, with Japanese broken between phrases (phrased.ts).

export { Fragment } from "react/jsx-runtime";
export type { JSX } from "react/jsx-runtime";

export const jsx: typeof reactJsx = (type, props, key) =>
  reactJsx(type, withPhrases(type, props), key);

export const jsxs: typeof reactJsxs = (type, props, key) =>
  reactJsxs(type, withPhrases(type, props), key);
