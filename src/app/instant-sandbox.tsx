import { id } from "@instantdb/react-native";
import { addDays, startOfDay } from "date-fns";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Button, ListGroup, Separator, Text } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { AppHeader } from "@/components/navigation/app-header";
import { db } from "@/lib/instant";

const SANDBOX_PREFIX = "[InstantSandbox]";

const formatTime = (time: number) =>
  new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(time));

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "不明なエラー";

export default function InstantSandbox() {
  const router = useRouter();
  const auth = db.useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [lastResult, setLastResult] = useState("未実行");
  const userId = auth.user?.id;
  const range = useMemo(() => {
    const today = startOfDay(new Date()).getTime();

    return {
      end: addDays(today, 3).getTime(),
      start: addDays(today, -3).getTime(),
      today,
    };
  }, []);
  const query = userId
    ? {
        dayNotes: {
          $: {
            where: {
              "owner.id": userId,
            },
          },
          owner: {},
        },
        shiftMembers: {
          $: {
            where: {
              "owner.id": userId,
            },
          },
          owner: {},
        },
        shiftPatterns: {
          $: {
            where: {
              "owner.id": userId,
            },
          },
          nextDayPattern: {},
          owner: {},
        },
        shifts: {
          $: {
            order: { startDate: "asc" as const },
            where: {
              "owner.id": { $in: [userId] },
              and: [
                { startDate: { $gte: range.start } },
                { startDate: { $lte: range.end } },
              ],
            },
          },
          owner: {},
          pattern: {},
          shiftMembers: {},
        },
      }
    : null;
  const { data, error, isLoading } = db.useQuery(query);
  const sandboxShifts = (data?.shifts ?? []).filter((shift) =>
    shift.pattern?.name?.startsWith(SANDBOX_PREFIX)
  );
  const sandboxPatterns = (data?.shiftPatterns ?? []).filter((pattern) =>
    pattern.name.startsWith(SANDBOX_PREFIX)
  );
  const sandboxMembers = (data?.shiftMembers ?? []).filter((member) =>
    member.name.startsWith(SANDBOX_PREFIX)
  );
  const sandboxDayNotes = (data?.dayNotes ?? []).filter((dayNote) =>
    dayNote.notes.startsWith(SANDBOX_PREFIX)
  );
  const queryStatus = (() => {
    if (isLoading) {
      return "loading";
    }

    if (error) {
      return "error";
    }

    return "ready";
  })();

  useEffect(() => {
    if (auth.isLoading || auth.user || isSigningIn) {
      return;
    }

    let isMounted = true;
    setIsSigningIn(true);
    db.auth
      .signInAsGuest()
      .then(() => {
        if (isMounted) {
          setLastResult("Guest sign-in 成功");
        }
      })
      .catch((signInError: unknown) => {
        if (isMounted) {
          setLastResult(`Guest sign-in 失敗: ${getErrorMessage(signInError)}`);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSigningIn(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [auth.isLoading, auth.user, isSigningIn]);

  const createLinkedSample = async () => {
    if (!userId) {
      Alert.alert("Guest sign-in 待ちです");
      return;
    }

    const runId = Date.now();
    const nightPatternId = id();
    const nextDayPatternId = id();
    const shiftMemberId = id();
    const shiftId = id();
    const dayNoteId = id();

    try {
      await db.transact([
        db.tx.shiftPatterns[nightPatternId]
          .create({
            countsAsDayOff: false,
            emoji: "🌃",
            isAllDay: false,
            name: `${SANDBOX_PREFIX} 夜勤 ${runId}`,
            orderIndex: 0,
          })
          .link({ nextDayPattern: nextDayPatternId, owner: userId }),
        db.tx.shiftPatterns[nextDayPatternId]
          .create({
            countsAsDayOff: true,
            emoji: "🌅",
            isAllDay: true,
            name: `${SANDBOX_PREFIX} 明け ${runId}`,
            orderIndex: 1,
          })
          .link({ owner: userId }),
        db.tx.shiftMembers[shiftMemberId]
          .create({
            name: `${SANDBOX_PREFIX} 佐藤 ${runId}`,
            orderIndex: 0,
          })
          .link({ owner: userId }),
        db.tx.shifts[shiftId].create({ startDate: range.today }).link({
          owner: userId,
          pattern: nightPatternId,
          shiftMembers: [shiftMemberId],
        }),
        db.tx.dayNotes[dayNoteId]
          .create({
            date: range.today,
            notes: `${SANDBOX_PREFIX} memo ${runId}`,
          })
          .link({ owner: userId }),
      ]);
      setLastResult("create().link() サンプル作成成功");
    } catch (createError) {
      setLastResult(`作成失敗: ${getErrorMessage(createError)}`);
    }
  };

  const unlinkFirstShiftMember = async () => {
    const [shift] = sandboxShifts;
    const [member] = shift?.shiftMembers ?? [];

    if (!(shift && member)) {
      Alert.alert("unlink 対象がありません");
      return;
    }

    try {
      await db.transact(
        db.tx.shifts[shift.id].unlink({ shiftMembers: member.id })
      );
      setLastResult("shiftMembers unlink 成功");
    } catch (unlinkError) {
      setLastResult(`unlink 失敗: ${getErrorMessage(unlinkError)}`);
    }
  };

  const deleteFirstShift = async () => {
    const [shift] = sandboxShifts;

    if (!shift) {
      Alert.alert("削除対象の shift がありません");
      return;
    }

    try {
      await db.transact(db.tx.shifts[shift.id].delete());
      setLastResult("shift delete 成功");
    } catch (deleteError) {
      setLastResult(`shift delete 失敗: ${getErrorMessage(deleteError)}`);
    }
  };

  const deleteSandboxRows = async () => {
    if (!data) {
      return;
    }

    const sandboxPatternIds = sandboxPatterns.map((pattern) => pattern.id);
    const sandboxShiftIds = sandboxShifts.map((shift) => shift.id);
    const sandboxMemberIds = sandboxMembers.map((member) => member.id);
    const sandboxDayNoteIds = sandboxDayNotes.map((dayNote) => dayNote.id);

    try {
      await db.transact([
        ...sandboxShiftIds.map((shiftId) => db.tx.shifts[shiftId].delete()),
        ...sandboxPatternIds.map((patternId) =>
          db.tx.shiftPatterns[patternId].delete()
        ),
        ...sandboxMemberIds.map((memberId) =>
          db.tx.shiftMembers[memberId].delete()
        ),
        ...sandboxDayNoteIds.map((dayNoteId) =>
          db.tx.dayNotes[dayNoteId].delete()
        ),
      ]);
      setLastResult("sandbox rows delete 成功");
    } catch (deleteError) {
      setLastResult(
        `sandbox rows delete 失敗: ${getErrorMessage(deleteError)}`
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        leftAction={{
          accessibilityLabel: "戻る",
          icon: {
            android: "arrow_back",
            ios: "chevron.left",
            web: "arrow_back",
          },
          label: "戻る",
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
              return;
            }

            router.replace("/settings");
          },
        }}
        title="InstantDB Sandbox"
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 py-5"
      >
        <View className="gap-2">
          <Text className="font-semibold text-sm" color="muted">
            Auth
          </Text>
          <ListGroup>
            <InfoRow
              label="状態"
              value={auth.user ? "Signed in" : "Signed out"}
            />
            <Separator className="mx-4" />
            <InfoRow
              label="User ID"
              value={auth.user?.id ? auth.user.id.slice(0, 8) : "なし"}
            />
            <Separator className="mx-4" />
            <InfoRow label="Query" value={queryStatus} />
          </ListGroup>
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-sm" color="muted">
            Actions
          </Text>
          <View className="gap-2">
            <Button onPress={createLinkedSample} variant="primary">
              <SymbolView
                name={{ android: "add", ios: "plus", web: "add" }}
                size={16}
                tintColor="white"
              />
              <Button.Label>create + owner/pattern/member links</Button.Label>
            </Button>
            <Button onPress={unlinkFirstShiftMember} variant="outline">
              <Button.Label>unlink first shift member</Button.Label>
            </Button>
            <Button onPress={deleteFirstShift} variant="outline">
              <Button.Label>delete first shift</Button.Label>
            </Button>
            <Button onPress={deleteSandboxRows} variant="ghost">
              <Button.Label>delete sandbox rows</Button.Label>
            </Button>
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-sm" color="muted">
            Result
          </Text>
          <Text selectable={true}>{error ? error.message : lastResult}</Text>
        </View>

        <View className="gap-2">
          <Text className="font-semibold text-sm" color="muted">
            Linked Query
          </Text>
          <ListGroup>
            <InfoRow label="Patterns" value={String(sandboxPatterns.length)} />
            <Separator className="mx-4" />
            <InfoRow label="Shifts" value={String(sandboxShifts.length)} />
            <Separator className="mx-4" />
            <InfoRow label="Members" value={String(sandboxMembers.length)} />
            <Separator className="mx-4" />
            <InfoRow label="Notes" value={String(sandboxDayNotes.length)} />
          </ListGroup>
        </View>

        {sandboxShifts.map((shift) => (
          <View
            className="gap-1 rounded-lg border border-border p-3"
            key={shift.id}
          >
            <Text className="font-semibold">{formatTime(shift.startDate)}</Text>
            <Text>pattern: {shift.pattern?.name ?? "なし"}</Text>
            <Text>
              members:{" "}
              {(shift.shiftMembers ?? [])
                .map((member) => member.name)
                .join(", ") || "なし"}
            </Text>
            <Text>owner: {shift.owner?.id?.slice(0, 8) ?? "なし"}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <ListGroup.Item>
    <ListGroup.ItemContent>
      <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
    </ListGroup.ItemContent>
    <ListGroup.ItemSuffix>
      <Text className="text-xs" color="muted">
        {value}
      </Text>
    </ListGroup.ItemSuffix>
  </ListGroup.Item>
);
