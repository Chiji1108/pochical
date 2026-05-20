import { format } from "date-fns";
import { Chip, ListGroup, Separator, Text } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";
import { LinkifiedText } from "@/components/common/linkified-text";
import type { Member, Pattern, Shift, ShiftNote } from "@/schema";

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
  selectedDateShift?: Shift;
  selectedDateShiftNote?: ShiftNote;
};

export const ShiftDetailView = ({
  bottomContentPadding,
  membersById,
  patternsById,
  selectedDateShift,
  selectedDateShiftNote,
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
  const notes = selectedDateShiftNote?.notes.trim() ?? "";
  const hasSelectedMembers = selectedMembers.length > 0;

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
            <ListGroup.Item className={notes ? "pt-3 pb-1" : "py-3"}>
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
        {notes ? (
          <>
            {hasSelectedMembers ? null : <Separator className="mx-4" />}
            <ListGroup.Item
              className={
                hasSelectedMembers
                  ? "items-start pt-1 pb-3"
                  : "items-start py-3"
              }
            >
              <ListGroup.ItemContent>
                <LinkifiedText
                  className="text-muted text-sm"
                  linkClassName="text-muted underline"
                  text={notes}
                />
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </>
        ) : null}
      </ListGroup>
    </View>
  );
};
