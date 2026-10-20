"""attribute.py <dbg.log> <steps.log>: for each step (a label and the
wall-clock time it began, until the next step), how many cells went back to
the reuse pool, how many were configured, and how many items were
configured again within 0.1 s of their cell leaving the screen: an item
that never left the screen, its cell taken away and given back, as
ChatLayout's restoreContentOffset does to every visible cell."""
import datetime, re, sys

events = []
for row in open(sys.argv[1], errors="replace"):
    m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+).*POC117DBG (\w+) ?(.*)", row)
    if not m:
        continue
    t = datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S.%f").timestamp()
    events.append((t, m.group(2), m.group(3).strip()))
steps = []
for row in open(sys.argv[2]):
    label, t = row.rstrip("\n").rsplit(" ", 1)
    steps.append((float(t), label))
steps.append((float("inf"), "end"))
for (start, label), (end, _) in zip(steps, steps[1:]):
    inside = [e for e in events if start <= e[0] < end]
    reuse = sum(1 for e in inside if e[1] == "prepareForReuse")
    configured = sum(1 for e in inside if e[1] == "configure")
    ended = {}
    again = 0
    for t, kind, item in inside:
        if kind == "ended":
            ended[item] = t
        elif kind == "configure" and item in ended and t - ended[item] < 0.1:
            again += 1
    print(f"{label:48s} reuse={reuse:3d} configured={configured:3d} visibleRedequeued={again:3d}")
