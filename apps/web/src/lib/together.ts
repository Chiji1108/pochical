// Days everyone is off together (みんな休み), from each one's day: true
// where it is a day off, false where it is a work day, and undefined where
// they have not entered it. The group's screens and the widgets' 次の休み
// both count by these (spec/vectors/together.json, spec/vectors/widgets.json).
export type OffOrNot = boolean | undefined;

// Everyone is off. A day someone has not entered never counts, since
// nobody knows yet.
export function allOff(days: readonly OffOrNot[]) {
  return days.every((off) => off === true);
}

// Everyone may yet be off: no one who has entered the day works, but
// someone has not entered it.
export function mayAllBeOff(days: readonly OffOrNot[]) {
  return days.includes(undefined) && days.every((off) => off !== false);
}
