import { Text } from "heroui-native";
import { useDb, useSession } from "jazz-tools/react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { app } from "../schema";

export function AddTodo() {
  const db = useDb();
  const session = useSession();
  const [name, setName] = useState("");

  const addTodo = () => {
    if (!(name.trim() && session)) {
      return;
    }
    db.insert(app.todos, { name, done: false });
    setName("");
  };

  return (
    <View>
      <TextInput
        onChangeText={setName}
        onSubmitEditing={addTodo}
        placeholder="What needs to be done?"
        value={name}
      />
      <Pressable onPress={addTodo}>
        <Text>Add</Text>
      </Pressable>
    </View>
  );
}
