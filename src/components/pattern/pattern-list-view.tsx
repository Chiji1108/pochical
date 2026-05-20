import { format } from "date-fns";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Button,
  ListGroup,
  PressableFeedback,
  Separator,
  Text,
} from "heroui-native";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useCallback, useMemo } from "react";
import { Alert, View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import Sortable, {
  type SortableGridDragEndCallback,
  type SortableGridRenderItem,
} from "react-native-sortables";
import { deleteShiftPatternsAndRelatedData } from "@/lib/work-data-actions";
import { app, type Pattern } from "@/schema";

const PATTERN_ROW_GAP = 10;

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

type PatternRowProps = {
  nextDayPattern?: Pattern;
  pattern: Pattern;
};

type PatternListItemProps = PatternRowProps & {
  onPress: () => void;
};

const PatternListItem = ({
  nextDayPattern,
  onPress,
  pattern,
}: PatternListItemProps) => (
  <ListGroup>
    <ListGroup.Item
      accessibilityLabel={`${pattern.name}を編集`}
      onPress={onPress}
    >
      <ListGroup.ItemPrefix>
        <Sortable.Handle>
          <View
            accessibilityLabel={`${pattern.name}を並び替え`}
            className="h-10 w-8 items-center justify-center rounded-full"
          >
            <SymbolView
              name={{
                android: "drag_handle",
                ios: "line.3.horizontal",
                web: "drag_handle",
              }}
              size={18}
            />
          </View>
        </Sortable.Handle>
      </ListGroup.ItemPrefix>
      <ListGroup.ItemPrefix>
        <Text className="w-9 text-center text-2xl" numberOfLines={1}>
          {pattern.emoji}
        </Text>
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <View className="flex-row items-center gap-2">
          <ListGroup.ItemTitle className="min-w-0" numberOfLines={1}>
            {pattern.name}
          </ListGroup.ItemTitle>
          {pattern.nextDayPatternId && nextDayPattern ? (
            <View className="min-w-0 flex-row items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5">
              <SymbolView
                name={{
                  android: "forward",
                  ios: "forward.fill",
                  web: "forward",
                }}
                size={12}
              />
              <Text className="min-w-0 text-xs" color="muted" numberOfLines={1}>
                {nextDayPattern.emoji} {nextDayPattern.name}
              </Text>
            </View>
          ) : null}
        </View>
        <ListGroup.ItemDescription numberOfLines={1}>
          {getPatternScheduleLabel(pattern)}
        </ListGroup.ItemDescription>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix />
    </ListGroup.Item>
  </ListGroup>
);

export const PatternListView = () => {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const scrollableRef = useAnimatedRef<Animated.ScrollView>();
  const patterns =
    useAll(
      currentUserId
        ? app.patterns.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const shifts =
    useAll(
      currentUserId
        ? app.shifts.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const sortedPatterns = useMemo(
    () =>
      [...patterns].sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      }),
    [patterns]
  );
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);

  const handleDragEnd = useCallback<SortableGridDragEndCallback<Pattern>>(
    ({ data }) => {
      if (!session) {
        return;
      }

      const changedPatterns = data.filter(
        (pattern, index) => pattern.orderIndex !== index
      );

      if (changedPatterns.length === 0) {
        return;
      }

      db.batch((batch) => {
        for (const [index, pattern] of data.entries()) {
          batch.update(app.patterns, pattern.id, {
            orderIndex: index,
          });
        }
      });
    },
    [db, session]
  );

  const confirmRecreatePatterns = () => {
    if (!session) {
      return;
    }

    Alert.alert(
      "シフトパターンを作り直しますか？",
      "すべてのシフト、シフトパターンが削除されます。メモ、勤務メンバー、グループは残ります。この操作は取り消せません。",
      [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: () => {
            deleteShiftPatternsAndRelatedData(db, {
              patterns,
              shifts,
            });
            router.push("/patterns/presets");
          },
          style: "destructive",
          text: "削除して選び直す",
        },
      ]
    );
  };

  const renderPattern = useCallback<SortableGridRenderItem<Pattern>>(
    ({ item }) => (
      <PatternListItem
        nextDayPattern={
          item.nextDayPatternId
            ? patternsById.get(item.nextDayPatternId)
            : undefined
        }
        onPress={() => {
          router.push(`/patterns/${item.id}`);
        }}
        pattern={item}
      />
    ),
    [patternsById, router]
  );

  if (sortedPatterns.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-base" color="muted">
          シフトパターンがありません
        </Text>
        <View className="items-center gap-3">
          <Button
            isDisabled={!session}
            onPress={() => {
              router.push("/patterns/presets");
            }}
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
            <Button.Label>勤務体系を選択</Button.Label>
          </Button>
          <Button
            isDisabled={!session}
            onPress={() => {
              router.push("/patterns/new");
            }}
            variant="outline"
          >
            <Button.Label>1つずつ追加</Button.Label>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <Animated.ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 py-4"
      contentInsetAdjustmentBehavior="automatic"
      ref={scrollableRef}
      showsVerticalScrollIndicator={false}
    >
      <Sortable.Grid
        activeItemScale={1.02}
        autoScrollEnabled={true}
        columns={1}
        customHandle={true}
        data={sortedPatterns}
        hapticsEnabled={false}
        keyExtractor={(pattern) => pattern.id}
        onDragEnd={handleDragEnd}
        overDrag="vertical"
        renderItem={renderPattern}
        rowGap={PATTERN_ROW_GAP}
        scrollableRef={scrollableRef}
        showDropIndicator={true}
        sortEnabled={Boolean(session)}
      />
      <View className="mt-4 gap-2">
        <ListGroup>
          <ListGroup.Item
            accessibilityLabel="勤務体系からシフトパターンを追加"
            onPress={() => {
              router.push("/patterns/presets");
            }}
          >
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>勤務体系から追加</ListGroup.ItemTitle>
              <ListGroup.ItemDescription>
                現在のシフトパターンは残したまま追加します
              </ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </ListGroup.Item>
          <Separator className="mx-4" />
          <PressableFeedback
            animation={false}
            isDisabled={!session}
            onPress={confirmRecreatePatterns}
          >
            <PressableFeedback.Scale>
              <ListGroup.Item disabled={!session}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle className="text-danger">
                    シフトパターンを作り直す
                  </ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>
                    すべてのシフト、シフトパターンを削除して勤務体系を選び直します
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </PressableFeedback.Scale>
            <PressableFeedback.Ripple />
          </PressableFeedback>
        </ListGroup>
      </View>
      {session ? null : (
        <Text className="mt-4 text-center text-sm" color="muted">
          接続後に並び替えできます
        </Text>
      )}
    </Animated.ScrollView>
  );
};
