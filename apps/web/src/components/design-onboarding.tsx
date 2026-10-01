import { useContext, useState } from "react";

import type { RepeatRule } from "../lib/design-days";
import { presetList } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import type { UserStore } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import { ProviderButtons, signInMilliseconds } from "./design-account";
import type { AccountProvider } from "./design-account";
import { DARK_DRAWING, useAppIcons } from "./design-app-icon";
import { DesignCalendar } from "./design-calendar";
import { Phone } from "./design-phone";
import { ColorSchemeContext, useThemeStyle } from "./design-theme";
import { Button, pushToBottom } from "./design-ui";
import {
  designMonth,
  onboarding,
  rotationTemplates,
  StepHeader,
  WorkSetupSteps,
} from "./design-work-setup";
import type { Step, WorkSetup } from "./design-work-setup";

// The order a new person starts on: from the month before the one shown,
// or from its first day when that is earlier, counted from its first day.
function startRules(sequence?: Shift[], anchor?: Date): RepeatRule[] {
  if (!(sequence && anchor)) {
    return [];
  }
  const monthBefore = new Date(
    designMonth.getFullYear(),
    designMonth.getMonth() - 1,
    1
  );
  const start = anchor < monthBefore ? anchor : monthBefore;
  return [{ anchor, sequence, start }];
}

// The patterns and order a returning account brings back in the prototype.
const restoredSetup: WorkSetup = {
  anchor: new Date(2026, 7, 30),
  patternKeys: ["day", "night", "after", "off"],
  sequence: ["day", "day", "night", "after", "off", "off"],
};

type Stage = "welcome" | "login" | "setup";

// First run: a welcome with a way back in for people who already have an
// account, then the work questions. An invitation opened on the way is
// asked about once the calendar is ready, like any other time.
// A screen to open on, for the flow diagrams on /design/flows.
export type OnboardingScreen =
  | "welcome"
  | "login"
  | "kind"
  | "rotation"
  | "anchor";

function stepOf(screen: OnboardingScreen): Step | undefined {
  if (screen === "kind" || screen === "rotation") {
    return { name: screen };
  }
  if (screen === "anchor") {
    const template = rotationTemplates[1] ?? rotationTemplates[0];
    return template
      ? { name: "anchor", sequence: template.sequence ?? [], template }
      : undefined;
  }
  return undefined;
}

export function DesignOnboarding({
  variants,
  initialScreen = "welcome",
}: {
  variants: DesignVariants;
  initialScreen?: OnboardingScreen;
}) {
  const themeStyle = useThemeStyle();
  const [stage, setStage] = useState<Stage>(() => {
    if (initialScreen === "welcome" || initialScreen === "login") {
      return initialScreen;
    }
    return "setup";
  });
  // The person the answers make: a store of their own, with a line under
  // their calendar when there is something to say.
  const [finished, setFinished] = useState<{
    person: UserStore;
    note?: string;
  }>();

  function finish({ patternKeys, sequence, anchor }: WorkSetup, note?: string) {
    setFinished({
      note,
      person: createUserStore({
        patterns: presetList(patternKeys),
        rules: startRules(sequence, anchor),
      }),
    });
  }

  if (finished) {
    return (
      <div className={onboarding.finished}>
        <UserStoreContext value={finished.person}>
          <DesignCalendar
            initialEditing={false}
            pendingInvite={variants.inviteLink === "opened"}
            variants={variants}
          />
        </UserStoreContext>
        {finished.note && (
          <p className={onboarding.finishedNote}>{finished.note}</p>
        )}
        <button
          className={onboarding.restart}
          onClick={() => {
            setFinished(undefined);
            setStage("welcome");
          }}
          type="button"
        >
          最初からやり直す
        </button>
      </div>
    );
  }

  return (
    <Phone style={themeStyle}>
      <div className={onboarding.content}>
        {stage === "welcome" && (
          <WelcomeStep
            onLogin={() => {
              setStage("login");
            }}
            onStart={() => {
              setStage("setup");
            }}
          />
        )}
        {stage === "login" && (
          <LoginStep
            onBack={() => {
              setStage("welcome");
            }}
            onRestore={() => {
              finish(restoredSetup, "前の端末のデータを戻しました（見本）。");
            }}
          />
        )}
        {stage === "setup" && (
          <WorkSetupSteps
            finishLabel="はじめる"
            initialStep={stepOf(initialScreen)}
            onBack={() => {
              setStage("welcome");
            }}
            onFinish={(setup) => {
              finish(setup);
            }}
          />
        )}
      </div>
    </Phone>
  );
}

function WelcomeStep({
  onStart,
  onLogin,
}: {
  onStart: () => void;
  onLogin: () => void;
}) {
  const scheme = useContext(ColorSchemeContext);
  const icons = useAppIcons();
  // In dark, the dog as the dark home screen shows the icon: a light dog in
  // dark lines, painted once the drawing has loaded.
  const darkDrawing = icons[DARK_DRAWING];
  return (
    <div className={onboarding.welcome}>
      <div className={onboarding.intro}>
        {/* The app icon's poodle, just the drawing: the one who was tapped on
            the home screen, over the name it gives. */}
        {scheme === "dark" ? (
          <span
            aria-hidden="true"
            className={onboarding.poodle({ dark: true })}
          >
            {darkDrawing ? (
              <img alt="" height={200} src={darkDrawing} width={200} />
            ) : null}
          </span>
        ) : (
          <img
            alt=""
            className={onboarding.poodle()}
            height={200}
            src="/design/poodle.png"
            width={200}
          />
        )}
        <h3 className={onboarding.name}>ポチカル</h3>
        {/* Each phrase stays whole, so the line breaks after the comma. */}
        <p className={onboarding.lead}>
          <span className={onboarding.phrase}>シフトをポチッと入れて、</span>
          <span className={onboarding.phrase}>
            家族や友達と見せ合えるカレンダーです。
          </span>
        </p>
      </div>
      <div className={onboarding.actions}>
        <Button variant="primary" className={pushToBottom} onClick={onStart}>
          はじめる
        </Button>
        <Button variant="text" onClick={onLogin}>
          アカウントをお持ちの方はログイン
        </Button>
      </div>
    </div>
  );
}

// For someone moving to a new phone: signing in brings their data back
// instead of answering the questions again.
function LoginStep({
  onBack,
  onRestore,
}: {
  onBack: () => void;
  onRestore: () => void;
}) {
  const [busy, setBusy] = useState<AccountProvider>();
  return (
    <>
      <StepHeader
        description="前の端末で使っていたシフトとグループを、そのまま戻します。"
        onBack={onBack}
        title="アカウントでログイン"
      />
      <ProviderButtons
        busy={busy}
        onPick={(provider) => {
          setBusy(provider);
          setTimeout(onRestore, signInMilliseconds);
        }}
      />
      <p className={onboarding.footnote}>
        はじめて使うときは、戻って「はじめる」から始めてください。
      </p>
    </>
  );
}
