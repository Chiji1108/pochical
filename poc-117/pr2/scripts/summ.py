"""summ.py <app log> <scenario-tag>...: runs frames.py on each and prints, per
step, the frames the line moved over, its height and top from first to last,
and the spread of its bottom and its gaps to the lines around it."""
import os, re, subprocess, sys

P = os.path.dirname(os.path.abspath(__file__))


def summarize(text):
    step, rows = None, []

    def flush():
        if not step:
            return
        head = step
        if not rows:
            print(f"  {head}: (line not moving on screen)")
            return
        sp = lambda v: f"{min(v):.1f}..{max(v):.1f}" if v else "none"
        hs = [r["h"] for r in rows]
        print(
            f"  {head}: frames={len(rows)} over {rows[-1]['t'] - rows[0]['t']:.3f}s "
            f"h {hs[0]:.1f}->{hs[-1]:.1f} top {rows[0]['y']:.1f}->{rows[-1]['y']:.1f} "
            f"bottom {sp([r['b'] for r in rows])} gapAbove {sp([r['ga'] for r in rows if r['ga'] is not None])} "
            f"gapBelow {sp([r['gb'] for r in rows if r['gb'] is not None])}"
        )

    for line in text.splitlines():
        if line.startswith("=="):
            flush()
            step, rows = line.strip("= "), []
            continue
        m = re.match(
            r"\s+([\d.]+) off=\s*(-?[\d.]+) line y=\s*(-?[\d.]+) h=\s*([\d.]+) bottom=\s*(-?[\d.]+) a=[\d.]+ gapAbove=\s*(\S+) gapBelow=\s*(\S+)",
            line,
        )
        if m:
            f = lambda s: None if s == "none" else float(s)
            rows.append(dict(t=float(m[1]), y=float(m[3]), h=float(m[4]), b=float(m[5]), ga=f(m[6]), gb=f(m[7])))
        elif "APPLY" in line:
            step += " [" + re.search(r"animated=\w+", line).group(0) + "]"
    flush()


log = sys.argv[1]
for name in sys.argv[2:]:
    print(name)
    out = subprocess.run(
        ["python3", "-I", f"{P}/frames.py", f"{P}/{log}", f"{P}/steps/{name}.log", "auto"],
        capture_output=True, text=True,
    ).stdout
    summarize(out)
