import { id } from "@instantdb/react-native";
import { SymbolView } from "expo-symbols";
import {
  Button,
  Dialog,
  Input,
  ListGroup,
  PressableFeedback,
  Text,
  TextField,
} from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import Sortable, {
  type SortableGridDragEndCallback,
  type SortableGridRenderItem,
} from "react-native-sortables";
import {
  db,
  type InstantTransaction,
  type Member,
  useCurrentUserId,
  useOwnWorkData,
} from "@/lib/instant";

const MEMBER_ROW_GAP = 10;

type MemberListViewProps = {
  editingMember?: Member;
  isAddingMember: boolean;
  onCloseAddDialog: () => void;
  onCloseEditDialog: () => void;
  onEditMember: (member: Member) => void;
};

export const MemberListView = ({
  editingMember,
  isAddingMember,
  onCloseAddDialog,
  onCloseEditDialog,
  onEditMember,
}: MemberListViewProps) => {
  const currentUserId = useCurrentUserId();
  const isSignedIn = Boolean(currentUserId);
  const { members, shifts } = useOwnWorkData(currentUserId);
  const scrollableRef = useAnimatedRef<Animated.ScrollView>();
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const orderDiff = a.orderIndex - b.orderIndex;
        return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
      }),
    [members]
  );

  const handleDragEnd = useCallback<SortableGridDragEndCallback<Member>>(
    ({ data }) => {
      if (!currentUserId) {
        return;
      }

      const changedMembers = data.filter(
        (member, index) => member.orderIndex !== index
      );

      if (changedMembers.length === 0) {
        return;
      }

      db.transact(
        data.map((member, orderIndex) =>
          db.tx.shiftMembers[member.id].update({ orderIndex })
        )
      ).catch(() => undefined);
    },
    [currentUserId]
  );

  const deleteMember = useCallback(
    (member: Member) => {
      if (!currentUserId) {
        return;
      }

      const transactions: InstantTransaction[] = [];

      for (const shift of shifts) {
        const hasMember = (shift.shiftMembers ?? []).some(
          (item) => item.id === member.id
        );

        if (hasMember) {
          transactions.push(
            db.tx.shifts[shift.id].unlink({ shiftMembers: member.id })
          );
        }
      }

      const remainingMembers = members
        .filter((item) => item.id !== member.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      for (const [orderIndex, item] of remainingMembers.entries()) {
        if (item.orderIndex !== orderIndex) {
          transactions.push(db.tx.shiftMembers[item.id].update({ orderIndex }));
        }
      }

      transactions.push(db.tx.shiftMembers[member.id].delete());
      db.transact(transactions).catch(() => undefined);
    },
    [currentUserId, members, shifts]
  );

  const confirmDeleteMember = useCallback(
    (member: Member) => {
      const relatedShiftCount = shifts.filter((shift) =>
        (shift.shiftMembers ?? []).some((item) => item.id === member.id)
      ).length;
      const message =
        relatedShiftCount > 0
          ? `${relatedShiftCount}件のシフトからこの勤務メンバーが外れます。`
          : "この操作は取り消せません。";

      Alert.alert(`${member.name}を削除しますか？`, message, [
        { style: "cancel", text: "キャンセル" },
        {
          onPress: () => {
            deleteMember(member);
          },
          style: "destructive",
          text: "削除",
        },
      ]);
    },
    [deleteMember, shifts]
  );

  const renderMember = useCallback<SortableGridRenderItem<Member>>(
    ({ item }) => (
      <MemberListItem
        isSignedIn={isSignedIn}
        member={item}
        onDelete={() => {
          confirmDeleteMember(item);
        }}
        onPress={() => {
          onEditMember(item);
        }}
      />
    ),
    [confirmDeleteMember, isSignedIn, onEditMember]
  );

  return (
    <View className="flex-1">
      {sortedMembers.length > 0 ? (
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
            data={sortedMembers}
            hapticsEnabled={false}
            keyExtractor={(member) => member.id}
            onDragEnd={handleDragEnd}
            overDrag="vertical"
            renderItem={renderMember}
            rowGap={MEMBER_ROW_GAP}
            scrollableRef={scrollableRef}
            showDropIndicator={true}
            sortEnabled={isSignedIn}
          />
          {isSignedIn ? null : (
            <Text className="mt-4 text-center text-sm" color="muted">
              接続後に編集できます
            </Text>
          )}
        </Animated.ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base" color="muted">
            勤務メンバーがいません
          </Text>
        </View>
      )}
      <MemberNameDialog
        isOpen={isAddingMember}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            onCloseAddDialog();
          }
        }}
        onSubmit={(name) => {
          if (!currentUserId) {
            return;
          }

          db.transact(
            db.tx.shiftMembers[id()]
              .create({
                name,
                orderIndex: members.length,
              })
              .link({ owner: currentUserId })
          ).catch(() => undefined);
          onCloseAddDialog();
        }}
        title="勤務メンバーを追加"
      />
      <MemberNameDialog
        initialName={editingMember?.name}
        isOpen={Boolean(editingMember)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            onCloseEditDialog();
          }
        }}
        onSubmit={(name) => {
          if (!editingMember) {
            return;
          }

          db.transact(
            db.tx.shiftMembers[editingMember.id].update({ name })
          ).catch(() => undefined);
          onCloseEditDialog();
        }}
        title="勤務メンバーを編集"
      />
    </View>
  );
};

