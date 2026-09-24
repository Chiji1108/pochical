import { Skeleton } from "heroui-native";
import { View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";

const ROWS = ["first", "second", "third"] as const;
const TABLE_ROWS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
] as const;

const SkeletonRow = () => (
  <View className="flex-row items-center gap-3 px-4 py-4">
    <Skeleton className="size-6 rounded-md" variant="none" />
    <View className="flex-1 gap-2">
      <Skeleton className="h-4 w-3/5 rounded-md" variant="none" />
      <Skeleton className="h-3 w-4/5 rounded-md" variant="none" />
    </View>
    <Skeleton className="h-3 w-7 rounded-md" variant="none" />
  </View>
);

export const GroupRailSkeleton = () => (
  <View
    accessibilityElementsHidden
    className="w-[68px] items-center gap-4 border-border border-r px-2 py-4"
    importantForAccessibility="no-hide-descendants"
  >
    <Skeleton className="size-8 rounded-lg" variant="none" />
    <Skeleton className="size-8 rounded-lg" variant="none" />
    <View className="my-1 h-px w-full bg-border" />
    {ROWS.map((key) => (
      <Skeleton className="size-11 rounded-xl" key={key} variant="none" />
    ))}
  </View>
);

export const GroupContentSkeleton = ({
  layout = "detail",
}: {
  layout?: "detail" | "settings" | "shifts";
}) => (
  <View
    accessibilityLabel="グループを読み込み中"
    accessibilityState={{ busy: true }}
    accessible
    className="flex-1 overflow-hidden"
  >
    <View
      accessibilityElementsHidden
      className="gap-4 p-4"
      importantForAccessibility="no-hide-descendants"
    >
      {layout === "shifts" ? (
        <>
          <Skeleton className="h-6 w-28 rounded-md" variant="none" />
          <View className="overflow-hidden rounded-xl border border-border">
            {TABLE_ROWS.map((key) => (
              <View
                className="flex-row gap-3 border-border border-b p-4"
                key={key}
              >
                <Skeleton className="h-5 w-10 rounded-md" variant="none" />
                {ROWS.map((column) => (
                  <Skeleton
                    className="h-5 flex-1 rounded-md"
                    key={column}
                    variant="none"
                  />
                ))}
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          {layout === "settings" && (
            <Skeleton className="h-12 w-full rounded-xl" variant="none" />
          )}
          <View className="overflow-hidden rounded-xl bg-surface">
            <SkeletonRow />
            <View className="mx-4 h-px bg-border" />
            <SkeletonRow />
          </View>
          <Skeleton className="mt-1 h-5 w-28 rounded-md" variant="none" />
          <View className="overflow-hidden rounded-xl bg-surface">
            {ROWS.map((key) => (
              <SkeletonRow key={key} />
            ))}
          </View>
        </>
      )}
    </View>
  </View>
);

export const GroupLoadingScreen = ({
  title,
  onBack,
  layout,
}: {
  title: string;
  onBack: () => void;
  layout: "settings" | "shifts";
}) => (
  <View className="flex-1 bg-background">
    <AppHeader
      leftAction={{
        accessibilityLabel: "グループに戻る",
        label: "戻る",
        icon: { android: "arrow_back", ios: "chevron.left", web: "arrow_back" },
        onPress: onBack,
      }}
      title={title}
    />
    <GroupContentSkeleton layout={layout} />
  </View>
);
