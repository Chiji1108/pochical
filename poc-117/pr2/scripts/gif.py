"""gif.py <scenario-tag> <app log> <step label> <seconds> <y0 pt> <y1 pt> <out.gif>:
the recording from just before the step's first update for <seconds>,
cropped to y0..y1 points, slowed to half speed, as a GIF at 30 frames a
second. simctl writes a frame only as the screen changes, so the recording's
clock is lined up with the log's by the shift that matches the most
changes to updates."""
import os, re, subprocess, sys

P = os.path.dirname(os.path.abspath(__file__))
name, log, label, secs, y0, y1, out = sys.argv[1:8]
steps = [r.rstrip("\n").rsplit(" ", 1) for r in open(f"{P}/steps/{name}.log")]
label, _, nth = label.partition("#")
nth = int(nth or 1)
at = next(float(t) for l, t in steps if l == label)
nxt = next((float(t) for l, t in steps if float(t) > at), at + 5)
lines = subprocess.run(["python3", "-I", f"{P}/onsets.py", name, log, y0, y1], capture_output=True, text=True).stdout.splitlines()
onsets = [float(v) for v in lines[0].split()[1:]]
applies = [float(v) for v in lines[1].split()[1:]]
# The log written over since: each update taken as coming its usual 0.65 s after its step.
estimated = not applies
if estimated:
    applies = [float(t) - float(steps[0][1]) + 0.65 for l, t in steps[1:-1]]
start = float(steps[0][1])
diffs = [o - a for o in onsets for a in applies if o - a > 0]
offset = float(sys.argv[8]) if len(sys.argv) > 8 else max(diffs, key=lambda d: sum(1 for o in onsets for a in applies if abs(o - a - d) < 0.1))
first = at + 0.65 if estimated else [float(m.group(1)) for m in (re.match(r"(\d+\.\d+) POC117DBG APPLY", r) for r in open(f"{P}/{log}", errors="replace")) if m and at <= float(m.group(1)) < nxt][nth - 1]
t0 = max(0, first - start + offset - 0.5)
y0, y1 = int(float(y0) * 3), int(float(y1) * 3)
vf = (f"fps=60,trim=start={t0:.3f}:duration={secs},setpts=2*(PTS-STARTPTS),fps=30,crop=1206:{y1 - y0}:0:{y0},scale=300:-2:flags=lanczos,"
      "split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{P}/rec/{name}.mp4",
                "-vf", vf, "-loop", "0", out], check=True)
print(out, os.path.getsize(out), f"t0={t0:.2f} offset={offset:.2f}")
