"""column4.py <video> <from s> <to s>: per frame, in points, the UIKit
host's top and bottom (yellow marks pinned to it), the drawn composer's top
and bottom (its blue, at x=200pt), and the bottom of the red stripe of the
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


yellow = lambda r, g, b: r > 200 and g > 200 and b < 90
blue = lambda r, g, b: b > 170 and r < 90 and g < 90
red = lambda r, g, b: r > 200 and g < 90 and b < 90
cols = {"host": column(10 * 3), "hostBottom": column(50 * 3), "mid": column(200 * 3)}
n = min(c[1] for c in cols.values())
prev = None
fmt = lambda v: f"{v:6.1f}" if v is not None else "  none"
dif = lambda a, b: f"{a - b:6.1f}" if a is not None and b is not None else "  none"
top = 116 * 3
for i, t in enumerate(times[:n]):
    if t < start or t > end:
        continue
    px = {k: v[0][i * h * 6:(i + 1) * h * 6] for k, v in cols.items()}
    at = lambda name, y: (px[name][y * 6], px[name][y * 6 + 1], px[name][y * 6 + 2])
    ys = [y for y in range(top, h) if yellow(*at("host", y))]
    ht = ys[0] / 3 if ys else None
    ys = [y for y in range(top, h) if yellow(*at("hostBottom", y))]
    hb = (ys[-1] + 1) / 3 if ys else None
    b0 = next((y for y in range(top, h - 20) if all(blue(*at("mid", z)) for z in range(y, y + 20))), None)
    if b0 is None or ht is None:
        continue
    b1 = b0
    while b1 + 1 < h and blue(*at("mid", b1 + 1)):
        b1 += 1
    reds = [y for y in range(top, b0) if red(*at("mid", y))]
    rb = (reds[-1] + 1) / 3 if reds else None
    row = (ht, hb, b0, b1, rb)
    if row == prev:
        continue
    prev = row
    bt, bb = b0 / 3, (b1 + 1) / 3
    print(f"t={t:6.3f} host={fmt(ht)}..{fmt(hb)} drawn={fmt(bt)}..{fmt(bb)} topDiff={dif(bt, ht)} "
          f"bottomDiff={dif(bb, hb)} linesBottom={fmt(rb)} linesToDrawn={dif(bt, rb)} linesToHost={dif(ht, rb)}")
