"""column3.py <video> <from s> <to s>: per frame, in points, the UIKit host's
top and bottom (yellow marks pinned to it), the SwiftUI content's top and
bottom (cyan marks drawn by it), and the bottom of the red stripe of the
lowest line over the composer."""
import json, subprocess, sys

video, start, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-show_entries", "frame=pts_time", "-of", "json", video], capture_output=True, text=True).stdout)
w, h = probe["streams"][0]["width"], probe["streams"][0]["height"]
times = [float(f["pts_time"]) for f in probe["frames"]]


def column(x):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", f"crop=2:{h}:{x}:0", "-fps_mode", "passthrough",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return raw, len(raw) // (h * 6)


def find(px, test, last=False):
    ys = [y for y in range(116 * 3, h) if test(px[y * 6], px[y * 6 + 1], px[y * 6 + 2])]
    if not ys:
        return None
    return (ys[-1] + 1 if last else ys[0]) / 3


yellow = lambda r, g, b: r > 200 and g > 200 and b < 90
cyan = lambda r, g, b: r < 90 and g > 200 and b > 200
red = lambda r, g, b: r > 200 and g < 90 and b < 90
cols = {name: column(x * 3 + 15) for name, x in
        [("hostTop", 0), ("swiftTop", 20), ("hostBottom", 40), ("swiftBottom", 60), ("lines", 375)]}
n = min(c[1] for c in cols.values())
prev = None
fmt = lambda v: f"{v:6.1f}" if v is not None else "  none"
dif = lambda a, b: f"{a - b:6.1f}" if a is not None and b is not None else "  none"
for i, t in enumerate(times[:n]):
    if t < start or t > end:
        continue
    get = lambda name: cols[name][0][i * h * 6:(i + 1) * h * 6]
    ht, st = find(get("hostTop"), yellow), find(get("swiftTop"), cyan)
    hb, sb = find(get("hostBottom"), yellow, True), find(get("swiftBottom"), cyan, True)
    if ht is None:
        continue
    lines = get("lines")
    reds = [y for y in range(116 * 3, int(ht * 3)) if red(lines[y * 6], lines[y * 6 + 1], lines[y * 6 + 2])]
    rb = (reds[-1] + 1) / 3 if reds else None
    row = (ht, st, hb, sb, rb)
    if row == prev:
        continue
    prev = row
    print(f"t={t:6.3f} host={fmt(ht)}..{fmt(hb)} swiftui={fmt(st)}..{fmt(sb)} topDiff={dif(st, ht)} "
          f"bottomDiff={dif(sb, hb)} linesBottom={fmt(rb)} linesToHost={dif(ht, rb)}")
