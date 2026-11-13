import { appConfig } from "@pochical/styled-system/config";

// How /next's pieces move as its story is scrolled (pages/next.astro):
// each runs on the story's own timeline over the part of it the piece
// names, so where the page is scrolled to says how far along each is, and
// none runs by the clock. Only opacity and transforms, which a browser
// moves without laying the page out again.
const storyKeyframes = {
  // Words or a screen that are there from the start, leaving upward.
  storyLeave: {
    "0%, 55%": { opacity: 1, transform: "none" },
    "100%": { opacity: 0, transform: "translateY(-16px)" },
  },
  // A part's words: in from below, read, out upward.
  storyWords: {
    "0%": { opacity: 0, transform: "translateY(16px)" },
    "100%": { opacity: 0, transform: "translateY(-16px)" },
    "12%, 88%": { opacity: 1, transform: "none" },
  },
  // The last part's words, which stay.
  storyArrive: {
    from: { opacity: 0, transform: "translateY(16px)" },
    to: { opacity: 1, transform: "none" },
  },
  // The phone going small into the wall of widgets behind it.
  storyShrink: {
    from: { opacity: 1, transform: "none" },
    to: { opacity: 0, transform: "scale(0.55)" },
  },
  // The wall, coming up close from behind the phone, lying still, and
  // drawing back as the next phone rises.
  storyWall: {
    "0%": { opacity: 0, transform: "scale(1.25)" },
    "100%": { opacity: 0, transform: "scale(0.92)" },
    "35%": { opacity: 1, transform: "scale(1)" },
    "75%": { opacity: 1, transform: "scale(0.98)" },
  },
  // A phone rising into place, and later giving way to the next where it
  // stands.
  storyPhone: {
    "0%": { opacity: 0, transform: "translateY(64px)" },
    "100%": { opacity: 0, transform: "none" },
    "14%, 86%": { opacity: 1, transform: "none" },
  },
  // A phone taking the place of the one before, where it stands.
  storyTake: { from: { opacity: 0 }, to: { opacity: 1 } },
  // A phone not yet come to: far under the screen until its part of the
  // story is near, so its island (client:visible) takes its code then and
  // not when the page opens. It steps into place while still unseen.
  storyWait: {
    from: { translate: "0 200vh" },
    to: { translate: "0 0" },
  },
  // A phone taller than its room going up through it to its foot, and
  // the fade where it is cut going from its foot to its top (next.astro,
  // cropped).
  storyFollow: {
    to: { transform: "translateY(min(0px, var(--phone-room) - 844px))" },
  },
  storyFade: {
    from: { maskPosition: "0 calc(-1 * var(--fade))" },
    to: { maskPosition: "0 0" },
  },
  // The sky turning from morning toward evening across the story.
  storySky: {
    from: { filter: "hue-rotate(0deg)" },
    to: { filter: "hue-rotate(-70deg)" },
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
