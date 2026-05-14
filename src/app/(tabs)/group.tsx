import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { TodoList } from "@/components/todo-list";

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function Group() {
  return (
    <StyledSafeAreaView
      className="flex-1 items-center justify-center bg-background"
      edges={["top", "left", "right", "bottom"]}
    >
      <TodoList />
    </StyledSafeAreaView>
  );
}
