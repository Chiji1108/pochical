import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { css, cx } from "styled-system/css";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { sampleGroups } from "../components/design-group";
import { DesignProviders } from "../components/design-providers";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

const title = "ポチカル";

export const Route = createFileRoute("/try")({
  component: TryPage,
  head: () => {
    const meta = pageMeta("試す", "スマホで触れるポチカルの試作", "/try", true);
    return {
      ...meta,
      links: [{ href: designStyles, rel: "stylesheet" }],
      meta: [
        ...meta.meta,
        // Under the device's own bars, kept clear with its safe areas, and
        // no zooming in when a field smaller than 16px takes focus.
        {
          content:
            "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
          name: "viewport",
        },
        // Added to the home screen, it opens as an app of its own.
        { content: "yes", name: "mobile-web-app-capable" },
        { content: "yes", name: "apple-mobile-web-app-capable" },
        { content: title, name: "apple-mobile-web-app-title" },
      ],
    };
  },
});

// The current proposal for each open design choice.
const variants = parseDesignVariants({});

// The phone's screens fill the page, with nothing of the page to scroll
// or bounce behind them.
const page = css({
  minHeight: "auto",
  overscrollBehavior: "none",
  padding: 0,
});

// The browser's bars take the color of the screen under them, which
// follows the theme and its light or dark.
function useBarColor() {
  useEffect(() => {
    const phone = document.querySelector<HTMLElement>(".dc-phone");
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (!(phone && meta)) {
      return;
    }
    const root = document.documentElement;
    const before = { background: root.style.background, meta: meta.content };
    const follow = () => {
      const color = getComputedStyle(phone).backgroundColor;
      meta.content = color;
      root.style.background = color;
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(phone, { attributeFilter: ["style"] });
    return () => {
      observer.disconnect();
      meta.content = before.meta;
      root.style.background = before.background;
    };
  }, []);
}

// The app alone on a phone: the demo's sample person, starting over on
// reload. /demo has it framed, with the open design choices beside it.
function TryPage() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  useBarColor();
  return (
    <main className={cx("design-page", page)} id="main">
      <DesignProviders>
        <UserStoreContext value={person}>
          <DesignCalendar
            fullScreen
            initialEditing={false}
            variants={variants}
          />
        </UserStoreContext>
      </DesignProviders>
    </main>
  );
}
