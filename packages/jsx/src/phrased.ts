import type { ReactNode } from "react";
import { Fragment, jsx } from "react/jsx-runtime";

import { phrasesOf, UNBROKEN } from "./phrases";

// The site's JSX runtime (jsx-runtime.ts, set as jsxImportSource): every
// Japanese string on its way to the page has a <wbr> between its phrases,
// and styles.css keeps a line from breaking anywhere else, so no screen
// needs its words marked by hand.
//
// Strings reach the page through elements (<p>), the library parts that
// render them straight away (motion.p, Ark's Dialog.Title), which are
// objects rather than functions, and Fragments, whose content lands in
// whatever element holds them and which no element looks inside. The
// site's own components are functions and get their strings untouched, as
// one may use it as a label or count it.

const phrased = (text: string): ReactNode => {
  const phrases = phrasesOf(text);
  if (phrases.length === 1) {
    return text;
  }
  return phrases.flatMap((phrase, index) =>
    index === 0 ? [phrase] : [jsx("wbr", {}, index), phrase]
  );
};

const reachesPage = (type: unknown): boolean =>
  type === Fragment ||
  typeof type === "object" ||
  (typeof type === "string" && !UNBROKEN.has(type));

export function withPhrases<Props>(type: unknown, props: Props): Props {
  if (
    !reachesPage(type) ||
    typeof props !== "object" ||
    props === null ||
    !("children" in props)
  ) {
    return props;
  }
  const { children } = props;
  if (typeof children === "string") {
    const next = phrased(children);
    return next === children ? props : { ...props, children: next };
  }
  if (!Array.isArray(children)) {
    return props;
  }
  let changed = false;
  const next = children.map((child: unknown) => {
    if (typeof child !== "string") {
      return child;
    }
    const each = phrased(child);
    changed ||= each !== child;
    return each;
  });
  return changed ? { ...props, children: next } : props;
}
