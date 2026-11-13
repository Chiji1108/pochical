import { appConfig } from "@pochical/styled-system/config";

// How the top page's pieces move as its story is scrolled (pages/index.astro):
// each runs on the story's own timeline over the part of it the piece
// names, so where the page is scrolled to says how far along each is, and
// none runs by the clock. Only opacity and transforms, which a browser
// moves without laying the page out again.
const storyKeyframes = {
  // A card of the page's end, rising into place as it comes onto the screen.
  storyArrive: {
    from: { opacity: 0, transform: "translateY(16px)" },
    to: { opacity: 1, transform: "none" },
  },
  // The phone going small into the wall of widgets behind it, and gone
  // once it is: a piece whose turn is over is not drawn at all, so nothing
  // of it is left on screen.
  storyShrink: {
    from: { opacity: 1, transform: "none" },
    to: { opacity: 0, transform: "scale(0.55)", visibility: "hidden" },
  },
  // The wall, coming up close from behind the phone, lying still, and
  // drawing back as the next phone rises.
  storyWall: {
    "0%": { opacity: 0, transform: "scale(1.25)" },
    "100%": { opacity: 0, transform: "scale(0.92)", visibility: "hidden" },
    "35%": { opacity: 1, transform: "scale(1)" },
    "75%": { opacity: 1, transform: "scale(0.98)" },
  },
  // A phone rising into place. It stays as it is while the next comes in
  // over it, frame on frame, and is gone once that one is all there, so
  // the frame never fades between two screens.
  storyPhone: {
    "0%": { opacity: 0, transform: "translateY(64px)" },
    "100%": { opacity: 1, transform: "none", visibility: "hidden" },
    "14%": { opacity: 1, transform: "none" },
    "99.99%": { opacity: 1, transform: "none", visibility: "visible" },
  },
  // A phone coming in over the one before, where it stands.
  storyTake: { from: { opacity: 0 }, to: { opacity: 1 } },
  // A phone not yet come to: far under the screen until its part of the
  // story is near, so its island (client:visible) takes its code then and
  // not when the page opens. It steps into place while still unseen.
  storyWait: {
    from: { translate: "0 200vh" },
    to: { translate: "0 0" },
  },
  // The hero's phone on a narrow screen, from under the hero's words up
  // into its place.
  storySettle: {
    from: { translate: "0 var(--hero-drop)" },
    to: { translate: "0 0" },
  },
};

// Panda CSS for this app, from @pochical/styled-system's config, its .astro
// pages included.
export default {
  ...appConfig,
  include: [...(appConfig.include ?? []), "./src/**/*.astro"],
  theme: {
    ...appConfig.theme,
    extend: {
      ...appConfig.theme?.extend,
      keyframes: {
        ...appConfig.theme?.extend?.keyframes,
        ...storyKeyframes,
      },
    },
  },
};
