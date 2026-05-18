import { Button, Dialog, Select, Switch, Text } from "heroui-native";
import { View } from "react-native";
import type { CalendarSelectOption } from "@/lib/device-calendar";

export type ExportDialogResult = {
  message: string;
  title: string;
};

type CalendarSelectSection = {
  options: CalendarSelectOption[];
  sourceName: string;
};

type ExportCalendarDialogProps = {
  calendarSelectOptions: CalendarSelectOption[];
  excludeDayOffShiftsFromExport: boolean;
  exportDialogResult?: ExportDialogResult;
  isExportingMonth: boolean;
  isLoadingCalendars: boolean;
  isOpen: boolean;
  monthLabel: string;
  onChangeExcludeDayOffShiftsFromExport: (isSelected: boolean) => void;
  onChangeOpen: (isOpen: boolean) => void;
  onChangeSelectedCalendarId: (calendarId?: string) => void;
  onExport: () => Promise<void>;
  onExportError: () => void;
  selectedCalendarId?: string;
  selectedCalendarOption?: CalendarSelectOption;
  shiftCount: number;
};

const getCalendarSelectSections = (
  options: CalendarSelectOption[]
): CalendarSelectSection[] => {
  const sections: CalendarSelectSection[] = [];

  for (const option of options) {
    const section = sections.find(
      (currentSection) => currentSection.sourceName === option.sourceName
    );

    if (section) {
      section.options.push(option);
      continue;
    }

    sections.push({
      options: [option],
      sourceName: option.sourceName,
    });
  }

  return sections;
};

export const ExportCalendarDialog = ({
  calendarSelectOptions,
  excludeDayOffShiftsFromExport,
  exportDialogResult,
  isExportingMonth,
  isLoadingCalendars,
  isOpen,
  monthLabel,
  onChangeExcludeDayOffShiftsFromExport,
  onChangeOpen,
  onChangeSelectedCalendarId,
  onExport,
  onExportError,
  selectedCalendarId,
  selectedCalendarOption,
  shiftCount,
}: ExportCalendarDialogProps) => {
  const hasCalendarOptions = calendarSelectOptions.length > 0;
  const calendarSelectSections = getCalendarSelectSections(
    calendarSelectOptions
  );

  return (
    <Dialog isOpen={isOpen} onOpenChange={onChangeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Close variant="ghost" />
          <View className="mb-5 gap-2">
            <Dialog.Title>
              {exportDialogResult?.title ?? "端末カレンダーに追加"}
            </Dialog.Title>
            <Dialog.Description>
              {exportDialogResult?.message ??
                `${monthLabel}のシフト ${shiftCount}件を端末カレンダーに追加します。`}
            </Dialog.Description>
          </View>
          {exportDialogResult ? null : (
            <View className="mb-5 gap-3">
              <View className="flex-row items-center justify-between gap-4 rounded-lg bg-foreground/5 px-3 py-3">
                <Text className="min-w-0 flex-1 text-sm" numberOfLines={2}>
                  休日扱いのシフトは書き出さない
                </Text>
                <Switch
                  isDisabled={isExportingMonth}
                  isSelected={excludeDayOffShiftsFromExport}
                  onSelectedChange={onChangeExcludeDayOffShiftsFromExport}
                />
              </View>
              {hasCalendarOptions ? (
                <View className="gap-1">
                  <Text className="text-sm" color="muted">
                    追加先カレンダー
                  </Text>
                  {calendarSelectOptions.length > 1 ? (
                    <Select
                      isDisabled={isExportingMonth || isLoadingCalendars}
                      onValueChange={(option) => {
                        onChangeSelectedCalendarId(option?.value);
                      }}
                      presentation="bottom-sheet"
                      value={selectedCalendarOption}
                    >
                      <Select.Trigger>
                        <Select.Value placeholder="追加先を選択" />
                        <Select.TriggerIndicator />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Overlay />
                        <Select.Content presentation="bottom-sheet">
                          {calendarSelectSections.map((section) => (
                            <View key={section.sourceName}>
                              <Select.ListLabel>
                                {section.sourceName}
                              </Select.ListLabel>
                              {section.options.map((option) => (
                                <Select.Item
                                  className="pl-8"
                                  key={option.value}
                                  label={option.label}
                                  value={option.value}
                                />
                              ))}
                            </View>
                          ))}
                        </Select.Content>
                      </Select.Portal>
                    </Select>
                  ) : (
                    <View className="rounded-lg bg-foreground/5 px-3 py-3">
                      <Text className="text-sm" numberOfLines={1}>
                        {selectedCalendarOption?.label}
                      </Text>
                    </View>
                  )}
                  <Text className="text-xs" color="muted">
                    端末カレンダーへのアクセス許可が必要です。
                  </Text>
                </View>
              ) : (
                <View className="gap-1">
                  <View className="rounded-lg bg-foreground/5 px-3 py-3">
                    <Text className="text-sm" color="muted">
                      {isLoadingCalendars
                        ? "追加先カレンダーを確認しています。"
                        : "追加先カレンダーが見つかりません。"}
                    </Text>
                  </View>
                  <Text className="text-xs" color="muted">
                    端末カレンダーへのアクセス許可が必要です。
                  </Text>
                </View>
              )}
            </View>
          )}
          <View className="flex-row justify-end gap-2">
            {exportDialogResult ? (
              <Button
                onPress={() => {
                  onChangeOpen(false);
                }}
                size="sm"
                variant="primary"
              >
                <Button.Label>閉じる</Button.Label>
              </Button>
            ) : (
              <>
                <Button
                  isDisabled={isExportingMonth}
                  onPress={() => {
                    onChangeOpen(false);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <Button.Label>キャンセル</Button.Label>
                </Button>
                <Button
                  isDisabled={
                    isExportingMonth ||
                    isLoadingCalendars ||
                    !hasCalendarOptions ||
                    !selectedCalendarId ||
                    shiftCount === 0
                  }
                  onPress={() => {
                    onExport().catch(onExportError);
                  }}
                  size="sm"
                  variant="primary"
                >
                  <Button.Label>
                    {isExportingMonth ? "追加中" : "追加する"}
                  </Button.Label>
                </Button>
              </>
            )}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};
