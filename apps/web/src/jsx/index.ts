import { createElement as reactCreateElement } from "react";
import type { ElementType, ReactElement, ReactNode } from "react";

import { withPhrases } from "./phrased";

// What the compiler calls for <div {...props} key={id}>, where a key comes
// after a spread: React's createElement, with Japanese broken between
// phrases as in jsx-runtime.ts.
export const createElement = (
  type: ElementType,
  props: object | null,
  ...children: ReactNode[]
): ReactElement =>
  reactCreateElement(
    type,
    props,
    ...children.map(
      (child): ReactNode => withPhrases(type, { children: child }).children
    )
  );
