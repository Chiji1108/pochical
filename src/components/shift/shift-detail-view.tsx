import { format } from "date-fns";
import { Chip, ListGroup, Separator, Text } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";
import { LinkifiedText } from "@/components/common/linkified-text";
import type { Member, Pattern, Shift } from "@/lib/instant";

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
};

type ShiftSupplementalDetailsProps = {
  notes: string;
  selectedMembers: Member[];
};

const ShiftSupplementalDetails = ({
  notes,
  selectedMembers,
}: ShiftSupplementalDetailsProps) => {
  const hasSelectedMembers = selectedMembers.length > 0;

  if (!(hasSelectedMembers || notes)) {
    return null;
  }

  return (
    <>
      <Separator className="mx-4" />
      {hasSelectedMembers ? (
        <ListGroup.Item className={notes ? "pt-3 pb-2" : "py-3"}>
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
      ) : null}
      {notes ? (
        <ListGroup.Item className={hasSelectedMembers ? "pt-0 pb-3" : "py-3"}>
          <ListGroup.ItemContent>
            <LinkifiedText
              className="text-muted text-sm"
              linkClassName="text-muted underline"
              text={notes}
            />
          </ListGroup.ItemContent>
        </ListGroup.Item>
      ) : null}
    </>
  );
};

export const ShiftDetailView = ({
  bottomContentPadding,
  membersById,
  patternsById,
  selectedDateShift,
}: ShiftDetailViewProps) => {
  const selectedPattern = selectedDateShift?.pattern
    ? (patternsById.get(selectedDateShift.pattern.id) ??
      selectedDateShift.pattern)
    : undefined;
  const selectedMembers = useMemo(() => {
    if (!selectedDateShift) {
      return [];
    }

    return (selectedDateShift.shiftMembers ?? [])
      .map((member) => membersById.get(member.id) ?? member)
      .sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      });
  }, [membersById, selectedDateShift]);
  const notes = (selectedDateShift?.notes ?? "").trim();

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
          <ShiftSupplementalDetails
            notes={notes}
            selectedMembers={selectedMembers}
          />
        </ListGroup>
      ) : null}
    </View>
  );
};
