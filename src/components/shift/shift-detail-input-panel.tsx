import { startOfDay } from "date-fns";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Description,
  Input,
  Label,
  TagGroup,
  Text,
  TextField,
} from "heroui-native";
import { Button } from "heroui-native/button";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { app, type DayNote, type Shift } from "@/schema";

const seedMembers = ["佐藤師長", "鈴木主任", "田中先輩"] as const;

type ShiftDetailInputPanelProps = {
  onSelectNextDay: () => void;
  selectedDate: Date;
  selectedDateDayNote?: DayNote;
  selectedShift?: Shift;
};

export const ShiftDetailInputPanel = ({
  onSelectNextDay,
  selectedDate,
  selectedDateDayNote,
  selectedShift,
}: ShiftDetailInputPanelProps) => {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session?.user_id ?? "";
  const members =
    useAll(
      currentUserId
        ? app.members.where({ $createdBy: currentUserId })
        : undefined
    ) ?? [];
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      }),
    [members]
  );

  const createSeedMembers = () => {
    if (!session || members.length > 0) {
      return;
    }

    db.batch((batch) => {
      for (const [orderIndex, name] of seedMembers.entries()) {
        batch.insert(app.members, {
          name,
          orderIndex,
        });
      }
    });
  };

  const updateMemberIds = (memberIds: string[]) => {
    if (!(session && selectedShift)) {
      return;
    }

    db.update(app.shifts, selectedShift.id, { memberIds });
  };

  const updateNotes = (notes: string) => {
    if (!session) {
      return;
    }

    const trimmedNotes = notes.trim();

    if (selectedDateDayNote) {
      if (trimmedNotes) {
        db.update(app.dayNotes, selectedDateDayNote.id, { notes });
      } else {
        db.delete(app.dayNotes, selectedDateDayNote.id);
      }
      return;
    }

    if (trimmedNotes) {
      db.insert(app.dayNotes, {
        date: startOfDay(selectedDate),
        notes,
      });
    }
  };

  const handleDeleteShift = () => {
    if (!(session && selectedShift)) {
      return;
    }

    db.delete(app.shifts, selectedShift.id);

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  const handleSaveAndSelectNextDay = () => {
    onSelectNextDay();

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  const selectedMemberIds = new Set(selectedShift?.memberIds ?? []);

  return (
    <View className="gap-4 px-1 pt-2">
      {selectedShift ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-semibold">勤務メンバー</Text>
          </View>
          {sortedMembers.length > 0 ? (
            <TagGroup
              isDisabled={!session}
              onSelectionChange={(keys) => {
                updateMemberIds(Array.from(keys).map(String));
                selectionAsync().catch(() => {
                  // Haptics can be unavailable depending on the device or platform.
                });
              }}
              selectedKeys={selectedMemberIds}
              selectionMode="multiple"
              size="md"
            >
              <TagGroup.List>
                {sortedMembers.map((member) => (
                  <TagGroup.Item id={member.id} key={member.id}>
                    {({ isSelected }) => (
                      <>
                        <SymbolView
                          name={{
                            android: isSelected ? "check" : "add",
                            ios: isSelected ? "checkmark" : "plus",
                            web: isSelected ? "check" : "add",
                          }}
                          size={12}
                        />
                        <TagGroup.ItemLabel numberOfLines={1}>
                          {member.name}
                        </TagGroup.ItemLabel>
                      </>
                    )}
                  </TagGroup.Item>
                ))}
              </TagGroup.List>
            </TagGroup>
          ) : (
            <View className="items-center py-2">
              <Button
                isDisabled={!session}
                onPress={createSeedMembers}
                size="sm"
                variant="primary"
              >
                <SymbolView
                  name={{
                    android: "add",
                    ios: "plus",
                    web: "add",
                  }}
                  size={14}
                  tintColor="white"
                />
                <Button.Label>勤務メンバーを追加</Button.Label>
              </Button>
            </View>
          )}
          {sortedMembers.length > 0 ? (
            <View className="flex-row items-center justify-end pt-1">
              <Button
                accessibilityLabel="勤務メンバーを編集"
                onPress={() => {
                  router.push("/members");
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
                  size={14}
                />
                <Button.Label>勤務メンバーを編集</Button.Label>
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
      <TextField isDisabled={!session}>
        <Label>メモ</Label>
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={updateNotes}
          placeholder="メモを入力"
          returnKeyType="done"
          value={selectedDateDayNote?.notes ?? ""}
        />
        <Description>他のユーザーには共有されません</Description>
      </TextField>
      <View className="flex-row items-center justify-between gap-3 pt-1">
        <Button
          accessibilityLabel={
            selectedShift
              ? "選択日のシフトを削除"
              : "削除できるシフトがありません"
          }
          className="flex-1"
          isDisabled={!(session && selectedShift)}
          onPress={handleDeleteShift}
          size="md"
          variant="outline"
        >
          <SymbolView
            name={{
              android: "delete",
              ios: "trash",
              web: "delete",
            }}
            size={16}
          />
          <Button.Label>削除</Button.Label>
        </Button>
        <Button
          accessibilityLabel="翌日へ移動"
          className="flex-1"
          isDisabled={!session}
          onPress={handleSaveAndSelectNextDay}
          size="md"
          variant="primary"
        >
          <SymbolView
            name={{
              android: "forward",
              ios: "forward.fill",
              web: "forward",
            }}
            size={16}
            tintColor="white"
          />
          <Button.Label>翌日</Button.Label>
        </Button>
      </View>
    </View>
  );
};
