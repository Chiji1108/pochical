import type { FC, ReactNode } from "react";
import { View } from "react-native";
import type { WeekStartsOn } from "@/lib/app-settings";
import { getWeekDates } from "@/lib/date";
import { cn } from "@/lib/utils";

type WeekRowProps = {
  className?: string;
  date?: Date;
  weekStartsOn: WeekStartsOn;
  children: (date: Date) => ReactNode;
};

export const WeekRow: FC<WeekRowProps> = ({
  date = new Date(),
  weekStartsOn,
  children,
  className,
}) => (
  <View className={cn("flex flex-row", className)}>
    {getWeekDates(date, { weekStartsOn }).map((weekDate) => (
      <View
        className="flex-1 items-center justify-center text-center"
        key={weekDate.toISOString()}
      >
        {children(weekDate)}
      </View>
    ))}
  </View>
);
