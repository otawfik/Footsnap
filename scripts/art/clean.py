"""Clean the cut-outs: harden ghosting, keep only the main person, trim the old background's fringe, score sharpness."""
import json, os, sys
import numpy as np, cv2
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
index = json.load(open(os.path.join(SRC, "index.json")))
out = {}
for key, meta in index.items():
    im = np.array(Image.open(os.path.join(SRC, f"{key}.webp")).convert("RGBA")).astype(np.float32)
    H, W = im.shape[:2]
    a = im[:, :, 3] / 255.0
    # 1. ghosting: semi-transparent smears become clearly in or clearly out
    t = np.clip((a - 0.3) / 0.4, 0, 1)
    a = t * t * (3 - 2 * t)
    # 2. one person: the connected piece that holds the head (top-centre), nothing else
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8), 8)
    if n <= 1:
        continue
    zone = lab[: int(H * 0.45), int(W * 0.25): int(W * 0.75)]
    counts = np.bincount(zone.ravel(), minlength=n); counts[0] = 0
    main = int(counts.argmax()) if counts.max() > 0 else int(stats[1:, cv2.CC_STAT_AREA].argmax() + 1)
    keep = cv2.dilate((lab == main).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    a = a * keep
    # 3. fringe: pull the edge in by a pixel and re-smooth it
    a = cv2.erode(a, np.ones((3, 3), np.uint8))
    a = cv2.GaussianBlur(a, (3, 3), 0.8)
    coverage = float((a > 0.5).mean())
    rows = np.where((a > 0.5).any(axis=1))[0]
    if coverage < 0.1 or not len(rows):
        continue
    # 4. sharpness of the face area (high-frequency energy where the person is)
    g = cv2.cvtColor(im[:, :, :3].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    top = rows[0]
    fy0, fy1 = top, min(H, top + int(H * 0.3))
    m = a[fy0:fy1, int(W * 0.2): int(W * 0.8)] > 0.9
    lap = cv2.Laplacian(g, cv2.CV_32F, ksize=3)[fy0:fy1, int(W * 0.2): int(W * 0.8)]
    sharp = float(lap[m].var()) if m.sum() > 500 else 0.0
    im[:, :, 3] = a * 255
    Image.fromarray(im.clip(0, 255).astype(np.uint8), "RGBA").save(os.path.join(DST, f"{key}.webp"), "WEBP", quality=80, method=6)
    out[key] = {**meta, "headTop": round(float(top / H), 3), "sharp": round(sharp, 1), "coverage": round(coverage, 3)}
json.dump(out, open(os.path.join(DST, "index.json"), "w"))
s = sorted(v["sharp"] for v in out.values())
print("kept", len(out), "of", len(index), "| sharpness p10/p25/p50/p75:", [round(s[int(len(s) * q)]) for q in (0.1, 0.25, 0.5, 0.75)])
