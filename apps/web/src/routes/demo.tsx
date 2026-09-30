import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { css } from "styled-system/css";

import {
  DesignCalendar,
  initialDesignSchedule,
  patternSets,
} from "../components/design-calendar";
import { sampleGroups } from "../components/design-group-data";
import { HomeScreen } from "../components/design-home-screen";
import {
  designCaption,
  DesignPage,
  DesignToolbar,
  toolbarAction,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { pageStyle } from "../components/design-theme";
import { VariantPanel } from "../components/design-variant-panel";
import { useDevice } from "../lib/design-device";
import { presetList } from "../lib/design-patterns";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import type { DesignVariants } from "../lib/design-variants";
import { wallpaperSamples } from "../lib/material-you";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({
    ...pageMeta("デモ", "ブラウザで触れるポチカルの試作", "/demo", true),
  }),
  validateSearch: parseDesignVariants,
});

// The sample patterns: a few, or more than ポチポチ入力 shows on one page.
function samplePatterns(count: DesignVariants["patternSample"]) {
  return presetList(patternSets[count === "many" ? 13 : 4]);
}

// A sample person, starting over with the sample or with nothing entered.
function makePerson(
  sample: DesignVariants["scheduleSample"],
  members: DesignVariants["memberSample"],
  groups: DesignVariants["groupSample"],
  patterns: DesignVariants["patternSample"]
) {
  return createUserStore({
    coworkers: members === "some" ? sampleCoworkers : [],
    groups: groups === "some" ? sampleGroups() : [],
    patterns: samplePatterns(patterns),
    schedule: sample === "empty" ? {} : initialDesignSchedule(),
  });
}

// The app's phone and the home screen's side by side, the open choices
// beside them on wide screens, where the phones stay in view as the page
// scrolls.
const demo = {
  layout: css({
    alignItems: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: "32px",
    justifyContent: "center",
    padding: "8px 16px 48px",
  }),
  phone: css({
    "@media (min-width: 900px)": { position: "sticky", top: "16px" },
    flex: "0 0 auto",
    width: "min(390px, 100%)",
  }),
};

// The app to touch: one person on a phone, their home screen beside it,
// and the open design choices. The design documents live under /design.
function DemoPage() {
  const variants = Route.useSearch();
  const navigate = Route.useNavigate();
  const theme = useDesignTheme();
  // The phone stood in for: its platform and wallpaper.
  useEffect(() => {
    useDevice.setState({
      platform: variants.platform,
      wallpaperHue: (
        wallpaperSamples.find(({ id }) => id === variants.wallpaper) ??
        wallpaperSamples[0]
      ).hue,
    });
  }, [variants.platform, variants.wallpaper]);
  const [person, setPerson] = useState(() =>
    makePerson(
      variants.scheduleSample,
      variants.memberSample,
      variants.groupSample,
      variants.patternSample
    )
  );
  // Starting over remounts the phone, so its screens reset too.
  const [version, setVersion] = useState(0);
  const startOver = (sample: DesignVariants["scheduleSample"]) => {
    setPerson(
      makePerson(
        sample,
        variants.memberSample,
        variants.groupSample,
        variants.patternSample
      )
    );
    setVersion((value) => value + 1);
  };
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="site">
        <Link className={toolbarAction} to="/design">
          <BookOpen aria-hidden="true" size={14} /> デザイン資料
        </Link>
        <button
          className={toolbarAction}
          onClick={() => {
            startOver(variants.scheduleSample);
          }}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={14} /> サンプルに戻す
        </button>
      </DesignToolbar>
      <DesignProviders>
        <div className={demo.layout}>
          <div className={demo.phone} key={version}>
            <UserStoreContext value={person}>
              <DesignCalendar
                initialEditing={false}
                pendingInvite={variants.inviteLink === "opened"}
                variants={variants}
              />
            </UserStoreContext>
            <p className={designCaption}>
              実際にタップして試せます。架空のサンプルで、再読み込みすると元に戻ります。
            </p>
          </div>
          <div className={demo.phone}>
            <UserStoreContext value={person}>
              <HomeScreen />
            </UserStoreContext>
            <p className={designCaption}>
              ホーム画面のウィジェット。アプリで入力すると、すぐに変わります。
            </p>
          </div>
          <VariantPanel
            onChange={(key, value) => {
              if (key === "scheduleSample") {
                startOver(value as DesignVariants["scheduleSample"]);
              }
              // The グループ sample switch puts the sample groups back, or
              // leaves you in none.
              if (key === "groupSample") {
                person.setState({
                  groups: value === "some" ? sampleGroups() : [],
                });
              }
              if (key === "patternSample") {
                person.setState({
                  patterns: samplePatterns(
                    value as DesignVariants["patternSample"]
                  ),
                });
              }
              // The 一緒に働く人 sample switch starts the list over.
              if (key === "memberSample") {
                person.setState({
                  coworkers: value === "some" ? sampleCoworkers : [],
                });
              }
              void navigate({
                replace: true,
                resetScroll: false,
                search: (previous) => ({ ...previous, [key]: value }),
              });
            }}
            variants={variants}
          />
        </div>
      </DesignProviders>
    </DesignPage>
  );
}
