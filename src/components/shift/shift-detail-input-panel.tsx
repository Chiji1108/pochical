import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Label, TagGroup, Text, TextArea, TextField } from "heroui-native";
import { Button } from "heroui-native/button";
import { useAll, useDb, useSession } from "jazz-tools/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { app, type Shift } from "@/schema";

const seedMembers = ["佐藤師長", "鈴木主任", "田中先輩"] as const;

type ShiftDetailInputPanelProps = {
  selectedShift?: Shift;
};

export const ShiftDetailInputPanel = ({
  selectedShift,
}: ShiftDetailInputPanelProps) => {
  const db = useDb();
  const router = useRouter();
  const session = useSession();
  const members = useAll(app.members) ?? [];
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
        batch.insert(app.members, { name, orderIndex });
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
    if (!(session && selectedShift)) {
      return;
    }

    db.update(app.shifts, selectedShift.id, {
      notes: notes.trim() ? notes : null,
    });
  };

  if (!selectedShift) {
    return (
      <View className="items-center px-3 py-4">
        <Text className="text-center text-sm" color="muted">
          シフトを選択すると詳細を入力できます
        </Text>
      </View>
    );
  }

  const selectedMemberIds = new Set(selectedShift.memberIds ?? []);

  return (
    <View className="gap-4 px-1 pt-2">
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-semibold">勤務メンバー</Text>
        </View>
        {sortedMembers.length > 0 ? (
          <TagGroup
            isDisabled={!session}
            onSelectionChange={(keys) => {
              updateMemberIds(Array.from(keys).map(String));
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
      <TextField isDisabled={!session}>
        <Label>メモ</Label>
        <TextArea
          onChangeText={updateNotes}
          placeholder="メモを入力"
          value={selectedShift.notes ?? ""}
        />
      </TextField>
    </View>
  );
};
