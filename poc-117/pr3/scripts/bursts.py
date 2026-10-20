"""bursts.py <mp4>: the recording's runs of frames (the screen changing),
each as its first and last time and how many frames: where to cut strips."""
import subprocess, sys

times = [
    float(t.strip(",")) for t in subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "frame=pts_time",
         "-of", "csv=p=0", sys.argv[1]], capture_output=True, text=True).stdout.split() if t.strip(",")
]
runs, start, last, n = [], times[0], times[0], 1
for t in times[1:]:
    if t - last > 0.1:
        runs.append((start, last, n))
        start, n = t, 0
    last, n = t, n + 1
runs.append((start, last, n))
for a, b, n in runs:
    print(f"{a:7.3f}-{b:7.3f} {n} frames")
