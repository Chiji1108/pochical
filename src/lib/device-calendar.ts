import {
  CalendarAccessLevel,
  createEventAsync,
  type Calendar as DeviceCalendar,
  EntityTypes,
  getCalendarsAsync,
  getDefaultCalendarAsync,
  requestCalendarPermissionsAsync,
} from "expo-calendar";
import type { ShiftCalendarEvent } from "@/lib/calendar-export";

const READ_ONLY_CALENDAR_ACCESS_LEVELS = new Set<CalendarAccessLevel>([
  CalendarAccessLevel.FREEBUSY,
  CalendarAccessLevel.NONE,
  CalendarAccessLevel.READ,
]);
const LOCAL_CALENDAR_SOURCE_NAME = "この端末";

export type CalendarSelectOption = {
  label: string;
  sourceName: string;
  value: string;
};

const getCalendarSourceName = (calendar: DeviceCalendar): string =>
  calendar.source?.name || LOCAL_CALENDAR_SOURCE_NAME;

const isWritableCalendar = (calendar: DeviceCalendar): boolean =>
  calendar.allowsModifications &&
  !(
    calendar.accessLevel &&
    READ_ONLY_CALENDAR_ACCESS_LEVELS.has(calendar.accessLevel)
  );

export const getWritableCalendars = async (): Promise<
  DeviceCalendar[] | undefined
> => {
  const permission = await requestCalendarPermissionsAsync();

  if (!permission.granted) {
    return;
  }

  let defaultCalendar: DeviceCalendar | undefined;

  try {
    defaultCalendar = await getDefaultCalendarAsync();
  } catch {
    // Android does not always expose a default calendar through this API.
  }

  const calendars = await getCalendarsAsync(EntityTypes.EVENT);
  const writableCalendars = calendars.filter(isWritableCalendar);
  const orderedWritableCalendars: DeviceCalendar[] = [];

  if (defaultCalendar && isWritableCalendar(defaultCalendar)) {
    orderedWritableCalendars.push(defaultCalendar);
  }

  const primaryCalendar = writableCalendars.find(
    (calendar) => calendar.isPrimary
  );

  if (
    primaryCalendar &&
    !orderedWritableCalendars.some(
      (calendar) => calendar.id === primaryCalendar.id
    )
  ) {
    orderedWritableCalendars.push(primaryCalendar);
  }

  for (const calendar of writableCalendars) {
    if (
      orderedWritableCalendars.some(
        (orderedCalendar) => orderedCalendar.id === calendar.id
      )
    ) {
      continue;
    }

    orderedWritableCalendars.push(calendar);
  }

  return orderedWritableCalendars;
};

export const getCalendarSelectOptions = (
  calendars: DeviceCalendar[]
): CalendarSelectOption[] =>
  calendars.map((calendar) => ({
    label: calendar.title,
    sourceName: getCalendarSourceName(calendar),
    value: calendar.id,
  }));

export const addEventsToDeviceCalendar = async (
  calendarId: string,
  events: ShiftCalendarEvent[]
): Promise<void> => {
  for (const event of events) {
    await createEventAsync(calendarId, event);
  }
};
