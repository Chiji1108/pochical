import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PatternEditView } from "@/components/pattern/pattern-edit-view";

export default function NewPattern() {
  const insets = useSafeAreaInsets();

  return <PatternEditView topInset={insets.top} />;
}
