"""drive.py <scenario> <tag> [args]: runs one scenario on sim A, recording
the screen to rec/<scenario>-<tag>.mp4 and stamping each step's start in
steps/<scenario>-<tag>.log."""
import os, subprocess, sys, time

P = os.path.dirname(os.path.abspath(__file__))
scenario, tag = sys.argv[1], sys.argv[2]
extra = sys.argv[3:]
os.makedirs(f"{P}/steps", exist_ok=True)
steps = open(f"{P}/steps/{scenario}-{tag}.log", "w")


def step(label):
    steps.write(f"{label} {time.time()}\n")
    steps.flush()


def ad(*args):
    return subprocess.run(["agent-device", *args], capture_output=True, text=True).stdout


def other(*args):
    subprocess.run(["bun", f"{P}/other.ts", *args], capture_output=True, text=True, check=True)


def rec(action, name=""):
    subprocess.run(["bash", f"{P}/rec.sh", action, *([name] if name else [])], check=True)


def wait(s):
    time.sleep(s)


def run():
    if scenario == "react-other":
        seq = extra[0]
        step("other adds ❤️")
        other("react", seq, "❤️", "on")
        wait(2)
        step("other adds 😂")
        other("react", seq, "😂", "on")
        wait(2)
        step("other removes ❤️")
        other("react", seq, "❤️", "off")
        wait(2)
        step("other removes 😂")
        other("react", seq, "😂", "off")
        wait(2)
    elif scenario == "react-self":
        x, y = extra[0], extra[1]
        step("long press")
        ad("longpress", x, y, "600")
        wait(1.2)
        step("self adds 👍")
        ad("press", extra[2], extra[3])
        wait(2.5)
        step("long press again")
        ad("longpress", x, extra[6] if len(extra) > 6 else y, "600")
        wait(1.2)
        step("self removes 👍")
        ad("press", extra[4], extra[5])
        wait(2.5)
    elif scenario == "edit-other":
        seq = extra[0]
        step("other edits longer")
        other("edit", seq, "ありがとう！助かります。土曜の夜は私が入るので、日曜の朝をお願いできますか？店長にも伝えておきます。")
        wait(2.5)
        step("other edits shorter")
        other("edit", seq, "ありがとう！")
        wait(2.5)
    elif scenario == "link":
        step("other sends a link")
        other("link", extra[0] if extra else "これ見て https://www.apple.com/jp/iphone/")
        wait(8)
    elif scenario == "more":
        step("tap 続きを読む")
        ad("press", *(extra[:2] if extra else ["label=続きを読む"]))
        wait(2.5)
    elif scenario == "page":
        step("fling up")
        for _ in range(int(extra[0]) if extra else 4):
            ad("gesture", "fling", "down", "200", "400", "200")
            wait(0.4)
        wait(3)
    elif scenario == "kbd-react":
        seq = extra[0]
        step("keyboard up")
        ad("press", "200", "812")
        wait(1.5)
        step("other adds ❤️")
        other("react", seq, "❤️", "on")
        wait(2)
        step("other removes ❤️")
        other("react", seq, "❤️", "off")
        wait(2)
        step("keyboard down")
        ad("press", "392", "300")
        wait(1.5)
    elif scenario == "album-other":
        seq = extra[0]
        step("other adds ❤️ to a photo")
        other("react", seq, "❤️", "on")
        wait(2.5)
        step("other removes ❤️ from a photo")
        other("react", seq, "❤️", "off")
        wait(2.5)
    else:
        raise SystemExit(f"no scenario {scenario}")


rec("start", f"{scenario}-{tag}")
step("start")
wait(0.5)
try:
    run()
finally:
    step("end")
    rec("stop")
print("done", scenario, tag)
