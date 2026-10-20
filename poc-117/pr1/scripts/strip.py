"""strip.py <video> <steps> <out.png> <label>:<offset>,... : one row of frames,
each at a step's start plus an offset in seconds, labelled."""
import subprocess, sys, tempfile, os

video, steps_path, out, spec = sys.argv[1:5]
steps = {}
for line in open(steps_path):
    label, at = line.rsplit(' ', 1)
    steps[label] = float(at)
rec = steps['rec']
duration = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], capture_output=True, text=True).stdout)
tmp = tempfile.mkdtemp()
frames = []
for i, item in enumerate(spec.split(',')):
    label, offset = item.rsplit(':', 1)
    t = steps[label] - rec + float(offset)
    t = min(t, duration - 0.05)
    path = os.path.join(tmp, f'{i:02d}.png')
    text = f"{label} +{offset}s".replace(':', ' ').replace("'", '')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.3f}', '-i', video,
                    '-frames:v', '1', '-vf',
                    f"scale=240:-1,pad=iw+6:ih:0:0:white",
                    path], check=True)
    frames.append(path)
inputs = []
for f in frames:
    inputs += ['-i', f]
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex',
                f"hstack=inputs={len(frames)}", out], check=True)
print(out)
