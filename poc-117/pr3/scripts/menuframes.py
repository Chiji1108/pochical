"""menuframes.py <app log> <steps log> [--all]: for each step, the cells
re-dequeued while their item stayed on the screen (configured again within
0.1 s of its cell ending) and the cells reused, then per display frame
while the menu layer is there: the keyboard guide's top, the layer's bubble
middle (y, x), its lift scale and alpha, the scrim, where its line's bubble
middle is drawn in its cell, and the two apart (dy, dx). The bubble rides
with its line while dy and dx stay constant; at rest in place they are 0."""
import re, sys

log, steps_path = sys.argv[1], sys.argv[2]
every = "--all" in sys.argv
events = []
for row in open(log, errors="replace"):
    m = re.match(r"(\d+\.\d+) POC117DBG (\S+) ?(.*)", row)
    if m:
        events.append((float(m.group(1)), m.group(2), m.group(3).strip()))
steps = []
for row in open(steps_path):
    label, t = row.rstrip("\n").rsplit(" ", 1)
    steps.append((float(t), label))
steps.append((float("inf"), "after"))

for (start, label), (end, _) in zip(steps, steps[1:]):
    inside = [e for e in events if start <= e[0] < end]
    ended, again = {}, 0
    for t, kind, rest in inside:
        if kind == "ended":
            ended[rest] = t
        elif kind == "configure" and rest in ended and t - ended[rest] < 0.1:
            again += 1
    reuse = sum(1 for e in inside if e[1] == "prepareForReuse")
    print(f"== {label}: visibleRedequeued={again} prepareForReuse={reuse}")
    last = None
    for t, kind, rest in inside:
        if kind != "F":
            continue
        kb = re.search(r"kb=(-?[\d.]+)", rest).group(1)
        m = re.search(r"lift=(-?[\d.]+),(-?[\d.]+),s([\d.]+),a([\d.]+) scrim=(-?[\d.]+)(?: line=(-?[\d.]+),(-?[\d.]+)|( line=none))?", rest)
        if not m:
            if last is not None:
                print(f"   {t - start:6.3f} kb={kb} (no layer)")
                last = None
            continue
        ly, lx, s, a, scrim, y, x = m.group(1, 2, 3, 4, 5, 6, 7)
        dy = f"{float(ly) - float(y):6.1f}" if y else "  none"
        dx = f"{float(lx) - float(x):6.1f}" if x else "  none"
        row = f"kb={kb} lift={ly},{lx} s={s} a={a} scrim={scrim} line={y},{x} dy={dy} dx={dx}"
        if every or row != last:
            print(f"   {t - start:6.3f} {row}")
        last = row
