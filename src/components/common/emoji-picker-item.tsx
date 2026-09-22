import { EmojiSheetModule } from "expo-native-sheet-emojis";
import { ListGroup, Text, useThemeColor } from "heroui-native";
import { useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";

type EmojiPickerItemProps = {
  emoji: string;
  onChangeEmoji: (emoji: string) => void;
};

export const EmojiPickerItem = ({
  emoji,
  onChangeEmoji,
}: EmojiPickerItemProps) => {
  const presenting = useRef(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [background, surface, foreground, muted, accent, border] =
    useThemeColor([
      "background",
      "surface",
      "foreground",
      "muted",
      "accent",
      "border",
    ]);

  const pickEmoji = async () => {
    if (presenting.current) {
      return;
    }

    presenting.current = true;
    setIsPresenting(true);
    Keyboard.dismiss();

    try {
      const result = await EmojiSheetModule.present({
        theme: {
          accentColor: accent,
          backgroundColor: background,
          dividerColor: border,
          searchBarBackgroundColor: surface,
          textColor: foreground,
          textSecondaryColor: muted,
        },
        translations: {
          categoryNames: {
            activities: "活動",
            animals_nature: "動物と自然",
            flags: "旗",
            food_drink: "食べ物と飲み物",
            frequently_used: "よく使う絵文字",
            objects: "もの",
            people_body: "人と体",
            search_results: "検索結果",
            smileys_emotion: "顔と感情",
            symbols: "記号",
            travel_places: "旅行と場所",
          },
          noResultsText: "絵文字が見つかりません",
          searchPlaceholder: "絵文字を検索",
        },
      });

      if (!result.cancelled) {
        onChangeEmoji(result.emoji);
      }
    } catch {
      Alert.alert("絵文字を選択できません", "もう一度お試しください。");
    } finally {
      presenting.current = false;
      setIsPresenting(false);
    }
  };

  return (
    <ListGroup.Item
      accessibilityLabel={`アイコンを選択、現在は${emoji}`}
      disabled={isPresenting}
      onPress={pickEmoji}
    >
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>アイコン</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Text className="text-3xl">{emoji}</Text>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
};
