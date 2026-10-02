# Asking for a review

The apps ask the store for its review prompt (iOS `requestReview`, Android's In-App Review API) only of people who have been using Pochical for a while, and only just after they finished putting something in. The numbers are `reviewRules` in `design/src/review.ts`; `spec/vectors/review.json` pins the decision.

## Using it for a while

All of these hold:

- The app was first opened `minDaysSinceFirstOpen` days ago or more.
- It was opened on `minOpenDays` separate days or more, today among them, and those days fall in `minOpenMonths` calendar months or more.
- The apps have not asked in this version of the app.
- They last asked `minDaysBetweenAsks` days ago or more, or never.
- Nothing went wrong since the app came to the front (a save or sync that failed, an error shown).

Days are local calendar days. How the shifts are entered does not matter: a person on a repeating order and one entering each month by hand are counted the same way.

## The moment

The apps ask right after the person finished putting something on their days, once the sheet or tray has closed:

- closing ポチポチ input after entering or changing at least one day;
- closing a day after changing its shift or hours (a day off taken, a swap);
- saving a day's memo.

Never on opening the app, while looking through months, from a widget, in a group or its chat, or in the middle of anything else. Someone who only looks and never changes a day is never asked; the settings' review row is there for them.

## What is kept

The first day the app was opened, the last day and how many separate days and months it was opened on, and the date and app version of the last ask, on the device only. Nothing of it is synced or sent. Each ask is recorded as asked even though the store decides itself whether to show its prompt and does not say whether it did. The apps never ask anything of their own before it, such as whether the person likes the app.
