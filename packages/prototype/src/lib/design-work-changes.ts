import { fitsPatternOrder, fitsRepeatOrders } from "@pochical/design/values";

import {
  dateKey,
  defaultHolidaysOff,
  giveDaysToOrder,
  holidayChoiceOf,
  withOrder,
  withOrderPut,
  withoutOrder,
} from "./design-days";
import type { RepeatRule, Schedule } from "./design-days";
import { bookOf, patternsForJob, patternsInUse } from "./design-patterns";
import type { Pattern } from "./design-patterns";
import { useUser } from "./design-user-store";

// What the settings change about how someone works: a repeating order
// put in, set again, moved or taken out, and a new job with its own
// patterns.
// `schedule` is the days as they show, to see which patterns are on days
// before a change.
export function useWorkChanges(schedule: Schedule) {
  const ownPatterns = useUser((state) => state.patterns);
  const rules = useUser((state) => state.rules);
  const setPatterns = useUser((state) => state.setPatterns);
  const setRules = useUser((state) => state.setRules);
  const setOwnDays = useUser((state) => state.setSchedule);
  // From its start, the new order shows in place of the one before: the
  // days give their own shifts and times back to it, keeping memos and
  // people, and an empty sequence leaves a roster to fill in. A new job
  // brings its own patterns, so it passes them in.
  // An order with the pattern its holidays take, when they are off.
  function withHolidays(rule: RepeatRule, patterns = ownPatterns) {
    const holidaysOff =
      rule.sequence.length > 0 &&
      (rule.holidaysOff ??
        defaultHolidaysOff(
          rule.sequence,
          rule.anchor ?? rule.start,
          bookOf(patterns)
        ));
    // The pattern the period keeps stays, even one no longer counting as off.
    const { shift: holidayShift } = holidayChoiceOf(
      patternsInUse(patterns),
      holidaysOff,
      rule.holidayShift
    );
    // Off only with a pattern for them to take.
    return rule.sequence.length > 0
      ? {
          ...rule,
          holidayShift,
          holidaysOff: holidaysOff && holidayShift !== undefined,
        }
      : rule;
  }
  function applyRule(rule: RepeatRule, patterns: Pattern[]) {
    setOwnDays((previous) => giveDaysToOrder(previous, rule.start));
    const filled = withHolidays(rule, patterns);
    setRules((previous) => withOrder(previous, filled));
  }
  // 繰り返し's periods: one put in, set again, or moved (`replacing` its
  // old start), the others kept, and the days the person entered kept
  // over it, as they are on any order.
  function putOrder(rule: RepeatRule, replacing?: Date) {
    const put = withHolidays(rule);
    setRules((previous) => withOrderPut(previous, put, replacing));
  }
  function removeOrder(start: Date) {
    setRules((previous) => withoutOrder(previous, start));
  }
  // The new job's patterns take over, keeping any old one still on a day
  // before the switch so those days keep their marks. A ready-made one the
  // person has changed, still on those days, stays theirs; the new job's
  // comes in under an id of its own, and its order uses that. Patterns or
  // orders past what the server takes change nothing, the days included,
  // and it says false (spec/shift-patterns.md, Changing jobs).
  function changeJob(job: { patterns: Pattern[]; rule: RepeatRule }) {
    const from = dateKey(job.rule.start);
    const { patterns, sequence } = patternsForJob({
      incoming: job.patterns,
      newId: () => crypto.randomUUID(),
      own: ownPatterns,
      sequence: job.rule.sequence,
      usedBefore: (id) =>
        Object.entries(schedule).some(
          ([key, entry]) => key < from && entry?.shift === id
        ),
    });
    const rule = { ...job.rule, sequence };
    if (
      !(
        fitsPatternOrder(patterns.map(({ id }) => id)) &&
        fitsRepeatOrders(withOrder(rules, rule))
      )
    ) {
      return false;
    }
    setPatterns(patterns);
    applyRule(rule, patterns);
    return true;
  }
  return { changeJob, putOrder, removeOrder };
}
