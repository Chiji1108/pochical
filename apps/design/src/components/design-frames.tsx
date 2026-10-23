import { DesignApp } from "@pochical/prototype/components/design-app";
import type { GroupStart } from "@pochical/prototype/components/design-group";
import { HomeScreen } from "@pochical/prototype/components/design-home-screen";
import type { SettingsPage } from "@pochical/prototype/components/design-settings";
import type { Tab } from "@pochical/prototype/components/design-tab-bar";
import { initialDesignSchedule } from "@pochical/prototype/lib/design-days";
import {
  createUserStore,
  UserStoreContext,
} from "@pochical/prototype/lib/design-user-store";
import type { OwnData } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css, cva } from "@pochical/styled-system/css";
import { ArrowRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

// Real screens drawn small and not touchable, for the flows and states
// pages, so the documents never drift from the app. Frames open on their
// screen through the components' initial props.
const variants = parseDesignVariants({});

const frameStyle = {
  // Pointing on to the next frame, level with the screens' middles.
  arrow: css({
    alignSelf: "center",
    color: "text.quaternary",
    flexShrink: 0,
    marginTop: "-40px",
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
  // Frames drawn at this share of a phone's size, in a row that scrolls
  // sideways when it outruns the page.
  row: cva({
    base: {
      "--frame-scale": "0.42",
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
  screen: css({
    borderRadius: "calc(53px * var(--frame-scale))",
    flexShrink: 0,
    height: "calc(844px * var(--frame-scale))",
    overflow: "hidden",
    position: "relative",
    width: "calc(390px * var(--frame-scale))",
  }),
};

// Frames in order with arrows between, or with `fan`, frames side by side
// without arrows: the pages one step branches out to, or states to compare.
export function FrameRow({
  fan = false,
  children,
}: {
  fan?: boolean;
  children: ReactNode[] | ReactNode;
}) {
  const frames = Array.isArray(children) ? children : [children];
  return (
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
