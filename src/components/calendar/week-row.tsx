import type { FC, ReactNode } from "react";
import { View } from "react-native";
import { getWeekDates } from "@/lib/date";
import { cn } from "@/lib/utils";

type WeekRowProps = {
  className?: string;
  date?: Date;
  children: (date: Date) => ReactNode;
};

export const WeekRow: FC<WeekRowProps> = ({
  date = new Date(),
  children,
  className,
}) => (
  <View className={cn("flex flex-row", className)}>
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
