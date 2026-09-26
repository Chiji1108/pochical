import type { FC, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { WeekStartsOn } from "@/lib/app-settings";
import { getWeekDates } from "@/lib/date";

type WeekRowProps = {
  date?: Date;
  weekStartsOn: WeekStartsOn;
  children: (date: Date) => ReactNode;
};

export const WeekRow: FC<WeekRowProps> = ({
  date = new Date(),
  weekStartsOn,
  children,
}) => (
  <View style={styles.row}>
    {getWeekDates(date, { weekStartsOn }).map((weekDate) => (
      <View key={weekDate.toISOString()} style={styles.cell}>
        {children(weekDate)}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  cell: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
  },
});
