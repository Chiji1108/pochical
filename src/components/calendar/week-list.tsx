import type { FC, ReactNode } from "react";
import { View } from "react-native";
import type { WeekStartsOn } from "@/lib/app-settings";
import { getWeeksOfMonth } from "@/lib/date";
import { WeekRow } from "./week-row";

type WeekListProps = {
  weekStartsOn?: WeekStartsOn;
  yearMonth: Date;
  children: (date: Date) => ReactNode;
};

export const WeekList: FC<WeekListProps> = ({
  weekStartsOn = 0,
  yearMonth,
  children,
}) => {
  const weeks = getWeeksOfMonth(yearMonth, { weekStartsOn });

  return (
    <View className="flex flex-col">
      {weeks.map((week) => (
        <WeekRow
          date={week}
          key={week.toISOString()}
          weekStartsOn={weekStartsOn}
        >
          {children}
        </WeekRow>
      ))}
    </View>
  );
};
