import { reviewRules } from "@pochical/design/review";

// Whether the apps may ask the store for its review prompt now
// (spec/review.md), as the native apps work it out; the web shows no
// prompt itself, and spec/vectors/review.json checks this against them.
// Days are local calendar days written YYYY-MM-DD.

// What a device keeps about its own use, and nothing more.
export type ReviewHistory = {
  firstOpened: string;
  lastOpened: string;
  openDays: number;
  openMonths: number;
  lastAsked?: { day: string; version: string };
};

const DAY_MILLISECONDS = 86_400_000;

const utcOf = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
};

const daysBetween = (from: string, to: string) =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MILLISECONDS);

// YYYY-MM of a day.
const monthOf = (day: string) => day.slice(0, "YYYY-MM".length);

// The history after the app was opened on a day: a day already counted
// counts once, and a month once.
export function openedOn(
  history: ReviewHistory | undefined,
  day: string
): ReviewHistory {
  if (!history) {
    return { firstOpened: day, lastOpened: day, openDays: 1, openMonths: 1 };
  }
  if (history.lastOpened === day) {
    return history;
  }
  return {
    ...history,
    lastOpened: day,
    openDays: history.openDays + 1,
    openMonths:
      history.openMonths +
      (monthOf(history.lastOpened) === monthOf(day) ? 0 : 1),
  };
}

// Whether to ask now, at a moment the spec allows: just after the person
// finished putting something on their days.
export function mayAskForReview({
  history,
  today,
  version,
  troubled,
}: {
  history: ReviewHistory;
  today: string;
  version: string;
  // Something went wrong since the app came to the front.
  troubled: boolean;
}) {
  const { lastAsked } = history;
  const usedForAWhile =
    daysBetween(history.firstOpened, today) >=
      reviewRules.minDaysSinceFirstOpen &&
    history.openDays >= reviewRules.minOpenDays &&
    history.openMonths >= reviewRules.minOpenMonths;
  const askedLongAgo =
    !lastAsked ||
    (lastAsked.version !== version &&
      daysBetween(lastAsked.day, today) >= reviewRules.minDaysBetweenAsks);
  return usedForAWhile && askedLongAgo && !troubled;
}
