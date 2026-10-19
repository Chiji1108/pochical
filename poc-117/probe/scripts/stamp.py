"""stamp.py <steps.log> <label>: notes that a step begins now."""
import sys, time

with open(sys.argv[1], "a") as f:
    f.write(f"{' '.join(sys.argv[2:])} {time.time()}\n")
