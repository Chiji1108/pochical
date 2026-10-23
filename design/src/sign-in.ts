// The ways in (spec/sync-protocol.md, Signing in), each in its provider's
// own colors as its guidelines ask. Sign in with Apple's button is the
// system's on both platforms and draws its own; Google's is drawn by the
// apps, white with a gray outline in light mode and near-black in dark
// (Google's sign-in branding guidelines).
export const googleButton = {
  dark: { fill: "#131314", stroke: "#8e918f", text: "#e3e3e3" },
  light: { fill: "#ffffff", stroke: "#747775", text: "#1f1f1f" },
} as const;
