import type { FC, ReactNode } from "react";
import { View } from "react-native";
import { getWeeksOfMonth } from "@/lib/date";
import { WeekRow } from "./week-row";

type WeekListProps = {
  yearMonth: Date;
  children: (date: Date) => ReactNode;
};

export const WeekList: FC<WeekListProps> = ({ yearMonth, children }) => {
  const weeks = getWeeksOfMonth(yearMonth);

  return (
    <View className="flex flex-col">
      {weeks.map((week, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
        <WeekRow date={week} key={index}>
          {children}
        </WeekRow>
      ))}
    </View>
  );
};
