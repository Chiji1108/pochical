"""strip.py <video> <out.png> <top pt> <bottom pt> <t1> <t2> ...: the frames at
those times, cut to the rows between top and bottom (points, 3x), side by
side, each labelled with its time."""
import os, subprocess, sys, tempfile

video, out, top, bottom = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
times = sys.argv[5:]
tmp = tempfile.mkdtemp()
parts = []
for i, t in enumerate(times):
    part = os.path.join(tmp, f"{i}.png")
    crop = f"crop=1206:{int((bottom - top) * 3)}:0:{int(top * 3)},scale=260:-1"
    label = f"drawtext=text='{t}s':x=6:y=6:fontsize=18:fontcolor=red:box=1:boxcolor=white"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", t, "-i", video, "-frames:v", "1",
                    "-vf", f"{crop},pad=iw+6:ih:0:0:white", part], check=True)
    parts.append(part)
args = ["ffmpeg", "-v", "error", "-y"]
for p in parts:
    args += ["-i", p]
args += ["-filter_complex", f"hstack=inputs={len(parts)}", out]
subprocess.run(args, check=True)
print(out)
