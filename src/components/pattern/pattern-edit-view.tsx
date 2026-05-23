import { id } from "@instantdb/react-native";
import { useRouter } from "expo-router";
import {
  Input,
  ListGroup,
  PressableFeedback,
  Select,
  Separator,
  Switch,
  Text,
  TextField,
} from "heroui-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { EmojiPopup } from "react-native-emoji-popup";
import { EmojiPopupCloseButton } from "@/components/common/emoji-popup-close-button";
import { AppHeader } from "@/components/navigation/app-header";
import { PatternTimePickerButton } from "@/components/pattern/pattern-time-picker-button";
import {
  playLightImpactHaptic,
  playSelectionHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import {
  db,
  type InstantTransaction,
  type Pattern,
  useCurrentUserId,
  useOwnWorkData,
} from "@/lib/instant";

const DEFAULT_EMOJI = "❤️";
const DEFAULT_NAME = "";
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 17;
const DEFAULT_END_MINUTE = 30;
const MINUTES_PER_HOUR = 60;

type PatternEditViewProps = {
  pattern?: Pattern;
};

type PatternFormState = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate: Date;
  isAllDay: boolean;
  name: string;
  nextDayPatternId?: string;
  startDate: Date;
};

type PatternSaveFields = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate?: Date | null;
  isAllDay: boolean;
  name: string;
  startDate?: Date | null;
};

type SelectOption = {
  label: string;
  value: string;
};

const createTime = (hour: number, minute = 0): Date => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const toDate = (
  value: Date | number | null | undefined,
  fallback: Date
): Date => {
  if (value instanceof Date) {
    return value;
  }

  return value == null ? fallback : new Date(value);
};

const getMinutesOfDay = (date: Date): number =>
  date.getHours() * MINUTES_PER_HOUR + date.getMinutes();

const isContinuingUntilNextDay = (startDate: Date, endDate: Date): boolean =>
  getMinutesOfDay(endDate) <= getMinutesOfDay(startDate);

const getInitialFormState = (pattern?: Pattern): PatternFormState => ({
  countsAsDayOff: pattern?.countsAsDayOff ?? false,
  emoji: pattern?.emoji || DEFAULT_EMOJI,
  endDate: toDate(
    pattern?.endDate,
    createTime(DEFAULT_END_HOUR, DEFAULT_END_MINUTE)
  ),
  isAllDay: pattern?.isAllDay ?? false,
  name: pattern?.name ?? DEFAULT_NAME,
  nextDayPatternId: pattern?.nextDayPattern?.id ?? undefined,
  startDate: toDate(pattern?.startDate, createTime(DEFAULT_START_HOUR)),
});

const createPatternSaveFields = (
  formState: PatternFormState,
  shouldClearEmptyOptionals: boolean
): PatternSaveFields => {
  const saveFields: PatternSaveFields = {
    countsAsDayOff: formState.countsAsDayOff,
    emoji: formState.emoji || DEFAULT_EMOJI,
    isAllDay: formState.isAllDay,
    name: formState.name.trim(),
  };

  if (formState.isAllDay) {
    if (shouldClearEmptyOptionals) {
      saveFields.endDate = null;
      saveFields.startDate = null;
    }
  } else {
    saveFields.endDate = formState.endDate;
    saveFields.startDate = formState.startDate;
  }

  return saveFields;
};

