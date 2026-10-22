import { DesignApp } from "@pochical/prototype/components/design-app";
import {
  DesignProviders,
  useDesignTheme,
} from "@pochical/prototype/components/design-providers";
import { pageStyle } from "@pochical/prototype/components/design-theme";
import {
  initialDesignSchedule,
  patternSets,
} from "@pochical/prototype/lib/design-days";
import type { RepeatRule } from "@pochical/prototype/lib/design-days";
import { useDevice } from "@pochical/prototype/lib/design-device";
import { sampleGroups } from "@pochical/prototype/lib/design-group-samples";
import { presetList } from "@pochical/prototype/lib/design-patterns";
import { sampleOrder } from "@pochical/prototype/lib/design-sample-person";
import { supportChatOf } from "@pochical/prototype/lib/design-support";
import {
  createUserStore,
  sampleProfile,
  sampleCoworkers,
  UserStoreContext,
} from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import type { DesignVariants } from "@pochical/prototype/lib/design-variants";
import { wallpaperSamples } from "@pochical/prototype/lib/material-you";
import { css } from "@pochical/styled-system/css";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { HomeScreen } from "../components/design-home-screen";
import {
  designCaption,
  DesignPage,
  DesignToolbar,
  toolbarAction,
} from "../components/design-page";
import { VariantPanel } from "../components/design-variant-panel";
import { pageMeta } from "../lib/page-meta";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({
    ...pageMeta("デモ", "ブラウザで触れるポチカルの試作"),
  }),
  validateSearch: parseDesignVariants,
});

// The sample patterns: a few, or more than ポチポチ入力 shows on one page.
function samplePatterns(count: DesignVariants["patternSample"]) {
  return presetList(patternSets[count === "many" ? 13 : 4]);
}

// The sample orders, around the prototype's today (9/24): one from 4/1,
// and with it one over since 1/1 and one to start on 11/1.
function sampleRules(sample: DesignVariants["repeatSample"]): RepeatRule[] {
  if (sample === "none") {
    return [];
  }
  if (sample === "now") {
    return [sampleOrder];
  }
  return [
    { sequence: ["day", "night", "after", "off"], start: new Date(2026, 0, 1) },
    sampleOrder,
    {
      holidaysOff: true,
      sequence: ["night", "after", "off"],
      start: new Date(2026, 10, 1),
    },
  ];
}

// Someone with no usual name or photo yet.
const noProfile = { name: "" };

// A sample person, starting over with the sample or with nothing entered.
function makePerson(
  {
    memberSample,
    profileSample,
    groupSample,
    patternSample,
    repeatSample,
    supportSample,
  }: DesignVariants,
  sample: DesignVariants["scheduleSample"]
) {
  return createUserStore({
    coworkers: memberSample === "some" ? sampleCoworkers : [],
    groups: groupSample === "some" ? sampleGroups() : [],
    patterns: samplePatterns(patternSample),
    ...(profileSample === "none" ? { profile: noProfile } : {}),
    rules: sampleRules(repeatSample),
    schedule: sample === "empty" ? {} : initialDesignSchedule(),
    support: supportChatOf(supportSample),
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
    makePerson(variants, variants.scheduleSample)
  );
  // Starting over remounts the phone, so its screens reset too.
  const [version, setVersion] = useState(0);
  const startOver = (sample: DesignVariants["scheduleSample"]) => {
    setPerson(makePerson(variants, sample));
    setVersion((value) => value + 1);
  };
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar>
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
              <DesignApp
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
              if (key === "profileSample") {
                person.setState({
                  profile: value === "none" ? noProfile : sampleProfile,
                });
              }
              if (key === "repeatSample") {
                person.setState({
                  rules: sampleRules(value as DesignVariants["repeatSample"]),
                });
              }
              if (key === "supportSample") {
                person.setState({
                  support: supportChatOf(
                    value as DesignVariants["supportSample"]
                  ),
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
