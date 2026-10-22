import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { designUrl } from "@pochical/showcase/lib/app-urls";
import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";

export const Route = createRootRoute({
  component: () => (
    <>
      {/* Each page's title and description, which React puts in the head. */}
      <HeadContent />
      {/* Movement follows the device's 視差効果を減らす setting. */}
      <MotionConfig reducedMotion="user">
        <Outlet />
      </MotionConfig>
    </>
  ),
  errorComponent: ({ reset }) => (
    <main id="main">
      <h1>ページを読み込めませんでした。</h1>
      <button onClick={reset} type="button">
        再読み込み
      </button>
    </main>
  ),
  head: () => ({
    links: [{ href: siteIcon, rel: "icon", type: "image/png" }],
  }),
  notFoundComponent: () => (
    <main id="main">
      <h1>ページが見つかりません。</h1>
      <a href={designUrl("/")}>デザイン資料へ</a>
    </main>
  ),
});
