"""uv run --with pillow strip.py <mp4> <from s> <to s> <out.png> [cols] [width] [crop y0,y1]:
every frame the recording has between the two times on its own timeline,
side by side in rows of `cols`, each `width` pixels wide and stamped with
its time and its index among the recording's frames."""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

src = sys.argv[1] if __name__ == "__main__" else None
if __name__ == "__main__":
    start, end, out = float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    cols = int(sys.argv[5]) if len(sys.argv) > 5 else 8
    width = int(sys.argv[6]) if len(sys.argv) > 6 else 160
    crop = tuple(map(float, sys.argv[7].split(","))) if len(sys.argv) > 7 else None


def frames(src):
    """(index, time, image) of every frame of `src`, decoded once."""
    times = [
        float(t.strip(",")) for t in subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "frame=pts_time",
             "-of", "csv=p=0", src], capture_output=True, text=True).stdout.split() if t.strip(",")
    ]
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-loglevel", "fatal", "-i", src, "-fps_mode", "passthrough",
                    "-vf", "setpts=N", f"{tmp}/%05d.png"], check=True)
    names = sorted(os.listdir(tmp))
    assert len(names) == len(times), f"{len(names)} images for {len(times)} frames"
    return [(i, t, f"{tmp}/{n}") for i, (t, n) in enumerate(zip(times, names))]


if __name__ == "__main__":
    chosen = [(i, t, p) for i, t, p in frames(src) if start <= t <= end]
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    cells = []
    for i, t, p in chosen:
        im = Image.open(p).convert("RGB")
        if crop:
            h = im.height
            im = im.crop((0, int(crop[0] * h), im.width, int(crop[1] * h)))
        im = im.resize((width, int(im.height * width / im.width)))
        ImageDraw.Draw(im).text((4, 4), f"#{i} {t:.3f}", fill=(255, 0, 0), font=font,
                                stroke_width=2, stroke_fill=(255, 255, 255))
        cells.append(im)
    rows = (len(cells) + cols - 1) // cols
    h = cells[0].height
    sheet = Image.new("RGB", (cols * (width + 2), rows * (h + 2)), "white")
    for n, im in enumerate(cells):
        sheet.paste(im, ((n % cols) * (width + 2), (n // cols) * (h + 2)))
    sheet.save(out)
    print(out, len(cells), "frames")
