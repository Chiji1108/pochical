"""sendown.py [--keep] <text>...: sends each text from sim A's composer; puts the keyboard away unless --keep."""
import re, subprocess, sys, time


def ad(*args):
    return subprocess.run(["agent-device", *args], capture_output=True, text=True).stdout


keep = "--keep" in sys.argv
texts = [a for a in sys.argv[1:] if a != "--keep"]
snap = ad("snapshot", "-i")
if "[focused]" not in snap:
    ad("press", "200", "812")
    time.sleep(1)
    snap = ad("snapshot", "-i")
for text in texts:
    ref = re.search(r"(@e\d+) \[text-view\]", snap).group(1)
    ad("fill", ref, text)
    time.sleep(0.4)
    snap = ad("snapshot", "-i")
    send = re.search(r'(@e\d+) \[button\] "送る"', snap).group(1)
    ad("press", send)
    time.sleep(1)
    snap = ad("snapshot", "-i")
if not keep:
    ad("press", "392", "300")
    time.sleep(1.5)
