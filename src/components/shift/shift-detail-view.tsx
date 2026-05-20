import { format } from "date-fns";
import { Chip, ListGroup, Separator, Text } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";
import { LinkifiedText } from "@/components/common/linkified-text";
import type { DayNote, Member, Pattern, Shift } from "@/schema";

const getPatternScheduleLabel = (pattern: Pattern): string => {
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
  selectedDateDayNote?: DayNote;
  selectedDateShift?: Shift;
};

export const ShiftDetailView = ({
  bottomContentPadding,
  membersById,
  patternsById,
  selectedDateDayNote,
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
  const notes = selectedDateDayNote?.notes.trim() ?? "";
  const hasSelectedMembers = selectedMembers.length > 0;

  if (!(selectedPattern || notes)) {
    return null;
  }

  return (
    <View
      className="gap-2 px-3 pt-1"
      style={{ paddingBottom: bottomContentPadding }}
    >
      {selectedPattern ? (
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
          {hasSelectedMembers ? (
            <>
              <Separator className="mx-4" />
              <ListGroup.Item className="py-3">
                <ListGroup.ItemContent>
                  <View className="min-w-0 flex-row flex-wrap items-center gap-1">
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
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </>
          ) : null}
        </ListGroup>
      ) : null}

      {notes ? (
        <View className="items-center px-3 py-1">
          <LinkifiedText
            className="text-center text-muted text-sm"
            linkClassName="text-muted underline"
            text={notes}
          />
        </View>
      ) : null}
    </View>
  );
};
