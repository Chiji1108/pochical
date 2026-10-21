import { Time } from "@internationalized/date";
import { useMemo, useState } from "react";
import {
  DateInput,
  DateSegment,
  I18nProvider,
  TimeField as AriaTimeField,
} from "react-aria-components";

import { clockOf } from "../lib/design-days";

// TimeField's working part (design-ui.tsx), in a module of its own:
// React Aria is a large part of what a calendar needs, and times are only
// set once a sheet opens, so it loads then instead of with every page.

// "9:00" as React Aria's Time, and back.
function timeOf(text: string) {
  const { hours, minutes } = clockOf(text);
  return new Time(hours, minutes);
}
function timeText(time: Time) {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export default function AriaTimeInput({
  label,
  value,
  onValueChange,
  fieldClassName,
  segmentClassName,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  fieldClassName: string;
  segmentClassName: string;
}) {
  // A part cleared while being retyped leaves the time as it was (React
  // Aria sends only whole times); left unfinished, the field shows that
  // time again.
  const [shown, setShown] = useState(0);
  const time = useMemo(() => timeOf(value), [value]);
  return (
    <I18nProvider locale="ja-JP">
      <AriaTimeField
        aria-label={label}
        hourCycle={24}
        key={shown}
        onBlur={() => {
          setShown(shown + 1);
        }}
        onChange={(next) => {
          if (next) {
            onValueChange(timeText(next));
          }
        }}
        value={time}
      >
        <DateInput className={fieldClassName}>
          {(segment) => (
            <DateSegment className={segmentClassName} segment={segment} />
          )}
        </DateInput>
      </AriaTimeField>
    </I18nProvider>
  );
}