export const PatternEditView = ({ pattern }: PatternEditViewProps) => {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const isSignedIn = Boolean(currentUserId);
  const { patterns, shifts } = useOwnWorkData(currentUserId);
  const [formState, setFormState] = useState(() =>
    getInitialFormState(pattern)
  );
  const selectedNextDayPattern = formState.nextDayPatternId
    ? patterns.find((item) => item.id === formState.nextDayPatternId)
    : undefined;
  const isNewPattern = !pattern;
  const isContinueUntilNextDay =
    !formState.isAllDay &&
    isContinuingUntilNextDay(formState.startDate, formState.endDate);
  const relatedShifts = useMemo(
    () =>
      pattern ? shifts.filter((shift) => shift.pattern?.id === pattern.id) : [],
    [pattern, shifts]
  );
  const patternsUsingThisAsNextDay = useMemo(
    () =>
      pattern
        ? patterns.filter(
            (item) =>
              item.id !== pattern.id && item.nextDayPattern?.id === pattern.id
          )
        : [],
    [pattern, patterns]
  );
  const nextDayPatternOptions = useMemo(
    () =>
      patterns
        .filter(
          (item) =>
            item.id !== pattern?.id &&
            (item.isAllDay || item.id === formState.nextDayPatternId)
        )
        .map<SelectOption>((item) => ({
          label: `${item.emoji} ${item.name}`,
          value: item.id,
        })),
    [formState.nextDayPatternId, pattern?.id, patterns]
  );
  const nextDaySelectValue: SelectOption | undefined =
    formState.nextDayPatternId
      ? {
          label: selectedNextDayPattern
            ? `${selectedNextDayPattern.emoji} ${selectedNextDayPattern.name}`
            : "選択中のシフトパターン",
          value: formState.nextDayPatternId,
        }
      : undefined;

  const updateFormState = (nextFormState: Partial<PatternFormState>) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      ...nextFormState,
    }));
  };

  const deletePattern = async () => {
    if (!(pattern && currentUserId)) {
      return;
    }

    const transactions: InstantTransaction[] = relatedShifts.map((shift) =>
      db.tx.shifts[shift.id].delete()
    );

    for (const item of patternsUsingThisAsNextDay) {
      transactions.push(
        db.tx.shiftPatterns[item.id].unlink({ nextDayPattern: pattern.id })
      );
    }

    const remainingPatterns = patterns
      .filter((item) => item.id !== pattern.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    for (const [orderIndex, item] of remainingPatterns.entries()) {
      if (item.orderIndex !== orderIndex) {
        transactions.push(
          db.tx.shiftPatterns[item.id].update({
            orderIndex,
          })
        );
      }
    }

    transactions.push(db.tx.shiftPatterns[pattern.id].delete());
    await db.transact(transactions);

    playLightImpactHaptic();
    router.back();
  };

  const confirmDeletePattern = () => {
    if (!pattern) {
      return;
    }

    const patternName = pattern.name.trim() || "シフトパターン";
    const message =
      relatedShifts.length > 0
        ? `関連する${relatedShifts.length}件のシフトも削除されます。`
        : "この操作は取り消せません。";

    playWarningHaptic();

    Alert.alert(`${patternName}を削除しますか？`, message, [
      {
        style: "cancel",
        text: "キャンセル",
      },
      {
        onPress: deletePattern,
        style: "destructive",
        text: "削除",
      },
    ]);
  };

  const savePattern = async () => {
    if (!currentUserId) {
      return;
    }

    if (!formState.name.trim()) {
      Alert.alert("名前を入力してください");
      return;
    }

    const saveFields = createPatternSaveFields(formState, Boolean(pattern));

    const shouldLinkNextDayPattern =
      isContinueUntilNextDay && Boolean(formState.nextDayPatternId);

    if (pattern) {
      let transaction = db.tx.shiftPatterns[pattern.id].update(saveFields);
      if (shouldLinkNextDayPattern && formState.nextDayPatternId) {
        transaction = transaction.link({
          nextDayPattern: formState.nextDayPatternId,
        });
      } else if (pattern.nextDayPattern?.id) {
        transaction = transaction.unlink({
          nextDayPattern: pattern.nextDayPattern.id,
        });
      }
      await db.transact(transaction);
    } else {
      let transaction = db.tx.shiftPatterns[id()]
        .create({
          ...saveFields,
          orderIndex: patterns.length,
        })
        .link({ owner: currentUserId });
      if (shouldLinkNextDayPattern && formState.nextDayPatternId) {
        transaction = transaction.link({
          nextDayPattern: formState.nextDayPatternId,
        });
      }
      await db.transact(transaction);
    }

    playLightImpactHaptic();
    router.back();
  };

  const setCountsAsDayOff = (countsAsDayOff: boolean) => {
    playSelectionHaptic();
    updateFormState({
      countsAsDayOff,
    });
  };

  const setAllDay = (isAllDay: boolean) => {
    playSelectionHaptic();
    updateFormState({
      isAllDay,
      nextDayPatternId: isAllDay ? undefined : formState.nextDayPatternId,
    });
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "シフトパターン一覧に戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: () => {
            router.back();
          },
        }}
        rightAction={{
          accessibilityLabel: "シフトパターンを保存",
          isDisabled: !isSignedIn,
          label: "保存",
          onPress: savePattern,
          variant: "primary",
        }}
        title={isNewPattern ? "新規追加" : "編集"}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <BasicInfoGroup
          emoji={formState.emoji}
          name={formState.name}
          onChangeEmoji={(emoji) => {
            playSelectionHaptic();
            updateFormState({ emoji });
          }}
          onChangeName={(name) => {
            updateFormState({ name });
          }}
        />

        <TimeSettings
          endDate={formState.endDate}
          isAllDay={formState.isAllDay}
          isContinueUntilNextDay={isContinueUntilNextDay}
          nextDayPatternOptions={nextDayPatternOptions}
          nextDaySelectValue={nextDaySelectValue}
          onChangeAllDay={setAllDay}
          onChangeEndDate={(endDate) => {
            updateFormState({ endDate });
          }}
          onChangeNextDayPattern={(nextDayPatternId) => {
            playSelectionHaptic();
            updateFormState({ nextDayPatternId });
          }}
          onChangeStartDate={(startDate) => {
            updateFormState({ startDate });
          }}
          startDate={formState.startDate}
        />

        <ListGroup>
          <SettingRow
            description="グループ画面で休みとして数えます"
            label="休み扱い"
            trailing={
              <Switch
                isSelected={formState.countsAsDayOff}
                onSelectedChange={setCountsAsDayOff}
              />
            }
          />
        </ListGroup>
        {pattern ? (
          <DeletePatternGroup
            isDisabled={!isSignedIn}
            onDelete={confirmDeletePattern}
            shiftCount={relatedShifts.length}
          />
        ) : null}
      </ScrollView>
    </View>
  );
};

