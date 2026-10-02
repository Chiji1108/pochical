import {
  dateKey,
  defaultHolidaysOff,
  giveDaysToOrder,
  holidayShiftOf,
  withOrder,
} from "./design-days";
import type { RepeatRule, Schedule } from "./design-days";
import { bookOf, samePattern } from "./design-patterns";
import type { Pattern } from "./design-patterns";
import { useUser } from "./design-user-store";

// What the settings change about how someone works: a repeating order
// added or corrected, a new job with its own patterns, and holidays off.
// `schedule` is the days as they show, to see which patterns are on days
// before a change.
export function useWorkChanges(schedule: Schedule) {
  const ownPatterns = useUser((state) => state.patterns);
  const setPatterns = useUser((state) => state.setPatterns);
  const rules = useUser((state) => state.rules);
  const setRules = useUser((state) => state.setRules);
  const setOwnDays = useUser((state) => state.setSchedule);
  // From its start, the new order shows in place of the one before: the
  // days give their own shifts and times back to it, keeping memos and
  // people, and an empty sequence leaves a roster to fill in. A new job
  // brings its own patterns, so it passes them in.
  function fillRule(rule: RepeatRule, patterns = ownPatterns) {
    const holidaysOff =
      rule.sequence.length > 0 &&
      (rule.holidaysOff ??
        defaultHolidaysOff(
          rule.sequence,
          rule.anchor ?? rule.start,
          bookOf(patterns)
        ));
    const holidayShift = holidaysOff ? holidayShiftOf(patterns) : undefined;
    setOwnDays((previous) => giveDaysToOrder(previous, rule.start));
    return rule.sequence.length > 0
      ? { ...rule, holidayShift, holidaysOff }
      : rule;
  }
  function applyRule(rule: RepeatRule, patterns?: Pattern[]) {
    const filled = fillRule(rule, patterns);
    setRules((previous) => withOrder(previous, filled));
  }
  // Corrects the rule in use from its own start, rather than adding one.
  function fixRule(rule: RepeatRule) {
    const filled = fillRule(rule);
    setRules((previous) => withOrder(previous.slice(0, -1), filled));
  }
  // The new job's patterns take over, keeping any old one still on a day
  // before the switch so those days keep their marks. A ready-made one the
  // person has changed, still on those days, stays theirs; the new job's
  // comes in under an id of its own, and its order uses that.
  function changeJob(job: { patterns: Pattern[]; rule: RepeatRule }) {
    const from = dateKey(job.rule.start);
    const usedBefore = (id: string) =>
      Object.entries(schedule).some(
        ([key, entry]) => key < from && entry?.shift === id
      );
    const renamed = new Map<string, string>();
    for (const pattern of job.patterns) {
      const own = ownPatterns.find((item) => item.id === pattern.id);
      if (own && usedBefore(own.id) && !samePattern(own, pattern)) {
        renamed.set(pattern.id, crypto.randomUUID());
      }
    }
    const renameOf = (id: string) => renamed.get(id) ?? id;
    const incoming = job.patterns.map((pattern) => ({
      ...pattern,
      id: renameOf(pattern.id),
      nextDay: pattern.nextDay && renameOf(pattern.nextDay),
    }));
    const kept = ownPatterns.filter(
      (pattern) =>
        !incoming.some((next) => next.id === pattern.id) &&
        usedBefore(pattern.id)
    );
    const patterns = [...incoming, ...kept];
    setPatterns(patterns);
    applyRule(
      { ...job.rule, sequence: job.rule.sequence.map(renameOf) },
      patterns
    );
  }
  // Holidays follow the order in use: on, they take the day off now first;
  // off, they show the sequence again. Days the person changed keep theirs.
  function setHolidaysOff(holidaysOff: boolean) {
    const rule = rules.at(-1);
    if (!rule) {
      return;
    }
    const holidayShift = holidaysOff ? holidayShiftOf(ownPatterns) : undefined;
    if (holidaysOff && !holidayShift) {
      return;
    }
    setRules((previous) => [
      ...previous.slice(0, -1),
      { ...rule, holidayShift, holidaysOff },
    ]);
  }
  return { applyRule, changeJob, fixRule, setHolidaysOff };
}
