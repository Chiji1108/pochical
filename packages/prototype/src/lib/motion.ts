import { springs } from "@pochical/design/metrics";

// A spring from design/ as Motion takes it: visualDuration is the time
// the eye reads it to take, as SwiftUI's .spring(duration:bounce:).
export function spring(name: keyof typeof springs) {
  const { bounce, duration } = springs[name];
  return { bounce, type: "spring", visualDuration: duration } as const;
}
