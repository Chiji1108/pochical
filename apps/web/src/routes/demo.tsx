import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { sampleGroups } from "../components/design-group";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle } from "../components/design-theme";
import { VariantPanel } from "../components/design-variant-panel";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import type { DesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({
    ...pageMeta("デモ", "ブラウザで触れるポチカルの試作", "/demo", true),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
  validateSearch: parseDesignVariants,
});

// A sample person, starting over with the sample or with nothing entered.
function makePerson(
  sample: DesignVariants["scheduleSample"],
  members: DesignVariants["memberSample"],
  groups: DesignVariants["groupSample"]
) {
  return createUserStore({
    coworkers: members === "some" ? sampleCoworkers : [],
    groups: groups === "some" ? sampleGroups() : [],
    schedule: sample === "empty" ? {} : initialDesignSchedule(),
  });
}

// The app to touch: one phone, one person, with the open design choices
// beside it. The design documents live under /design.
function DemoPage() {
  const variants = Route.useSearch();
  const navigate = Route.useNavigate();
  const theme = useDesignTheme();
  const [person, setPerson] = useState(() =>
    makePerson(
      variants.scheduleSample,
      variants.memberSample,
      variants.groupSample
    )
  );
  // Starting over remounts the phone, so its screens reset too.
  const [version, setVersion] = useState(0);
  const startOver = (sample: DesignVariants["scheduleSample"]) => {
    setPerson(makePerson(sample, variants.memberSample, variants.groupSample));
    setVersion((value) => value + 1);
  };
  return (
    <main
      className="design-page demo-page"
      id="main"
      style={themeStyle(theme, "light")}
    >
      <div className="design-toolbar">
        <Link to="/">
          <ArrowLeft aria-hidden="true" size={16} /> ポチカル
        </Link>
        <div className="design-toolbar-actions">
          <Link className="design-toolbar-link" to="/design">
            <BookOpen aria-hidden="true" size={14} /> デザイン資料
          </Link>
          <button
            onClick={() => {
              startOver(variants.scheduleSample);
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} /> サンプルに戻す
          </button>
        </div>
      </div>
      <DesignProviders>
        <div className="demo-layout">
          <div className="demo-phone" key={version}>
            <UserStoreContext value={person}>
              <DesignCalendar
                initialEditing={false}
                pendingInvite={variants.inviteLink === "opened"}
                variants={variants}
              />
            </UserStoreContext>
            <p className="design-caption">
              実際にタップして試せます。架空のサンプルで、再読み込みすると元に戻ります。
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
    </main>
  );
}
