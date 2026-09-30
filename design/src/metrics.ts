// Sizes in points (px on the web, pt on iOS, dp on Android).

// Gaps, paddings and margins are multiples of this, so pieces line up;
// 1 and 2 are left for hairlines and nudges.
export const SPACING_STEP = 4;
export const HAIRLINE_MAX = 2;

// The corners a piece may take; 999 is a round-ended pill.
export const radii = [0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 999] as const;

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
