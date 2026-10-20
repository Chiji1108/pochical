"""motion.py <video> [from s] [to s]: per frame, how much each band of the
screen moved since the frame before (mean absolute change of a small gray
picture), so a jump in one frame shows as one spike, and an animation as a
run of frames. Bands: lines (the chat above the composer region), composer
region, keyboard region, by rows of the 402x874pt screen."""
import json, subprocess, sys

video = sys.argv[1]
start = float(sys.argv[2]) if len(sys.argv) > 2 else 0
end = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
W, H = 101, 219
probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "json", video],
    capture_output=True, text=True).stdout)
times = [float(f["pts_time"]) for f in probe["frames"]]
raw = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={W}:{H}", "-fps_mode", "passthrough",
     "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
n = len(raw) // (W * H)
bands = {"top": (30, 110), "mid": (110, 170), "low": (170, 219)}
prev = None
for i in range(n):
    t = times[i]
    frame = raw[i * W * H:(i + 1) * W * H]
    if prev is not None and start <= t <= end:
        out = []
        for name, (a, b) in bands.items():
            total = 0
            for y in range(a, b):
                row = y * W
                total += sum(abs(frame[row + x] - prev[row + x]) for x in range(W))
            out.append(f"{name}={total / ((b - a) * W):.2f}")
        print(f"t={t:.3f} " + " ".join(out))
    prev = frame
