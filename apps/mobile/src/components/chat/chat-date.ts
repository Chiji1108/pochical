import dayjs from "dayjs";

export const formatChatDate = (
  createdAt: Date | number,
  now: Date | number = Date.now()
): string => {
  const date = dayjs(createdAt);
  const today = dayjs(now);
  if (date.isSame(today, "day")) {
    return "今日";
  }
  if (date.isSame(today.subtract(1, "day"), "day")) {
    return "昨日";
  }
  return date.format(date.isSame(today, "year") ? "M月D日" : "YYYY年M月D日");
};
