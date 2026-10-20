"""frames.py <app log> <steps log> <id suffix> [--all]: for each step, the
updates applied (APPLY), the cells re-dequeued while their item stayed on
screen (configured again within 0.1 s of its cell ending), and per frame
the line <id suffix>'s top and height on the lines' screen with the lines
above and below it, the gap to each (constant while they move together),
and the scroll. --all prints every frame, else only frames that changed."""
import re, sys

log, steps_path, target = sys.argv[1], sys.argv[2], sys.argv[3]
events = []
for row in open(log, errors="replace"):
    m = re.match(r"(\d+\.\d+) POC117DBG (\S+) ?(.*)", row)
    if m:
        events.append((float(m.group(1)), m.group(2), m.group(3).strip()))
steps = []
for row in open(steps_path):
    label, t = row.rstrip("\n").rsplit(" ", 1)
    steps.append((float(t), label))
steps.append((float("inf"), "end"))


def cells(text):
    off = float(re.match(r"off=(-?[\d.]+)", text).group(1))
    out = []
    for m in re.finditer(r"(\w+)@(-?[\d.]+),([\d.]+),a([\d.]+)", text):
        out.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))))
    out.sort(key=lambda c: c[1])
    return off, out


for (start, label), (end, _) in zip(steps, steps[1:]):
    inside = [e for e in events if start <= e[0] < end]
    if label in ("start", "end"):
        continue
    ended, again = {}, 0
    for t, kind, rest in inside:
        if kind == "ended":
            ended[rest] = t
        elif kind == "configure" and rest in ended and t - ended[rest] < 0.1:
            again += 1
    reuse = sum(1 for e in inside if e[1] == "prepareForReuse")
    print(f"== {label}: visibleRedequeued={again} prepareForReuse={reuse}")
    for t, kind, rest in inside:
        if kind == "APPLY":
            print(f"   {t - start:6.3f} APPLY {rest}")
    want = target
    if target == "auto":
        m = next((re.search(r'redrawn=\["(\w+)"', r) for _, k, r in inside if k == "APPLY" and 'redrawn=["' in r), None)
        want = m.group(1) if m else "-"
    first = None
    for t, kind, rest in inside:
        if kind != "F":
            continue
        off, cs = cells(rest)
        idx = next((i for i, c in enumerate(cs) if c[0].endswith(want)), None)
        if idx is None:
            continue
        me = cs[idx]
        above = cs[idx - 1] if idx > 0 else None
        below = cs[idx + 1] if idx + 1 < len(cs) else None
        gap_above = me[1] - (above[1] + above[2]) if above else None
        gap_below = below[1] - (me[1] + me[2]) if below else None
        first = first or t
        fmt = lambda v: f"{v:6.1f}" if v is not None else "  none"
        print(
            f"   {t - start:6.3f} off={off:7.1f} line y={me[1]:6.1f} h={me[2]:5.1f} bottom={me[1] + me[2]:6.1f} "
            f"a={me[3]:.2f} gapAbove={fmt(gap_above)} gapBelow={fmt(gap_below)} "
            f"aboveY={fmt(above[1] if above else None)} belowY={fmt(below[1] if below else None)}"
        )
