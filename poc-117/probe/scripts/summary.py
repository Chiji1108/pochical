"""summary.py <col file>...: how far the SwiftUI content's top and bottom
stray from the UIKit host's, and the lines from the host, over all frames."""
import re, sys
from collections import Counter

for path in sys.argv[1:]:
    tops, bottoms, lines = [], [], []
    for row in open(path):
        m = dict(re.findall(r"(\w+)=\s*(-?[\d.]+|none)", row))
        if m.get("topDiff", "none") != "none": tops.append(float(m["topDiff"]))
        if m.get("bottomDiff", "none") != "none": bottoms.append(float(m["bottomDiff"]))
        if m.get("linesToDrawn", "none") != "none": lines.append(float(m["linesToDrawn"]))
    print(f"== {path}: {len(tops)} changed frames")
    print("  topDiff min/max", min(tops), max(tops), "most", Counter(tops).most_common(4))
    print("  bottomDiff min/max", min(bottoms), max(bottoms), "most", Counter(bottoms).most_common(4))
    print("  linesToDrawn min/max", min(lines), max(lines), "most", Counter(lines).most_common(4))
