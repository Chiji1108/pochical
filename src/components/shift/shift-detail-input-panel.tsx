import { randomUUID as id } from "expo-crypto";
import { selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Input, Label, TagGroup, TextField, Typography } from "heroui-native";
import { Button } from "heroui-native/button";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { shiftNoteDrafts } from "@/lib/shift-notes";
import { patchShift, putMember, removeRecord } from "@/lib/work-changes";
import {
  type Member,
  type Shift,
  useCurrentUserId,
  writeWork,
} from "@/lib/work-data";

const seedMembers = ["佐藤師長", "鈴木主任", "田中先輩"] as const;

type ShiftDetailInputPanelProps = {
  members: Member[];
  onSelectNextDay: () => void;
  selectedShift?: Shift;
};

export const ShiftDetailInputPanel = ({
  members,
  onSelectNextDay,
  selectedShift,
}: ShiftDetailInputPanelProps) => {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const isSignedIn = Boolean(currentUserId);
  const [noteDraft, setNoteDraft] = useState<{
    shiftId: string;
    notes: string;
  }>();
  const shiftId = selectedShift?.id;
  const noteText =
    noteDraft?.shiftId === shiftId
      ? (noteDraft?.notes ?? "")
      : (selectedShift?.notes ?? "");
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      }),
    [members]
  );

  useEffect(() => {
    setNoteDraft(undefined);
    return () => {
      if (shiftId) {
        shiftNoteDrafts.flush(shiftId);
      }
    };
  }, [shiftId]);

  const changeNotes = (notes: string) => {
    if (!(currentUserId && shiftId)) {
      return;
    }
    setNoteDraft({ shiftId, notes });
    shiftNoteDrafts.schedule(shiftId, notes);
  };

  const createSeedMembers = async () => {
    if (!(currentUserId && members.length === 0)) {
      return;
    }

    await writeWork(
      seedMembers.map((name, orderIndex) =>
        putMember(id(), { name, orderIndex })
      )
    );
  };

  const updateMemberIds = async (memberIds: string[]) => {
    if (!(currentUserId && selectedShift)) {
      return;
    }

    await writeWork(patchShift(selectedShift.id, { memberIds }));
  };

  const handleDeleteShift = async () => {
    if (!(currentUserId && selectedShift)) {
      return;
    }

    shiftNoteDrafts.discard(selectedShift.id);
    await writeWork(removeRecord("shifts", selectedShift.id));

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  const handleSaveAndSelectNextDay = () => {
    if (shiftId) {
      shiftNoteDrafts.flush(shiftId);
    }
    onSelectNextDay();

    selectionAsync().catch(() => {
      // Haptics can be unavailable depending on the device or platform.
    });
  };

  const selectedMemberIds = new Set(
    selectedShift?.shiftMembers?.map((member) => member.id) ?? []
  );

  return (
    <View className="gap-4 px-1 pt-2">
      {selectedShift ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Typography className="font-semibold">勤務メンバー</Typography>
          </View>
          {sortedMembers.length > 0 ? (
            <TagGroup
              isDisabled={!isSignedIn}
              onSelectionChange={(keys) => {
                updateMemberIds(Array.from(keys).map(String)).catch(() => {
                  // The query will surface write errors during development.
                });
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
                isDisabled={!isSignedIn}
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
      {selectedShift ? (
        <TextField isDisabled={!isSignedIn}>
          <Label>メモ</Label>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => {
              if (shiftId) {
                shiftNoteDrafts.flush(shiftId);
              }
            }}
            onChangeText={changeNotes}
            placeholder="メモを入力"
            returnKeyType="done"
            value={noteText}
          />
        </TextField>
      ) : null}
      <View className="flex-row items-center justify-between gap-3 pt-1">
        <Button
          accessibilityLabel={
            selectedShift
              ? "選択日のシフトを削除"
              : "削除できるシフトがありません"
          }
          className="flex-1"
          isDisabled={!(isSignedIn && selectedShift)}
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
          isDisabled={!isSignedIn}
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