type PatternPreviewProps = {
  emoji: string;
  name: string;
};

const PatternPreview = ({ emoji, name }: PatternPreviewProps) => (
  <View className="items-center">
    <View className="h-20 w-18 items-center justify-center gap-1 rounded-xl bg-surface-secondary px-2 py-2 shadow-surface">
      <Text className="text-3xl" numberOfLines={1}>
        {emoji}
      </Text>
      <Text className="text-center text-sm" numberOfLines={1}>
        {name || "名前"}
      </Text>
    </View>
  </View>
);

type BasicInfoGroupProps = {
  emoji: string;
  name: string;
  onChangeEmoji: (emoji: string) => void;
  onChangeName: (name: string) => void;
};

const BasicInfoGroup = ({
  emoji,
  name,
  onChangeEmoji,
  onChangeName,
}: BasicInfoGroupProps) => (
  <ListGroup>
    <View className="items-center py-5">
      <PatternPreview emoji={emoji} name={name} />
    </View>
    <Separator className="mx-4" />
    <EmojiPopup
      closeButton={EmojiPopupCloseButton}
      onEmojiSelected={onChangeEmoji}
    >
      <ListGroup.Item disabled={Platform.OS === "android"}>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle>アイコン</ListGroup.ItemTitle>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <Text className="text-3xl">{emoji}</Text>
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </EmojiPopup>
    <Separator className="mx-4" />
    <ListGroup.Item>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>名前</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix className="w-16">
        <TextField>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            className="text-center"
            onChangeText={onChangeName}
            placeholder="名前"
            value={name}
          />
        </TextField>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  </ListGroup>
);

type TimeSettingsProps = {
  endDate: Date;
  isAllDay: boolean;
  isContinueUntilNextDay: boolean;
  nextDayPatternOptions: SelectOption[];
  nextDaySelectValue?: SelectOption;
  onChangeAllDay: (isAllDay: boolean) => void;
  onChangeEndDate: (date: Date) => void;
  onChangeNextDayPattern: (patternId?: string) => void;
  onChangeStartDate: (date: Date) => void;
  startDate: Date;
};

