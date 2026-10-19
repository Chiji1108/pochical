"""column.py <video> <x px> [from s] [to s]: per video frame, along one pixel
column, where the last line's red stripe ends, where the composer's host
(green) starts, and where its SwiftUI content (blue or magenta) starts, in
points (3x)."""
import json, subprocess, sys

video, x = sys.argv[1], int(sys.argv[2])
start = float(sys.argv[3]) if len(sys.argv) > 3 else 0
end = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
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
    if r > 200 and g < 90 and b < 90: return "red"
    if g > 200 and r < 90 and b < 90: return "green"
    if b > 170 and g < 90: return "blue"  # blue, magenta and blends of them
    return "other"


previous = None
print("frames", len(times), "decoded", len(raw) // size)
times = times[:len(raw) // size]
for i, t in enumerate(times):
    if t < start or t > end: continue
    px = raw[i * size:(i + 1) * size]
    kinds = [kind(px[y * 6], px[y * 6 + 1], px[y * 6 + 2]) for y in range(h)]
    top = int(116 * 3)
    composer = next((y for y in range(top, h - 30)
                     if kinds[y] in ("green", "blue") and all(k in ("green", "blue") for k in kinds[y:y + 30])), None)
    if composer is None: continue
    green = next((y for y in range(composer, min(h, composer + 400)) if kinds[y] == "green"), None)
    content = next((y for y in range(composer, min(h, composer + 400)) if kinds[y] == "blue"), None)
    red = next((y for y in range(composer - 1, top, -1) if kinds[y] == "red"), None)
    row = (round(red / 3, 1) if red else None, round(composer / 3, 1),
           round(green / 3, 1) if green is not None and green == composer else None,
           round(content / 3, 1) if content is not None else None)
    if row != previous:
        gap = round((composer - red) / 3, 1) if red else None
        print(f"t={t:7.3f} redBottom={row[0]} composerTop={row[1]} greenShowsFrom={row[2]} swiftuiTop={row[3]} gapLinesToComposer={gap}")
    previous = row
