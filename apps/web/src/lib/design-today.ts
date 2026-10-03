// The prototype's today, fixed so the sample shifts and dates always line
// up; every screen counts from it rather than from the real clock.
export const designToday = new Date(2026, 8, 24);

// The first of today's month, the month a screen opens on.
export const designMonth = new Date(
  designToday.getFullYear(),
  designToday.getMonth(),
  1
);
