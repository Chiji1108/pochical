import { Stack } from "expo-router";

export default function PatternsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "パターン",
        }}
      />
      <Stack.Screen name="new" options={{ title: "新規追加" }} />
      <Stack.Screen name="[patternId]" options={{ title: "編集" }} />
    </Stack>
  );
}
