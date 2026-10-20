"""pagecheck.py <app log> <steps log>: for each update putting a page in above
(earlier=true), the lines on screen in the frame before it and the first
frame after it, and how far each one seen in both moved on the screen, with
the cells re-dequeued while their item stayed on screen meanwhile."""
import re, sys

events = []
for row in open(sys.argv[1], errors="replace"):
    m = re.match(r"(\d+\.\d+) POC117DBG (\S+) ?(.*)", row)
    if m:
        events.append((float(m.group(1)), m.group(2), m.group(3)))
steps = [float(r.rsplit(" ", 1)[1]) for r in open(sys.argv[2])]
start, end = steps[0], steps[-1]
inside = [e for e in events if start <= e[0] <= end]


def cells(text):
    return {m.group(1): float(m.group(2)) for m in re.finditer(r"(\w+)@(-?[\d.]+),", text)}


for i, (t, kind, rest) in enumerate(inside):
    if kind != "APPLY" or "earlier=true" not in rest:
        continue
    before = next((cells(r) for tt, k, r in reversed(inside[:i]) if k == "F"), {})
    after = next((cells(r) for tt, k, r in inside[i + 1:] if k == "F"), {})
    shared = sorted(set(before) & set(after), key=lambda k: before[k])
    moves = [after[k] - before[k] for k in shared]
    added = re.search(r"added=(-?\d+)", rest).group(1)
    frames = [cells(r) for tt, k, r in inside[max(0, i - 40):i + 40] if k == "F"]
    idx = sum(1 for tt, k, r in inside[max(0, i - 40):i] if k == "F")
    steps_ = []
    for a, b in zip(frames[idx - 3:idx + 3], frames[idx - 2:idx + 4]):
        common = set(a) & set(b)
        steps_.append(f"{(lambda k: b[k] - a[k])(min(common, key=lambda k: a[k])):+.1f}" if common else "?")
    print(f"   per-frame moves of a line seen, 3 frames before to 3 after: {' '.join(steps_[:2])} | {steps_[2] if len(steps_) > 2 else ''} | {' '.join(steps_[3:])}")
    print(f"{t - start:7.3f} page in above (added {added}): {len(shared)} lines seen before and after, moved {min(moves):+.1f}..{max(moves):+.1f} pt")
ended, again = {}, 0
for t, kind, rest in inside:
    if kind == "ended":
        ended[rest] = t
    elif kind == "configure" and rest in ended and t - ended[rest] < 0.1:
        again += 1
print(f"visibleRedequeued over the run: {again}")
