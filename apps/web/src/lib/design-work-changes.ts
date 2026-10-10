import {
  dateKey,
  defaultHolidaysOff,
  giveDaysToOrder,
  holidayShiftOf,
  withOrder,
  withOrderPut,
  withoutOrder,
} from "./design-days";
import type { RepeatRule, Schedule } from "./design-days";
import { bookOf, patternsForJob } from "./design-patterns";
import type { Pattern } from "./design-patterns";
import { useUser } from "./design-user-store";

// What the settings change about how someone works: a repeating order
// put in, set again, moved or taken out, and a new job with its own
// patterns.
// `schedule` is the days as they show, to see which patterns are on days
// before a change.
export function useWorkChanges(schedule: Schedule) {
  const ownPatterns = useUser((state) => state.patterns);
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
    const holidayShift = holidaysOff ? holidayShiftOf(patterns) : undefined;
    return rule.sequence.length > 0
      ? { ...rule, holidayShift, holidaysOff }
      : rule;
  }
  function fillRule(rule: RepeatRule, patterns = ownPatterns) {
    setOwnDays((previous) => giveDaysToOrder(previous, rule.start));
    return withHolidays(rule, patterns);
  }
  function applyRule(rule: RepeatRule, patterns?: Pattern[]) {
    const filled = fillRule(rule, patterns);
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
  // comes in under an id of its own, and its order uses that.
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
    setPatterns(patterns);
    applyRule({ ...job.rule, sequence }, patterns);
  }
  return { changeJob, putOrder, removeOrder };
}
