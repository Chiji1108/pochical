import { css, cva } from "@pochical/styled-system/css";
import type { ReactNode } from "react";

// Every shared piece the screens are built from, sorted by what it is
// for, each with the SwiftUI and Compose piece it becomes: a file here for
// each page of content/design/components, which names and explains each
// group. The pages are the pieces' spec, kept true by being the real
// components, and complete by tests/design-catalog.test.ts.

const styles = {
  // A wide one two columns across, or the one column on a phone.
  item: cva({
    base: {
      "& > figcaption": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "0 2px",
      },
      "& > figcaption > code": { color: "text.primary", fontSize: "12px" },
      "& > figcaption > small": { color: "text.tertiary", fontSize: "11px" },
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      margin: 0,
    },
    variants: {
      wide: {
        true: {
          "@media (max-width: 480px)": { gridColumn: "auto" },
          gridColumn: "span 2",
        },
      },
    },
  }),
  items: css({
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  }),
  // The native pieces, a line each.
  native: css({
    "& > dd": { margin: 0 },
    "& > dt": { color: "text.quaternary", fontWeight: 600 },
    color: "text.tertiary",
    columnGap: "8px",
    display: "grid",
    fontSize: "11px",
    gridTemplateColumns: "auto 1fr",
    margin: "4px 0 0",
    rowGap: "2px",
  }),
  // A piece keeps within its box. A wide box stacks its pieces one under
  // another and stretches them across, as a screen's column does.
  sample: cva({
    base: {
      "& > *": { maxWidth: "100%" },
      alignItems: "center",
      bg: "background.elevated",
      border: "1px solid token(colors.separator)",
      borderRadius: "14px",
      display: "flex",
      flex: 1,
      justifyContent: "center",
      minHeight: "88px",
      padding: "16px",
    },
    variants: {
      wide: {
        true: { alignItems: "stretch", flexDirection: "column", gap: "12px" },
      },
    },
  }),
};

// A group's pieces, as many across as fit at 200px or wider, and one on
// a phone.
export function Items({ children }: { children: ReactNode }) {
  return <div className={styles.items}>{children}</div>;
}

// One piece: what it looks like, what it is called in the code, and where
// it is used.
export function Item({
  name,
  where,
  ios,
  android,
  wide = false,
  children,
}: {
  name: string;
  where: string;
  // What the native apps build it from, so the web piece and the native
  // one are named side by side and change together.
  ios: string;
  android: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    // data-catalog-item and data-sample are what tools/layout-diff measures
    // the pieces by.
    <figure className={styles.item({ wide })} data-catalog-item>
      <div className={styles.sample({ wide })} data-sample>
        {children}
      </div>
      <figcaption>
        <code>{name}</code>
        <small>{where}</small>
        <dl className={styles.native}>
          <dt>iOS</dt>
          <dd>{ios}</dd>
          <dt>Android</dt>
          <dd>{android}</dd>
        </dl>
      </figcaption>
    </figure>
  );
}
