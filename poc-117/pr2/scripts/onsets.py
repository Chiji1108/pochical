"""onsets.py <scenario-tag> <app log>: the times in the recording where the
screen starts changing after a still moment, beside the times of the
updates (APPLY) since the scenario's start, to line the two clocks up."""
import json, os, re, subprocess, sys

P = os.path.dirname(os.path.abspath(__file__))
name, log = sys.argv[1], sys.argv[2]
# Only the band of the screen given (points), so a caret blinking elsewhere is not a change.
band = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (0, 874)
video = f"{P}/rec/{name}.mp4"
W, H = 67, 146
probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "frame=pts_time", "-of", "json", video], capture_output=True, text=True).stdout)
times = [float(f["pts_time"]) for f in probe["frames"]]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={W}:{H}", "-fps_mode", "passthrough",
                      "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
n = len(raw) // (W * H)
onsets, prev, still_since = [], None, 0
for i in range(n):
    f = raw[i * W * H:(i + 1) * W * H]
    if prev is not None:
        r0, r1 = int(band[0] / 874 * H), int(band[1] / 874 * H)
        d = sum(abs(a - b) for a, b in zip(f[r0 * W:r1 * W], prev[r0 * W:r1 * W])) / ((r1 - r0) * W)
        if d > 0.02:
            if times[i] - still_since > 0.4:
                onsets.append(times[i])
            still_since = times[i]
    prev = f
steps = [r.rstrip("\n").rsplit(" ", 1) for r in open(f"{P}/steps/{name}.log")]
start = float(steps[0][1])
applies = [float(m.group(1)) - start for m in (re.match(r"(\d+\.\d+) POC117DBG APPLY", r) for r in open(f"{P}/{log}", errors="replace")) if m and start <= float(m.group(1)) <= float(steps[-1][1])]
print("onsets ", " ".join(f"{t:.2f}" for t in onsets))
print("applies", " ".join(f"{t:.2f}" for t in applies))
print("steps  ", " ".join(f"{float(t) - start:.2f}" for _, t in steps))
