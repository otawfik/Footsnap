"""Premium art: each cut-out redrawn as a four-tone poster in the player's club colours.

usage: premium.py <art dir> <colors.json from colors.mts>
writes <art dir>/premium/<id>.webp and marks each player "premium": true in <art dir>/index.json

Brightness is evened out locally (CLAHE) before the tones are mapped, so every face keeps its
features whatever the skin tone or the lighting in the original photo.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

ART, COLORS = sys.argv[1], sys.argv[2]
index = json.load(open(os.path.join(ART, "index.json")))
colors = json.load(open(COLORS))
os.makedirs(os.path.join(ART, "premium"), exist_ok=True)
rgb_of = lambda h: [int(h[i:i + 2], 16) for i in (1, 3, 5)]

def poster(rgb, a, primary):
    m = a > 128
    g = cv2.cvtColor(cv2.bilateralFilter(rgb, 9, 40, 9), cv2.COLOR_RGB2GRAY)
    g = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(6, 6)).apply(g).astype(np.float32)
    lo, hi = np.percentile(g[m], 5), np.percentile(g[m], 95)
    t = cv2.GaussianBlur(np.clip((g - lo) / max(1, hi - lo), 0, 1), (0, 0), 0.9)
    dark = [int(v * 0.28 + 8) for v in primary]
    deep = [int(v * 0.55) for v in dark]
    mid2 = [int(d * 0.5 + p * 0.5) for d, p in zip(dark, primary)]
    light = [243, 238, 222]
    stops = [(0.0, deep), (0.24, deep), (0.3, mid2), (0.48, mid2), (0.54, primary), (0.72, primary), (0.78, light), (1.0, light)]
    out = np.zeros_like(rgb, dtype=np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        sel = (t >= t0) & (t <= t1)
        f = ((t[sel] - t0) / max(1e-6, t1 - t0))[:, None]
        out[sel] = np.array(c0) * (1 - f) + np.array(c1) * f
    # an ink line round the silhouette
    edge = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8)) > 0
    out[edge] = [12, 16, 13]
    return out

done = 0
for key, meta in index.items():
    c = colors.get(key)
    if not c:
        meta.pop("premium", None)
        continue
    im = np.array(Image.open(os.path.join(ART, f"{key}.webp")).convert("RGBA"))
    rgb, a = im[:, :, :3].copy(), im[:, :, 3]
    out = poster(rgb, a, rgb_of(c["primary"]))
    Image.fromarray(np.dstack([np.clip(out, 0, 255).astype(np.uint8), a]), "RGBA").save(os.path.join(ART, "premium", f"{key}.webp"), "WEBP", quality=82, method=4)
    meta["premium"] = True
    done += 1
json.dump(index, open(os.path.join(ART, "index.json"), "w"))
print("premium art for", done, "of", len(index))
