// Where the device slice of /design's settings is saved, which /try's head
// also reads to color the status bar before the page draws. It lives apart
// from design-settings-store.ts so that head, which every page's script
// carries, does not bring the store and the screens it imports along.
export const deviceSettingsKey = "pochical-design-device";
