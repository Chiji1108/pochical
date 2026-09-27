import { ArrowRight, CornerDownRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import type { OwnData } from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { DesignCalendar, initialDesignSchedule } from "./design-calendar";
import type { Tab } from "./design-calendar";
import type { SettingsPage } from "./design-settings";

// Real screens drawn small and not touchable, for /design/flows and
// /design/states, so the documents never drift from the app. Frames open
// on their screen through the components' initial props.
const variants = parseDesignVariants({});

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
    <section aria-label={title} className="fl-flow">
      <h2>{title}</h2>
      {description && <p className="fl-description">{description}</p>}
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
    <div className="fl-row-wrap">
      {branch && (
        <p className="fl-branch">
          <CornerDownRight aria-hidden="true" size={14} />
          {branch}
        </p>
      )}
      <ol className={`fl-row ${fan ? "fl-fan" : ""}`}>
        {frames.map((frame, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- frames never move
          <Fragment key={index}>
            {index > 0 && !fan && (
              <li aria-hidden="true" className="fl-arrow">
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
    <figure className="fl-frame">
      <div className="fl-screen">
        <div className="fl-inner" inert>
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
}: {
  label: string;
  note?: string;
  person?: Partial<OwnData>;
  month?: number;
  editing?: boolean;
  tab?: Tab;
  page?: SettingsPage;
}) {
  const [store] = useState(() =>
    createUserStore({ schedule: initialDesignSchedule(), ...person })
  );
  return (
    <Frame label={label} note={note}>
      <UserStoreContext value={store}>
        <DesignCalendar
          initialEditing={editing}
          initialMonth={month}
          initialSettingsPage={page}
          initialTab={tab}
          variants={variants}
        />
      </UserStoreContext>
    </Frame>
  );
}
