"""analyze.py <dbg> <steps>: for each step (until the next), the cells
given back to the reuse pool, configured, and configured again within 0.1 s
of leaving the screen (a line that never left it, re-dequeued); and the
composer's top against the lowest line's foot as drawn each frame: how far
the composer moved, the gap between them at the least and most, and the
largest change of the gap from one frame to the next (a line standing
apart from the composer, or jumping)."""
import datetime, re, sys

events = []
for row in open(sys.argv[1], errors='replace'):
    m = re.match(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+).*POC117DBG (\w+) ?(.*)', row)
    if m:
        t = datetime.datetime.strptime(m.group(1), '%Y-%m-%d %H:%M:%S.%f').timestamp()
        events.append((t, m.group(2), m.group(3).strip()))
steps = []
for row in open(sys.argv[2]):
    label, t = row.rstrip('\n').rsplit(' ', 1)
    steps.append((float(t), label))
steps.append((float('inf'), 'end'))
total = 0
for (start, label), (end, _) in zip(steps, steps[1:]):
    inside = [e for e in events if start <= e[0] < end]
    reuse = sum(1 for e in inside if e[1] == 'prepareForReuse')
    configured = sum(1 for e in inside if e[1] == 'configure')
    ended, again = {}, 0
    for t, kind, item in inside:
        if kind == 'ended':
            ended[item] = t
        elif kind == 'configure' and item in ended and t - ended[item] < 0.1:
            again += 1
    total += again
    frames = []
    for t, kind, rest in inside:
        if kind == 'frame':
            v = dict(p.split('=') for p in rest.split())
            frames.append((float(v['composerTop']), float(v['lastBottom']), float(v['gap'])))
    if frames:
        tops = [f[0] for f in frames]
        gaps = [f[2] for f in frames if f[1] > 0]
        jumps = [abs(b - a) for a, b in zip(gaps, gaps[1:])]
        motion = (f'composer {min(tops):6.1f}..{max(tops):6.1f}  gap {min(gaps, default=0):6.1f}..'
                  f'{max(gaps, default=0):6.1f}  biggest gap step {max(jumps, default=0):5.1f}  frames {len(frames)}')
    else:
        motion = 'no motion'
    print(f'{label[:44]:44s} reuse={reuse:3d} configured={configured:3d} redequeued={again:2d}  {motion}')
print(f'visible lines re-dequeued in all: {total}')
