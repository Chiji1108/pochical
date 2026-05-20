import { Text } from "heroui-native";
import { Alert, Linking } from "react-native";

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.。、]+$/;

type LinkifiedTextProps = {
  className?: string;
  linkClassName?: string;
  text: string;
};

type TextPart =
  | {
      text: string;
      type: "text";
    }
  | {
      displayText: string;
      trailingText: string;
      type: "link";
      url: string;
    };

const normalizeUrl = (url: string) =>
  url.startsWith("www.") ? `https://${url}` : url;

const mergeClassNames = (...classNames: (string | undefined)[]) =>
  classNames.filter(Boolean).join(" ");

const splitTextIntoParts = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const rawUrl = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, startIndex),
        type: "text",
      });
    }

    const displayText = rawUrl.replace(TRAILING_PUNCTUATION_REGEX, "");
    parts.push({
      displayText,
      trailingText: rawUrl.slice(displayText.length),
      type: "link",
      url: normalizeUrl(displayText),
    });
    lastIndex = startIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      type: "text",
    });
  }

  return parts;
};

const openUrl = async (url: string) => {
  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert(
      "リンクを開けません",
      error instanceof Error ? error.message : "時間をおいて再試行してください"
    );
  }
};

export const LinkifiedText = ({
  className,
  linkClassName,
  text,
}: LinkifiedTextProps) => {
  const resolvedLinkClassName = mergeClassNames(
    className,
    "underline",
    linkClassName
  );

  return (
    <Text className={className}>
      {splitTextIntoParts(text).map((part, index) => {
        const key = `${part.type}-${index}`;

        if (part.type === "text") {
          return (
            <Text className={className} key={key}>
              {part.text}
            </Text>
          );
        }

        return (
          <Text className={className} key={key}>
            <Text
              className={resolvedLinkClassName}
              onPress={() => {
                openUrl(part.url).catch(() => undefined);
              }}
            >
              {part.displayText}
            </Text>
            <Text className={className}>{part.trailingText}</Text>
          </Text>
        );
      })}
    </Text>
  );
};
