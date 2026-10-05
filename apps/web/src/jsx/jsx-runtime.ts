import { jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";

import { withPhrases } from "./phrased";

// React's own runtime, with Japanese broken between phrases (phrased.ts).

export { Fragment } from "react/jsx-runtime";
export type { JSX } from "react/jsx-runtime";

export const jsx: typeof reactJsx = (type, props, key) =>
  reactJsx(type, withPhrases(type, props), key);

export const jsxs: typeof reactJsxs = (type, props, key) =>
  reactJsxs(type, withPhrases(type, props), key);

// A style prop may set CSS custom properties (--name), which React sets as
// they are; React's types know only CSS's own properties.
declare module "react" {
  // Module augmentation only merges into an interface,
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface CSSProperties {
    // and a property named by a pattern only as an index signature.
    // oxlint-disable-next-line typescript/consistent-indexed-object-style
    [property: `--${string}`]: string | number | undefined;
  }
}
