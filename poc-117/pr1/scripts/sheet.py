"""sheet.py <out.png> <width> <png>...: the screenshots side by side."""
import subprocess, sys

out, width, shots = sys.argv[1], sys.argv[2], sys.argv[3:]
inputs, chain = [], ''
for i, shot in enumerate(shots):
    inputs += ['-i', shot]
    chain += f'[{i}]scale={width}:-1,pad=iw+4:ih:0:0:white[v{i}];'
chain += ''.join(f'[v{i}]' for i in range(len(shots))) + f'hstack=inputs={len(shots)}'
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', chain, out], check=True)
print(out, len(shots))
