import { useRef, useState } from "react";

import {
  bookOf,
  OwnPatternsContext,
  PatternsContext,
  presetPatterns,
} from "../lib/design-patterns";
import type { PatternBook } from "../lib/design-patterns";
import { useShownDays, useUser } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import { useWorkChanges } from "../lib/design-work-changes";
import { DesignCalendar } from "./design-calendar";
import { DesignGroup } from "./design-group";
import type { GroupStart } from "./design-group";
import { JoinScreen } from "./design-group-join";
import { Phone } from "./design-phone";
import { DesignSettings } from "./design-settings";
import type { SettingsPage } from "./design-settings";
import { PhoneContext } from "./design-sheet";
import type { Tab } from "./design-tab-bar";
import { useThemeStyle } from "./design-theme";
import { PhoneToasts, ToastContext, usePhoneToaster } from "./design-toast";

// One person's phone. Their data comes from the nearest UserStoreContext,
// so two phones under one store show the same person.
export function DesignApp({
  initialEditing,
  initialDay = 1,
  initialMonth = 8,
  variants,
  pendingInvite = false,
  initialTab = "calendar",
  initialSettingsPage,
  initialGroupPage,
  initialDetail,
  fullScreen = false,
}: {
  initialEditing: boolean;
  // The day entering starts on, as the top page opens on its first blank.
  initialDay?: number;
  // On /try: filling a real phone's screen rather than a pictured one.
  fullScreen?: boolean;
  initialMonth?: number;
  variants: DesignVariants;
  // For the flow diagrams: a tab, and a settings page, to open on.
  initialTab?: Tab;
  initialSettingsPage?: SettingsPage;
  // And the group tab's page: its hub, the shift table or the group chat.
  initialGroupPage?: GroupStart;
  // A day of initialMonth to open on picked, its week folded out of the
  // month with the day's details under it, as a reminder opens it.
  initialDetail?: Date;
  // A group's invitation link was opened: ask about joining, in a screen
  // over the calendar.
  pendingInvite?: boolean;
}) {
  const phoneRef = useRef<HTMLDivElement>(null);
  const { say: toast, toaster } = usePhoneToaster();
  const themeStyle = useThemeStyle();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [joining, setJoining] = useState(pendingInvite);
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  // The group the group tab opens on, like one just joined from a link.
  const [openGroup, setOpenGroup] = useState<string>();
  const profile = useUser((state) => state.profile);
  const setProfile = useUser((state) => state.setProfile);
  const rules = useUser((state) => state.rules);
  // The month in view on the calendar. The days as every tab shows them
  // are worked out through it, however far ahead it is.
  const [month, setMonth] = useState(() => new Date(2026, initialMonth, 1));
  const schedule = useShownDays(month);
  const { applyRule, changeJob, fixRule, setHolidaysOff } =
    useWorkChanges(schedule);
  const ownPatterns = useUser((state) => state.patterns);
  // The person's own patterns, over the ready-made ones that templates
  // and samples name.
  const book: PatternBook = { ...presetPatterns, ...bookOf(ownPatterns) };
  return (
    <PatternsContext value={book}>
      <OwnPatternsContext value={ownPatterns}>
        <PhoneContext value={phoneRef}>
          <ToastContext value={toast}>
            <Phone fullScreen={fullScreen} ref={phoneRef} style={themeStyle}>
              {tab === "settings" && (
                <DesignSettings
                  initialPage={initialSettingsPage}
                  onApplyRule={applyRule}
                  onChangeJob={changeJob}
                  onFixRule={fixRule}
                  onHolidaysOff={setHolidaysOff}
                  onProfile={setProfile}
                  onTab={setTab}
                  patterns={ownPatterns}
                  profile={profile}
                  rules={rules}
                  schedule={schedule}
                />
              )}
              {tab === "group" && (
                <DesignGroup
                  initialGroupId={openGroup}
                  initialPage={initialGroupPage}
                  photoSend={variants.photoSend}
                  scanResult={variants.scanResult}
                  onTab={setTab}
                  patterns={ownPatterns}
                  profile={profile}
                  schedule={schedule}
                />
              )}
              {joining && (
                <JoinScreen
                  onClose={() => {
                    setJoining(false);
                  }}
                  onJoin={(joined) => {
                    setGroups([...groups, joined]);
                    setJoining(false);
                    setOpenGroup(joined.id);
                    setTab("group");
                    toast(`「${joined.name}」に参加しました`);
                  }}
                  profile={profile}
                />
              )}
              <DesignCalendar
                covered={joining}
                initialDay={initialDay}
                initialDetail={initialDetail}
                initialEditing={initialEditing}
                month={month}
                onMonth={setMonth}
                onTab={setTab}
                schedule={schedule}
                shown={tab === "calendar"}
              />
              <PhoneToasts toaster={toaster} />
            </Phone>
          </ToastContext>
        </PhoneContext>
      </OwnPatternsContext>
    </PatternsContext>
  );
}