const TimeSettings = ({
  endDate,
  isAllDay,
  isContinueUntilNextDay,
  nextDayPatternOptions,
  nextDaySelectValue,
  onChangeAllDay,
  onChangeEndDate,
  onChangeNextDayPattern,
  onChangeStartDate,
  startDate,
}: TimeSettingsProps) => (
  <ListGroup>
    <SettingRow
      label="終日"
      trailing={
        <Switch isSelected={isAllDay} onSelectedChange={onChangeAllDay} />
      }
    />
    {isAllDay ? null : (
      <>
        <Separator className="mx-4" />
        <TimeRangePickerRow
          endDate={endDate}
          endDayLabel={isContinueUntilNextDay ? "翌日" : undefined}
          onChangeEndDate={onChangeEndDate}
          onChangeStartDate={onChangeStartDate}
          startDate={startDate}
          startDayLabel={isContinueUntilNextDay ? "当日" : undefined}
        />
      </>
    )}
    {isAllDay || !isContinueUntilNextDay ? null : (
      <>
        <Separator className="mx-4" />
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>翌日シフトパターン</ListGroup.ItemTitle>
            <ListGroup.ItemDescription>
              終日パターンから選べます
            </ListGroup.ItemDescription>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix className="min-w-32">
            <Select
              onValueChange={(option) => {
                onChangeNextDayPattern(option?.value || undefined);
              }}
              presentation="bottom-sheet"
              value={nextDaySelectValue}
            >
              <Select.Trigger>
                <Select.Value placeholder="無し" />
                <Select.TriggerIndicator />
              </Select.Trigger>
              <Select.Portal>
                <Select.Overlay />
                <Select.Content presentation="bottom-sheet">
                  <Select.Item label="無し" value="" />
                  {nextDayPatternOptions.map((option) => (
                    <Select.Item
                      key={option.value}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </Select.Content>
              </Select.Portal>
            </Select>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </>
    )}
  </ListGroup>
);

type TimeRangePickerRowProps = {
  endDate: Date;
  endDayLabel?: string;
  onChangeEndDate: (date: Date) => void;
  onChangeStartDate: (date: Date) => void;
  startDate: Date;
  startDayLabel?: string;
};

const TimeRangePickerRow = ({
  endDate,
  endDayLabel,
  onChangeEndDate,
  onChangeStartDate,
  startDate,
  startDayLabel,
}: TimeRangePickerRowProps) => (
  <ListGroup.Item>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle>時間</ListGroup.ItemTitle>
    </ListGroup.ItemContent>
    <ListGroup.ItemSuffix className="min-w-42">
      <View className="flex-row items-end gap-2">
        <TimeRangePickerButton
          dayLabel={startDayLabel}
          onChangeDate={onChangeStartDate}
          value={startDate}
        />
        <Text className="pb-2 text-xl leading-none" color="muted">
          ›
        </Text>
        <TimeRangePickerButton
          dayLabel={endDayLabel}
          onChangeDate={onChangeEndDate}
          value={endDate}
        />
      </View>
    </ListGroup.ItemSuffix>
  </ListGroup.Item>
);

type TimeRangePickerButtonProps = {
  dayLabel?: string;
  onChangeDate: (date: Date) => void;
  value: Date;
};

const TimeRangePickerButton = ({
  dayLabel,
  onChangeDate,
  value,
}: TimeRangePickerButtonProps) => (
  <View className="items-center gap-1">
    {dayLabel ? (
      <Text className="text-xs" color="muted">
        {dayLabel}
      </Text>
    ) : null}
    <PatternTimePickerButton onSelectDate={onChangeDate} value={value} />
  </View>
);

type DeletePatternGroupProps = {
  isDisabled: boolean;
  onDelete: () => void;
  shiftCount: number;
};

const DeletePatternGroup = ({
  isDisabled,
  onDelete,
  shiftCount,
}: DeletePatternGroupProps) => (
  <ListGroup>
    <PressableFeedback
      animation={false}
      isDisabled={isDisabled}
      onPress={onDelete}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled={isDisabled}>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle className="text-danger">
              シフトパターンを削除
            </ListGroup.ItemTitle>
            {shiftCount > 0 ? (
              <ListGroup.ItemDescription>
                関連する{shiftCount}件のシフトも削除されます
              </ListGroup.ItemDescription>
            ) : null}
          </ListGroup.ItemContent>
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  </ListGroup>
);

type SettingRowProps = {
  description?: string;
  label: string;
  trailing: ReactNode;
};

const SettingRow = ({ description, label, trailing }: SettingRowProps) => (
  <ListGroup.Item>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
      {description ? (
        <ListGroup.ItemDescription>{description}</ListGroup.ItemDescription>
      ) : null}
    </ListGroup.ItemContent>
    <ListGroup.ItemSuffix>{trailing}</ListGroup.ItemSuffix>
  </ListGroup.Item>
);
