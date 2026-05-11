import { Text, type TextProps } from "react-native";
import { cn } from "@/lib/utils";

type AppTextProps = TextProps & {
  className?: string;
};

export function AppText({ className, ...props }: AppTextProps) {
  return <Text className={cn("text-foreground", className)} {...props} />;
}
