"""tolatest.py [--scroll]: (scrolls up a little first, then) taps ↓ to go to the latest line."""
import re, subprocess, sys, time


def ad(*args):
    return subprocess.run(["agent-device", *args], capture_output=True, text=True).stdout


if "--scroll" in sys.argv:
    ad("gesture", "pan", "200", "250", "0", "500", "400")
    time.sleep(1.5)
m = re.search(r'(@e\d+) \[button\] "最新のメッセージへ', ad("snapshot", "-i"))
if m:
    ad("press", m.group(1))
    time.sleep(2)
print("tapped" if m else "no ↓")
