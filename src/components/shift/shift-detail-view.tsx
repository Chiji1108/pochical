import { format } from "date-fns";
import { Chip, ListGroup, Text } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";
import type { Member, Pattern, Shift } from "@/schema";

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
  bottomContentPadding: number;
  membersById: ReadonlyMap<string, Member>;
  patternsById: ReadonlyMap<string, Pattern>;
  selectedDateShift?: Shift;
};

export const ShiftDetailView = ({
  bottomContentPadding,
  membersById,
  patternsById,
  selectedDateShift,
}: ShiftDetailViewProps) => {
  const selectedPattern = selectedDateShift
    ? patternsById.get(selectedDateShift.patternId)
    : undefined;
  const selectedMembers = useMemo(() => {
    if (!selectedDateShift) {
      return [];
    }

    return selectedDateShift.memberIds
      .map((memberId) => membersById.get(memberId))
      .filter((member): member is Member => Boolean(member))
      .sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      });
  }, [membersById, selectedDateShift]);
  const notes = selectedDateShift?.notes?.trim() ?? "";

  if (!selectedPattern) {
    return null;
  }

  return (
    <View className="px-3 pt-1" style={{ paddingBottom: bottomContentPadding }}>
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
            {selectedMembers.length > 0 ? (
              <View className="mt-1 flex-row flex-wrap gap-1">
                {selectedMembers.map((member) => (
                  <Chip
                    animation="disable-all"
                    className="max-w-28"
                    color="default"
                    key={member.id}
                    size="sm"
                    variant="soft"
                  >
                    <Chip.Label numberOfLines={1}>{member.name}</Chip.Label>
                  </Chip>
                ))}
              </View>
            ) : null}
            {notes ? (
              <Text className="mt-1 text-sm" color="muted" numberOfLines={3}>
                {notes}
              </Text>
            ) : null}
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
