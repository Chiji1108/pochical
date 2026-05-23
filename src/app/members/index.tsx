import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { MemberListView } from "@/components/member/member-list-view";
import { AppHeader } from "@/components/navigation/app-header";
import type { Member } from "@/lib/instant";

export default function Members() {
  const router = useRouter();
  const [editingMember, setEditingMember] = useState<Member>();
  const [isAddingMember, setIsAddingMember] = useState(false);

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "閉じる",
          label: "閉じる",
          onPress: () => {
            router.back();
          },
        }}
        rightAction={{
          accessibilityLabel: "勤務メンバーを追加",
          icon: {
            android: "add",
            ios: "plus",
            web: "add",
          },
          onPress: () => {
            setIsAddingMember(true);
          },
        }}
        title="勤務メンバー"
      />
      <MemberListView
        editingMember={editingMember}
        isAddingMember={isAddingMember}
        onCloseAddDialog={() => {
          setIsAddingMember(false);
        }}
        onCloseEditDialog={() => {
          setEditingMember(undefined);
        }}
        onEditMember={setEditingMember}
      />
    </View>
  );
}
