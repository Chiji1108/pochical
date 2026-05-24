import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from "@shopify/flash-list";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Text } from "heroui-native";
import type { Ref } from "react";
import { ScrollView, View } from "react-native";
import type { Pattern } from "@/lib/instant";

export const SHARED_SHIFT_DATE_COLUMN_WIDTH = 58;
export const SHARED_SHIFT_MEMBER_COLUMN_WIDTH = 68;
export const SHARED_SHIFT_DAY_ROW_HEIGHT = 38;
export const SHARED_SHIFT_DATE_COLUMN_LEFT_PADDING = 12;

const CELL_HORIZONTAL_PADDING = 6;
const STRONG_BORDER_ALPHA = "B3";
const SUBTLE_BORDER_ALPHA = "4D";
const TABLE_BOTTOM_PADDING = 24;

export type SharedShiftScheduleDay = {
  date: Date;
  time: number;
};

export type SharedShiftMember = {
  _id: string;
  displayName: string;
  instantUserId: string;
};

export type SharedShiftCellValue = {
  pattern?: Pick<Pattern, "countsAsDayOff" | "emoji" | "name">;
};

type BorderVariant = boolean | "subtle";

type SharedShiftTableColors = {
  border: string;
  highlightBackground: string;
  today: string;
};

type SharedShiftTableProps = {
  colors: SharedShiftTableColors;
  memberColumnWidth: number;
  members: SharedShiftMember[];
  scheduleDays: SharedShiftScheduleDay[];
  shiftsByUserAndDate: ReadonlyMap<string, SharedShiftCellValue>;
  tableWidth: number;
  today: Date;
  visibleMonth: Date;
  centerContent?: boolean;
  initialScrollIndex?: number;
  listRef?: Ref<FlashListRef<SharedShiftScheduleDay>>;
  onEndReached?: () => void;
  onStartReached?: () => void;
  onViewableItemsChanged?: (info: {
    viewableItems: { item?: SharedShiftScheduleDay }[];
  }) => void;
  scrollEnabled?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  showsVerticalScrollIndicator?: boolean;
  useVirtualizedRows?: boolean;
  viewabilityConfig?: { itemVisiblePercentThreshold: number };
};

