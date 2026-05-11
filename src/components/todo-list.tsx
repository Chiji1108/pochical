import { useAll } from "jazz-tools/react-native";
import { FlatList, View } from "react-native";
import { app } from "../schema";
import { AddTodo } from "./add-todo";
import { TodoItem } from "./todo-item";

export function TodoList() {
  const todos = useAll(app.todos) ?? [];

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TodoItem id={item.id} />}
      />
      <AddTodo />
    </View>
  );
}
