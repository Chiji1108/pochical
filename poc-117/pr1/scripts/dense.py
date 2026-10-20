"""dense.py <video> <steps> <out.png> <step> <from> <to> [fps]: the frames
from a step's start plus `from` to plus `to` seconds, tiled in one row."""
import subprocess, sys

video, steps_path, out, label, start, end = sys.argv[1:7]
fps = sys.argv[7] if len(sys.argv) > 7 else '15'
steps = {}
for line in open(steps_path):
    name, at = line.rsplit(' ', 1)
    steps[name] = float(at)
t = steps[label] - steps['rec'] + float(start)
dur = float(end) - float(start)
count = int(round(dur * float(fps)))
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.3f}', '-t', f'{dur:.3f}',
                '-i', video, '-vf', f'fps={fps},scale=130:-1,pad=iw+4:ih:0:0:white,tile={count}x1',
                '-frames:v', '1', out], check=True)
print(out, f'{count} frames from {t:.2f}s')
