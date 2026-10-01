// What an invitation code is, for every platform: the server issues codes
// of it, and the apps and the site recognize them in links
// (https://pochical.app/invite/{code}). A link is known by its path alone:
// a query a later app or site adds (such as ?hl=ko, the language the
// sender wants its preview in) is ignored, not a reason to turn the link
// away. `mise run gen` writes it out for
// the native apps (Invite.swift, Invite.kt) and as JSON
// (spec/design-tokens.json).
export const inviteRules = {
  // Letters and digits without the look-alikes I, O, l, 0 and 1, so a
  // code read off a screen is typed right: 57 characters.
  codeAlphabet: "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789",
  // 57^8, about 10^14 codes, so guessing a live one is hopeless.
  codeLength: 8,
} as const;

// A whole invitation code, as the site and the server check one.
export const INVITE_CODE = new RegExp(
  `^[${inviteRules.codeAlphabet}]{${inviteRules.codeLength}}$`,
  "u"
);
