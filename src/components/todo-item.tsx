import { Text } from "heroui-native";
import { useAll, useDb } from "jazz-tools/react-native";
import { Pressable, Switch, View } from "react-native";
import { app } from "../schema";

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
      <Text>{todo.name}</Text>
      <Pressable onPress={() => db.delete(app.todos, id)}>
        <Text>Delete</Text>
      </Pressable>
    </View>
  );
}
