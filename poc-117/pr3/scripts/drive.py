"""drive.py <name> <step>...: records the sim's screen to rec/<name>.mp4 while
running each step, stamping its start in steps/<name>.log.

Steps: lp:x,y[,ms] (long press), tap:x,y, drag:x1,y1,x2,y2[,ms],
hold:x,y,x2,y2 (press, hold past the long press, slide to x2,y2, lift),
w:s (wait), o:args (bun other.ts args, comma separated), shot:name."""
import os, subprocess, sys, time

P = os.path.dirname(os.path.abspath(__file__))
SIM = open(f"{P}/sim").read().strip()
WT = "/Users/chiji/js/pochical/.claude/worktrees/agent-ad0b901a812dfd4e8"
name, steps = sys.argv[1], sys.argv[2:]
os.makedirs(f"{P}/steps", exist_ok=True)
log = open(f"{P}/steps/{name}.log", "w")


def stamp(label):
    log.write(f"{label} {time.time()}\n")
    log.flush()


def ad(*args):
    return subprocess.run(["agent-device", *map(str, args)], capture_output=True, text=True,
                          cwd=WT).stdout


subprocess.run(["bash", f"{P}/rec.sh", "start", name], check=True)
stamp("start")
time.sleep(0.5)
try:
    for step in steps:
        kind, _, rest = step.partition(":")
        args = rest.split(",") if rest else []
        stamp(step)
        if kind == "lp":
            ad("longpress", args[0], args[1], args[2] if len(args) > 2 else 600)
        elif kind == "tap":
            ad("press", args[0], args[1])
        elif kind == "drag":
            ad("gesture", "pan", args[0], args[1], int(args[2]) - int(args[0]), int(args[3]) - int(args[1]), args[4] if len(args) > 4 else 300)
        elif kind == "hold":
            ad("gesture", "drag", "--from", f"{args[0]},{args[1]}", "--to", f"{args[2]},{args[3]}",
               "--hold", "700")
        elif kind == "bg":
            subprocess.run(["xcrun", "simctl", "launch", SIM, "com.apple.Preferences"],
                           capture_output=True)
        elif kind == "fg":
            ad("open", "app.pochical", "--platform", "ios", "--udid", SIM)
        elif kind == "w":
            time.sleep(float(args[0]))
        elif kind == "o":
            subprocess.run(["bun", f"{P}/other.ts", *args], capture_output=True, text=True, check=True)
        elif kind == "shot":
            ad("screenshot", f"{P}/rec/{name}-{args[0]}.png")
        else:
            raise SystemExit(f"no step {step}")
finally:
    stamp("end")
    subprocess.run(["bash", f"{P}/rec.sh", "stop"], check=True)
print("done", name)
