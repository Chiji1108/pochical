"""column2.py <video> <x px> <from s> <to s>: per frame, the extent of the
composer's host (green or blue run), green rows showing (host not covered by
its SwiftUI content), and the bottom of the red stripe just over the
composer, in points."""
import json, subprocess, sys

video, x, start, end = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-show_entries", "frame=pts_time", "-of", "json", video], capture_output=True, text=True).stdout)
w, h = probe["streams"][0]["width"], probe["streams"][0]["height"]
times = [float(f["pts_time"]) for f in probe["frames"]]
raw = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", video, "-vf", f"crop=2:{h}:{x}:0", "-fps_mode", "passthrough",
     "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
size = h * 6


def kind(r, g, b):
    if r > 200 and g < 90 and b < 90: return "r"
    if g > 200 and r < 90 and b < 90: return "g"
    if b > 170 and g < 90 and r < 90: return "b"
    return "."


for i, t in enumerate(times[:len(raw) // size]):
    if t < start or t > end: continue
    px = raw[i * size:(i + 1) * size]
    k = "".join(kind(px[y * 6], px[y * 6 + 1], px[y * 6 + 2]) for y in range(h))
    top = 116 * 3
    c0 = next((y for y in range(top, h - 30) if all(ch in "gb" for ch in k[y:y + 30])), None)
    if c0 is None: continue
    c1 = c0
    while c1 + 1 < h and k[c1 + 1] in "gb": c1 += 1
    run = k[c0:c1 + 1]
    green = run.count("g")
    red = next((y for y in range(c0 - 1, top, -1) if k[y] == "r"), None)
    where = "top" if run.startswith("g") else ("bottom" if run.endswith("g") else "-")
    print(f"t={t:6.3f} composer={c0/3:6.1f}..{c1/3:6.1f} h={(c1-c0+1)/3:5.1f} greenRows={green/3:4.1f} "
          f"greenAt={where} redBottom={red/3 if red else -1:6.1f} gap={(c0-red)/3 if red else -1:5.1f}")
