"""uv run --with pillow crop.py <mp4> <from s> <to s> <y0,y1 points> <out.png> [cols] [scale]:
every frame between the times, cut to the band from y0 to y1 (the screen's
points) across the whole width, side by side in rows of `cols`, stamped
with its index and time."""
import sys
from PIL import Image, ImageDraw, ImageFont
from strip import frames

src, start, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
y0, y1 = map(float, sys.argv[4].split(","))
out = sys.argv[5]
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 8
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 0.5
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
cells = []
for i, t, path in frames(src):
    if not start <= t <= end:
        continue
    im = Image.open(path).convert("RGB")
    k = im.width / 402
    im = im.crop((0, int(y0 * k), im.width, int(y1 * k)))
    im = im.resize((int(402 * scale * 2), int((y1 - y0) * scale * 2)))
    ImageDraw.Draw(im).text((6, 4), f"#{i} {t:.3f}", fill=(220, 0, 0), font=font,
                            stroke_width=2, stroke_fill=(255, 255, 255))
    cells.append(im)
w, h = cells[0].size
rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 3), rows * (h + 3)), "white")
for n, im in enumerate(cells):
    sheet.paste(im, ((n % cols) * (w + 3), (n // cols) * (h + 3)))
sheet.save(out)
print(out, len(cells), "frames")
