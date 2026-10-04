import { ArrowRight, CornerDownRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { initialDesignSchedule } from "../lib/design-days";
import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import type { OwnData } from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { DesignApp } from "./design-app";
import type { GroupStart } from "./design-group";
import { HomeScreen } from "./design-home-screen";
import type { SettingsPage } from "./design-settings";
import type { Tab } from "./design-tab-bar";

// Real screens drawn small and not touchable, for /design/flows and
// /design/states, so the documents never drift from the app. Frames open
// on their screen through the components' initial props.
const variants = parseDesignVariants({});

// The sections down the page, their frames drawn at this share of a
// phone's size.
export const frameSections = css({
  "--frame-scale": "0.42",
  display: "flex",
  flexDirection: "column",
  gap: "48px",
  margin: "0 auto",
  maxWidth: "1400px",
  padding: "0 16px 64px",
});

const frameStyle = {
  // Pointing on to the next frame, level with the screens' middles.
  arrow: css({
    alignSelf: "center",
    color: "text.quaternary",
    flexShrink: 0,
    marginTop: "-40px",
  }),
  branch: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    fontSize: "12px",
    fontWeight: 600,
    gap: "6px",
    margin: "0 0 10px 4px",
  }),
  description: css({
    color: "text.tertiary",
    fontSize: "12px",
    margin: "-8px 0 14px 4px",
  }),
  frame: css({
    "& > figcaption": {
      color: "text.tertiary",
      display: "flex",
      flexDirection: "column",
      fontSize: "12px",
      gap: "2px",
      padding: "0 2px",
    },
    "& > figcaption > small": { fontSize: "11px" },
    "& > figcaption > strong": { color: "text.primary", fontSize: "13px" },
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    margin: 0,
    width: "calc(390px * var(--frame-scale))",
  }),
  // The phone at its full size, scaled down into the frame.
  inner: css({
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    transform: "scale(var(--frame-scale))",
    transformOrigin: "top left",
    width: "390px",
  }),
  // Frames in a row scroll sideways when they outrun the page.
  row: cva({
    base: {
      alignItems: "flex-start",
      display: "flex",
      gap: "10px",
      listStyle: "none",
      margin: 0,
      overflowX: "auto",
      padding: "0 4px 8px",
    },
    variants: { fan: { true: { gap: "18px" } } },
  }),
  rows: css({ "& + &": { marginTop: "22px" } }),
  screen: css({
    borderRadius: "calc(53px * var(--frame-scale))",
    flexShrink: 0,
    height: "calc(844px * var(--frame-scale))",
    overflow: "hidden",
    position: "relative",
    width: "calc(390px * var(--frame-scale))",
  }),
  section: css({
    "& > h2": {
      color: "text.primary",
      fontSize: "17px",
      fontWeight: 700,
      margin: "0 0 14px 4px",
    },
  }),
};

export function FrameSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={frameStyle.section}>
      <h2>{title}</h2>
      {description && <p className={frameStyle.description}>{description}</p>}
      {children}
    </section>
  );
}

// Frames in order with arrows between, or with `fan`, frames side by side
// without arrows: the pages one step branches out to, or states to compare.
export function FrameRow({
  branch,
  fan = false,
  children,
}: {
  branch?: string;
  fan?: boolean;
  children: ReactNode[] | ReactNode;
}) {
  const frames = Array.isArray(children) ? children : [children];
  return (
    <div className={frameStyle.rows}>
      {branch && (
        <p className={frameStyle.branch}>
          <CornerDownRight aria-hidden="true" size={14} />
          {branch}
        </p>
      )}
      <ol className={frameStyle.row({ fan })}>
        {frames.map((frame, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- frames never move
          <Fragment key={index}>
            {index > 0 && !fan && (
              <li aria-hidden="true" className={frameStyle.arrow}>
                <ArrowRight size={18} />
              </li>
            )}
            <li>{frame}</li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

// One screen, drawn at phone size and scaled down, with its name under it.
export function Frame({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <figure className={frameStyle.frame}>
      <div className={frameStyle.screen}>
        <div className={frameStyle.inner} inert>
          {children}
        </div>
      </div>
      <figcaption>
        <strong>{label}</strong>
        {note && <small>{note}</small>}
      </figcaption>
    </figure>
  );
}

// The phone's home screen with the sample person's widgets on it, as
// /demo draws it, for where a widget's tap leads.
export function HomeFrame({ label, note }: { label: string; note?: string }) {
  const [store] = useState(() =>
    createUserStore({ schedule: initialDesignSchedule(), ...samplePerson })
  );
  return (
    <Frame label={label} note={note}>
      <UserStoreContext value={store}>
        <HomeScreen />
      </UserStoreContext>
    </Frame>
  );
}

// The sample person's own data, for frames that need nothing special.
const samplePerson: Partial<OwnData> = {};

export function CalendarFrame({
  label,
  note,
  person = samplePerson,
  month,
  editing = false,
  tab,
  page,
  groupPage,
  detail,
  overlay,
}: {
  label: string;
  note?: string;
  person?: Partial<OwnData>;
  // A sheet drawn open over the screen.
  overlay?: ReactNode;
  month?: number;
  editing?: boolean;
  tab?: Tab;
  page?: SettingsPage;
  groupPage?: GroupStart;
  // A day of the month to open on picked.
  detail?: Date;
}) {
  const [store] = useState(() =>
    createUserStore({ schedule: initialDesignSchedule(), ...person })
  );
  return (
    <Frame label={label} note={note}>
      <UserStoreContext value={store}>
        <DesignApp
          initialDetail={detail}
          initialEditing={editing}
          initialGroupPage={groupPage}
          initialMonth={month}
          initialSettingsPage={page}
          initialTab={tab}
          variants={variants}
        />
        {overlay}
      </UserStoreContext>
    </Frame>
  );
}