export const SharedShiftTable = ({
  centerContent = false,
  colors,
  initialScrollIndex,
  listRef,
  memberColumnWidth,
  members,
  onEndReached,
  onStartReached,
  onViewableItemsChanged,
  scheduleDays,
  scrollEnabled = true,
  shiftsByUserAndDate,
  showsHorizontalScrollIndicator = true,
  showsVerticalScrollIndicator = true,
  tableWidth,
  today,
  useVirtualizedRows = true,
  viewabilityConfig,
  visibleMonth,
}: SharedShiftTableProps) => {
  const renderScheduleDay: ListRenderItem<SharedShiftScheduleDay> = ({
    item,
  }) => (
    <SharedShiftTableRow
      colors={colors}
      day={item}
      memberColumnWidth={memberColumnWidth}
      members={members}
      shiftsByUserAndDate={shiftsByUserAndDate}
      tableWidth={tableWidth}
      today={today}
    />
  );

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: centerContent ? "center" : undefined,
        minWidth: centerContent ? "100%" : undefined,
      }}
      horizontal={true}
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      style={centerContent ? { width: "100%" } : undefined}
    >
      <View style={{ flex: 1, width: tableWidth }}>
        <SharedShiftTableHeader
          borderColor={colors.border}
          memberColumnWidth={memberColumnWidth}
          members={members}
          visibleMonth={visibleMonth}
        />
        {useVirtualizedRows ? (
          <FlashList
            contentContainerStyle={{
              paddingBottom: TABLE_BOTTOM_PADDING,
            }}
            data={scheduleDays}
            drawDistance={SHARED_SHIFT_DAY_ROW_HEIGHT * 12}
            initialScrollIndex={initialScrollIndex}
            keyExtractor={(item) => String(item.time)}
            maintainVisibleContentPosition={{
              autoscrollToBottomThreshold: 0.01,
              autoscrollToTopThreshold: 0.01,
            }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.4}
            onStartReached={onStartReached}
            onStartReachedThreshold={0.4}
            onViewableItemsChanged={onViewableItemsChanged}
            ref={listRef}
            renderItem={renderScheduleDay}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            style={{ flex: 1 }}
            viewabilityConfig={viewabilityConfig}
          />
        ) : (
          <View>
            {scheduleDays.map((day) => (
              <SharedShiftTableRow
                colors={colors}
                day={day}
                key={day.time}
                memberColumnWidth={memberColumnWidth}
                members={members}
                shiftsByUserAndDate={shiftsByUserAndDate}
                tableWidth={tableWidth}
                today={today}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const SharedShiftTableHeader = ({
  borderColor,
  memberColumnWidth,
  members,
  visibleMonth,
}: {
  borderColor: string;
  memberColumnWidth: number;
  members: SharedShiftMember[];
  visibleMonth: Date;
}) => (
  <View className="flex-row">
    <TableHeaderCell
      borderColor={borderColor}
      label={format(visibleMonth, "M月", { locale: ja })}
      paddingLeft={SHARED_SHIFT_DATE_COLUMN_LEFT_PADDING}
      rightBorder={true}
      width={SHARED_SHIFT_DATE_COLUMN_WIDTH}
    />
    {members.map((member, index) => (
      <TableHeaderCell
        borderColor={borderColor}
        key={member._id}
        label={member.displayName}
        rightBorder={index < members.length - 1 ? "subtle" : false}
        textAlign="center"
        width={memberColumnWidth}
      />
    ))}
  </View>
);

const SharedShiftTableRow = ({
  colors,
  day,
  memberColumnWidth,
  members,
  shiftsByUserAndDate,
  tableWidth,
  today,
}: {
  colors: SharedShiftTableColors;
  day: SharedShiftScheduleDay;
  memberColumnWidth: number;
  members: SharedShiftMember[];
  shiftsByUserAndDate: ReadonlyMap<string, SharedShiftCellValue>;
  tableWidth: number;
  today: Date;
}) => {
  const cells = members.map((member) => {
    const shift = shiftsByUserAndDate.get(
      `${member.instantUserId}:${day.time}`
    );

    return { member, shift };
  });
  const hasRegisteredShift = cells.some(({ shift }) => shift);
  const isEveryoneOff = cells.every(
    ({ shift }) => !shift || shift.pattern?.countsAsDayOff
  );
  const isToday = day.time === today.getTime();
  let rowBackgroundColor: string | undefined;

  if (hasRegisteredShift && isEveryoneOff) {
    rowBackgroundColor = `${colors.highlightBackground}22`;
  } else if (isToday) {
    rowBackgroundColor = `${colors.today}16`;
  }

  return (
    <View
      className="flex-row"
      style={{
        backgroundColor: rowBackgroundColor,
        borderLeftColor: isToday ? colors.today : "transparent",
        borderLeftWidth: isToday ? 3 : 0,
        width: tableWidth,
      }}
    >
      <View
        className="flex-row"
        style={{
          width: tableWidth - (isToday ? 3 : 0),
        }}
      >
        <TableBodyCell
          borderColor={colors.border}
          label={format(day.date, "d(E)", { locale: ja })}
          muted={true}
          paddingLeft={
            isToday
              ? SHARED_SHIFT_DATE_COLUMN_LEFT_PADDING - 3
              : SHARED_SHIFT_DATE_COLUMN_LEFT_PADDING
          }
          rightBorder={true}
          width={SHARED_SHIFT_DATE_COLUMN_WIDTH - (isToday ? 3 : 0)}
        />
        {cells.map(({ member, shift }, index) => (
          <TableBodyCell
            borderColor={colors.border}
            key={member._id}
            label={shift ? (shift.pattern?.name ?? "不明") : ""}
            muted={!shift}
            prefix={shift?.pattern?.emoji}
            rightBorder={index < cells.length - 1 ? "subtle" : false}
            textAlign="center"
            width={memberColumnWidth}
          />
        ))}
      </View>
    </View>
  );
};

const TableHeaderCell = ({
  borderColor,
  label,
  paddingLeft,
  rightBorder = false,
  textAlign = "left",
  width,
}: {
  borderColor: string;
  label: string;
  paddingLeft?: number;
  rightBorder?: BorderVariant;
  textAlign?: "center" | "left";
  width: number;
}) => (
  <View
    className="py-2"
    style={{
      borderBottomColor: `${borderColor}${STRONG_BORDER_ALPHA}`,
      borderBottomWidth: 1,
      borderRightColor: `${borderColor}${
        rightBorder === "subtle" ? SUBTLE_BORDER_ALPHA : STRONG_BORDER_ALPHA
      }`,
      borderRightWidth: rightBorder ? 1 : 0,
      paddingLeft: paddingLeft ?? CELL_HORIZONTAL_PADDING,
      paddingRight: CELL_HORIZONTAL_PADDING,
      width,
    }}
  >
    <Text
      className="font-semibold text-xs"
      color="muted"
      numberOfLines={1}
      style={{ textAlign }}
    >
      {label}
    </Text>
  </View>
);

const TableBodyCell = ({
  borderColor,
  label,
  muted = false,
  paddingLeft,
  prefix,
  rightBorder = false,
  textAlign = "left",
  width,
}: {
  borderColor: string;
  label: string;
  muted?: boolean;
  paddingLeft?: number;
  prefix?: string;
  rightBorder?: BorderVariant;
  textAlign?: "center" | "left";
  width: number;
}) => (
  <View
    className="justify-center"
    style={{
      borderBottomColor: `${borderColor}${SUBTLE_BORDER_ALPHA}`,
      borderBottomWidth: 1,
      borderRightColor: `${borderColor}${
        rightBorder === "subtle" ? SUBTLE_BORDER_ALPHA : STRONG_BORDER_ALPHA
      }`,
      borderRightWidth: rightBorder ? 1 : 0,
      height: SHARED_SHIFT_DAY_ROW_HEIGHT,
      paddingLeft: paddingLeft ?? CELL_HORIZONTAL_PADDING,
      paddingRight: CELL_HORIZONTAL_PADDING,
      width,
    }}
  >
    <Text
      className="text-xs"
      color={muted ? "muted" : undefined}
      numberOfLines={1}
      style={{ textAlign }}
    >
      {prefix ? `${prefix} ${label}` : label}
    </Text>
  </View>
);