type MemberListItemProps = {
  member: Member;
  isSignedIn: boolean;
  onDelete: () => void;
  onPress: () => void;
};

const MemberListItem = ({
  isSignedIn,
  member,
  onDelete,
  onPress,
}: MemberListItemProps) => (
  <ListGroup>
    <ListGroup.Item
      accessibilityLabel={`${member.name}を編集`}
      onPress={onPress}
    >
      <ListGroup.ItemPrefix>
        <Sortable.Handle>
          <View
            accessibilityLabel={`${member.name}を並び替え`}
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
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>
          {member.name}
        </ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <PressableFeedback
          accessibilityLabel={`${member.name}を削除`}
          className="h-9 w-9 items-center justify-center rounded-full"
          isDisabled={!isSignedIn}
          onPress={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <SymbolView
            name={{
              android: "delete",
              ios: "trash",
              web: "delete",
            }}
            size={17}
          />
        </PressableFeedback>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  </ListGroup>
);

type MemberNameDialogProps = {
  initialName?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (name: string) => void;
  title: string;
};

const MemberNameDialog = ({
  initialName = "",
  isOpen,
  onOpenChange,
  onSubmit,
  title,
}: MemberNameDialogProps) => {
  const nameRef = useRef(initialName);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      nameRef.current = initialName;
      setFormKey((currentKey) => currentKey + 1);
    }
  }, [initialName, isOpen]);

  const submit = () => {
    const trimmedName = nameRef.current.trim();

    if (!trimmedName) {
      Alert.alert("名前を入力してください");
      return;
    }

    onSubmit(trimmedName);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Dialog.Content>
            <Dialog.Close variant="ghost" />
            <View className="mb-5 gap-1.5">
              <Dialog.Title>{title}</Dialog.Title>
            </View>
            <TextField>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={true}
                defaultValue={initialName}
                key={`member-name-${formKey}`}
                onChangeText={(text) => {
                  nameRef.current = text;
                }}
                onSubmitEditing={submit}
                placeholder="名前"
                returnKeyType="done"
              />
            </TextField>
            <View className="mt-5 flex-row justify-end gap-3">
              <Button
                onPress={() => {
                  onOpenChange(false);
                }}
                size="sm"
                variant="ghost"
              >
                <Button.Label>キャンセル</Button.Label>
              </Button>
              <Button onPress={submit} size="sm" variant="primary">
                <Button.Label>保存</Button.Label>
              </Button>
            </View>
          </Dialog.Content>
        </KeyboardAvoidingView>
      </Dialog.Portal>
    </Dialog>
  );
};
