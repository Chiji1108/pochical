import type { FC, ReactNode } from "react";
import { View } from "react-native";
import { getWeekDates } from "@/lib/date";

type WeekRowProps = {
  date?: Date;
  children: (date: Date) => ReactNode;
};

export const WeekRow: FC<WeekRowProps> = ({ date = new Date(), children }) => (
  <View className="flex flex-row">
    {getWeekDates(date).map((weekDate, index) => (
      <View
        className="flex-1 items-center justify-center text-center"
        // biome-ignore lint/suspicious/noArrayIndexKey: <wip for better key>
        key={index}
      >
        {children(weekDate)}
      </View>
    ))}
  </View>
);
