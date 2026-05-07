import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { addMonths, subMonths } from "date-fns";
import { Button } from "heroui-native/button";
import type { FC } from "react";
import { Text, View } from "react-native";
import { withUniwind } from "uniwind";
import { cn } from "@/lib/utils";

type CalendarHeaderProps = {
  setYearMonth: (date: Date) => void;
  yearMonth: Date;
  className?: string;
};

const StyledFontAwesome6 = withUniwind(FontAwesome6);

export const CalendarHeader: FC<CalendarHeaderProps> = ({
  yearMonth,
  setYearMonth,
  className,
}) => (
  <View
    className={cn(
      "flex flex-row items-center justify-between gap-4 p-4",
      className
    )}
  >
    <Button
      isIconOnly
      onPress={() => {
        setYearMonth(subMonths(yearMonth, 1));
      }}
      variant="outline"
    >
      <StyledFontAwesome6
        className="text-foreground"
        name="chevron-left"
        size={24}
      />
    </Button>
    <Text className="font-bold text-2xl text-foreground">
      {yearMonth.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })}
    </Text>
    <Button
      isIconOnly
      onPress={() => {
        setYearMonth(addMonths(yearMonth, 1));
      }}
      variant="outline"
    >
      <StyledFontAwesome6
        className="text-foreground"
        name="chevron-right"
        size={24}
      />
    </Button>
  </View>
);
