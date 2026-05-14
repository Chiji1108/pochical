import { addDays, isSameDay, startOfDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Text } from "heroui-native";
import { Button } from "heroui-native/button";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import { app, type Pattern } from "@/schema";

const MIN_PATTERN_CELL_WIDTH = 48;
const PATTERN_GRID_GAP = 8;

type SeedPattern = {
  emoji: string;
  end?: [hour: number, minute: number];
  isAllDay?: boolean;
  isHoliday?: boolean;
  name: string;
  orderIndex: number;
  start?: [hour: number, minute: number];
  usesAkeAsNextDay?: boolean;
};

type PatternInsert = {
  emoji: string;
  endDate: Date | null;
  isAllDay: boolean;
  isHoliday: boolean;
  name: string;
  nextDayPatternId?: string | null;
  orderIndex: number;
  startDate: Date | null;
};

const seedTime = ([hour, minute]: [hour: number, minute: number]): Date => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const createPatternInsert = (
  pattern: SeedPattern,
  nextDayPatternId?: string
): PatternInsert => ({
  emoji: pattern.emoji,
  endDate: pattern.end ? seedTime(pattern.end) : null,
  isAllDay: pattern.isAllDay ?? false,
  isHoliday: pattern.isHoliday ?? false,
  name: pattern.name,
  nextDayPatternId: nextDayPatternId ?? null,
  orderIndex: pattern.orderIndex,
  startDate: pattern.start ? seedTime(pattern.start) : null,
});

const seedPatterns: SeedPattern[] = [
  { emoji: "☀️", end: [17, 30], name: "日勤", orderIndex: 0, start: [8, 30] },
  {
    emoji: "🌃",
    end: [9, 0],
    name: "夜勤",
    orderIndex: 1,
    start: [17, 0],
    usesAkeAsNextDay: true,
  },
  { emoji: "🌅", isAllDay: true, name: "明け", orderIndex: 2 },
  {
    emoji: "💤",
    isAllDay: true,
    isHoliday: true,
    name: "休み",
    orderIndex: 3,
  },
  { emoji: "🐰", end: [15, 0], name: "早番", orderIndex: 4, start: [7, 0] },
  { emoji: "🐢", end: [21, 0], name: "遅番", orderIndex: 5, start: [13, 0] },
  {
    emoji: "🌜",
    end: [1, 0],
    name: "準夜",
    orderIndex: 6,
    start: [16, 30],
    usesAkeAsNextDay: true,
  },
  { emoji: "🌛", end: [8, 30], name: "深夜", orderIndex: 7, start: [0, 0] },
  { emoji: "🌞", end: [19, 30], name: "日長", orderIndex: 8, start: [8, 0] },
  { emoji: "🏠", isAllDay: true, name: "待機", orderIndex: 9 },
  { emoji: "📚", end: [17, 0], name: "研修", orderIndex: 10, start: [9, 0] },
  {
    emoji: "🎉",
    isAllDay: true,
    isHoliday: true,
    name: "有給",
    orderIndex: 11,
  },
] as const;

type PatternGridViewProps = {
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
};

export function PatternGridView({
  onSelectDate,
  selectedDate,
}: PatternGridViewProps) {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const patterns = useAll(app.patterns) ?? [];
  const shifts = useAll(app.shifts) ?? [];
  const { width } = useWindowDimensions();
  const sortedPatterns = useMemo(
    () => [...patterns].sort((a, b) => a.orderIndex - b.orderIndex),
    [patterns]
  );
  const columnCount = Math.max(
    1,
    Math.floor(
      (width - 32 + PATTERN_GRID_GAP) /
        (MIN_PATTERN_CELL_WIDTH + PATTERN_GRID_GAP)
    )
  );
  const cellWidth = `${100 / columnCount}%` as const;

  const createSeedPatterns = () => {
    if (!session || patterns.length > 0) {
      return;
    }

    db.batch((batch) => {
      const akeSeed = seedPatterns.find((pattern) => pattern.name === "明け");

      if (!akeSeed) {
        throw new Error("明けパターンの seed が見つかりません。");
      }

      const ake = batch.insert(app.patterns, createPatternInsert(akeSeed));

      for (const pattern of seedPatterns) {
        if (pattern.name === "明け") {
          continue;
        }

        batch.insert(
          app.patterns,
          createPatternInsert(
            pattern,
            pattern.usesAkeAsNextDay ? ake.id : undefined
          )
        );
      }
    });
  };

  const handlePatternPress = (pattern: Pattern) => {
    if (!session) {
      return;
    }

    const shiftStartDate = startOfDay(selectedDate);
    const nextShiftStartDate = addDays(shiftStartDate, 1);

    db.batch((batch) => {
      const upsertShift = (patternId: string, startDate: Date) => {
        const sameDateShifts = shifts.filter((shift) =>
          isSameDay(shift.startDate, startDate)
        );
        const [existingShift, ...duplicateShifts] = sameDateShifts;

        if (existingShift) {
          batch.update(app.shifts, existingShift.id, {
            patternId,
            startDate,
          });
        } else {
          batch.insert(app.shifts, {
            patternId,
            startDate,
          });
        }

        for (const duplicateShift of duplicateShifts) {
          batch.delete(app.shifts, duplicateShift.id);
        }
      };

      upsertShift(pattern.id, shiftStartDate);

      if (pattern.nextDayPatternId) {
        upsertShift(pattern.nextDayPatternId, nextShiftStartDate);
      }
    });

    onSelectDate(addDays(shiftStartDate, pattern.nextDayPatternId ? 2 : 1));

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  return (
    <View className="px-3 pt-1">
      {sortedPatterns.length > 0 ? (
        <View className="gap-1">
          <View className="flex-row flex-wrap">
            {sortedPatterns.map((pattern) => (
              <View
                className="p-1"
                key={pattern.id}
                style={{ width: cellWidth }}
              >
                <Button
                  accessibilityLabel={`${pattern.name}を入力`}
                  className="h-15 w-full flex-col gap-0 rounded-lg bg-foreground/5 px-1 py-3"
                  isDisabled={!session}
                  onPress={() => {
                    handlePatternPress(pattern);
                  }}
                  variant="ghost"
                >
                  <Button.Label
                    className="text-center text-xl"
                    numberOfLines={1}
                  >
                    {pattern.emoji}
                  </Button.Label>
                  <Button.Label
                    className="text-center font-normal text-sm"
                    numberOfLines={1}
                  >
                    {pattern.name}
                  </Button.Label>
                </Button>
              </View>
            ))}
          </View>
          <Button
            className="self-center"
            onPress={() => {
              router.push("/patterns");
            }}
            size="sm"
            variant="outline"
          >
            <SymbolView
              name={{
                android: "edit",
                ios: "pencil",
                web: "edit",
              }}
              size={16}
            />
            <Button.Label>パターンを編集</Button.Label>
          </Button>
        </View>
      ) : (
        <View className="items-center py-6">
          <Button
            isDisabled={!session}
            onPress={createSeedPatterns}
            size="lg"
            variant="primary"
          >
            <SymbolView
              name={{
                android: "add",
                ios: "plus",
                web: "add",
              }}
              size={18}
              tintColor="white"
            />
            <Button.Label>パターン作成</Button.Label>
          </Button>
          {session ? null : (
            <Text className="mt-3 text-sm" color="muted">
              接続後に作成できます
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
