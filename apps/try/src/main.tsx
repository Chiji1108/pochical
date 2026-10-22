import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { useSettings } from "@pochical/prototype/lib/design-settings-store";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { TryPage } from "./try-page";

// The store waits to load the saved settings for pages drawn on a server
// first. Nothing is drawn before this script, so they load before the
// first render, which then draws the saved テーマ and 外観.
void useSettings.persist.rehydrate();

const root = document.querySelector("#root");
if (!root) {
  throw new Error("index.html has no #root");
}
createRoot(root).render(
  <>
    <link href={siteIcon} rel="icon" type="image/png" />
    {/* Movement follows the device's 視差効果を減らす setting. */}
    <MotionConfig reducedMotion="user">
      <TryPage />
    </MotionConfig>
  </>
);
