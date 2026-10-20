"""tiles.py <video> <out.png> <from> <to> [fps] [width]: the video's frames
from `from` to `to` seconds, in one row."""
import subprocess, sys

video, out, start, end = sys.argv[1:5]
fps = sys.argv[5] if len(sys.argv) > 5 else '10'
width = sys.argv[6] if len(sys.argv) > 6 else '130'
dur = float(end) - float(start)
count = max(1, int(round(dur * float(fps))))
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', start, '-t', f'{dur:.3f}', '-i', video,
                '-vf', f'fps={fps},scale={width}:-1,pad=iw+4:ih:0:0:white,tile={count}x1',
                '-frames:v', '1', out], check=True)
print(out, count)
