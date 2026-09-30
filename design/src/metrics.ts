// Sizes in points (px on the web, pt on iOS, dp on Android).

// Gaps, paddings and margins are multiples of this, so pieces line up;
// 1 and 2 are left for hairlines and nudges.
export const SPACING_STEP = 4;
export const HAIRLINE_MAX = 2;

// The corners a piece may take, by size. A piece picks one for its role
// (a list is 2xl, a sheet 4xl, a button full); `full` ends a bar or
// button in half circles, as SwiftUI's Capsule and Compose's CircleShape
// do, and `circle` rounds a square into one.
export const radii = {
  "2xl": 24,
  "2xs": 2,
  "3xl": 28,
  "4xl": 32,
  full: 999,
  lg: 16,
  md: 12,
  sm: 8,
  xl: 20,
  xs: 4,
} as const;

export const sizes = {
  // Small actions, like a chip's button.
  action: 40,
  // A button's height.
  control: 52,
  // The least a tap target takes, as iOS's 44pt.
  touch: 44,
} as const;

// Hovered and pressed: the accent laid over whatever is under at these
// opacities, as Material's state layers, rather than more colors for a
// テーマ to set.
export const stateLayers = { hover: 0.12, pressed: 0.16 } as const;

// Pochical's own motion, as springs without bounce: SwiftUI's
// .spring(duration:bounce:) and Motion's visualDuration, the time the
// eye reads it to take. What the OS moves itself (sheets, menus, pushes)
// is left to it.
export const springs = {
  // Smaller pieces going with it: a name rolling, the composer's tools.
  quick: { bounce: 0, duration: 0.25 },
  // The month folding into a week, a page settling after a swipe.
  standard: { bounce: 0, duration: 0.3 },
} as const;
