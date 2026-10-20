"""uv run --with pillow pixel.py <mp4> <from s> <to s> <x,y>...: each frame's
color at the points (in the screen's points) between the two times: a
bubble missing for a frame shows as its ground's color there."""
import sys
from PIL import Image
from strip import frames

src, start, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
points = [tuple(map(float, p.split(","))) for p in sys.argv[4:]]
for i, t, path in frames(src):
    if not start <= t <= end:
        continue
    im = Image.open(path).convert("RGB")
    scale = im.width / 402
    colors = [im.getpixel((int(x * scale), int(y * scale))) for x, y in points]
    print(f"#{i} {t:.3f} " + " ".join("%02x%02x%02x" % c for c in colors))
