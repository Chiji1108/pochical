import { format, isSameDay } from "date-fns";
import { ListGroup, Text } from "heroui-native";
import { useAll } from "jazz-tools/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { app, type Pattern } from "@/schema";

const getPatternScheduleLabel = (pattern: Pattern): string => {
  if (pattern.isHoliday) {
    return "休日";
  }

  if (pattern.isAllDay) {
    return "終日";
  }

  if (!(pattern.startDate && pattern.endDate)) {
    return "時間未設定";
  }

  return `${format(pattern.startDate, "HH:mm")} - ${format(
    pattern.endDate,
    "HH:mm"
  )}`;
};

type ShiftDetailViewProps = {
  selectedDate: Date;
};

export const ShiftDetailView = ({ selectedDate }: ShiftDetailViewProps) => {
  const patterns = useAll(app.patterns) ?? [];
  const shifts = useAll(app.shifts) ?? [];
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const selectedDateShift = shifts.find((shift) =>
    isSameDay(shift.startDate, selectedDate)
  );
  const selectedPattern = selectedDateShift
    ? patternsById.get(selectedDateShift.patternId)
    : undefined;

  if (!selectedPattern) {
    return (
      <View className="px-3 pt-1">
        <ListGroup>
          <ListGroup.Item>
            <ListGroup.ItemPrefix>
              <Text className="w-9 text-center text-2xl" numberOfLines={1}>
                -
              </Text>
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>
                シフト未入力
              </ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </ListGroup.Item>
        </ListGroup>
      </View>
    );
  }

  return (
    <View className="px-3 pt-1">
      <ListGroup>
        <ListGroup.Item>
          <ListGroup.ItemPrefix>
            <Text className="w-9 text-center text-2xl" numberOfLines={1}>
              {selectedPattern.emoji}
            </Text>
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>
              {selectedPattern.name}
            </ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Text color="muted" numberOfLines={1}>
              {getPatternScheduleLabel(selectedPattern)}
            </Text>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </ListGroup>
    </View>
  );
};
