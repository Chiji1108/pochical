import { jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";

import { withPhrases } from "./phrased";

// jsx-runtime.ts, for the dev server.

export { Fragment } from "react/jsx-dev-runtime";
export type { JSX } from "react/jsx-dev-runtime";

export const jsxDEV: typeof reactJsxDEV = (
  type,
  props,
  key,
  isStatic,
  source,
  self
) => reactJsxDEV(type, withPhrases(type, props), key, isStatic, source, self);
