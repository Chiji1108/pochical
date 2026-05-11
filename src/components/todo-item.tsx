import { useAll, useDb } from "jazz-tools/react-native";
import { Pressable, Switch, View } from "react-native";
import { app } from "../schema";
import { AppText } from "./app-text";

export function TodoItem({ id }: { id: string }) {
  const db = useDb();
  const [todo] = useAll(app.todos.where({ id }).limit(1)) ?? [];

  if (!todo) {
    return null;
  }

  return (
    <View>
      <Switch
        onValueChange={() => {
          db.update(app.todos, id, { done: !todo.done });
        }}
        value={todo.done}
      />
      <AppText>{todo.name}</AppText>
      <Pressable onPress={() => db.delete(app.todos, id)}>
        <AppText>Delete</AppText>
      </Pressable>
    </View>
  );
}
