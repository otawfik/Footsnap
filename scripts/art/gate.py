"""Drop cut-outs that would make a card look bad: too blurry, or a second person in the shot.

usage: gate.py <dir> [--dry]   (reads/writes <dir>/index.json; deletes rejected .webp unless --dry)

Blur is judged together with the face detector's confidence: smooth, well-lit skin scores as low on
sharpness as real blur does, so a photo only counts as blurry when it's soft AND its face is uncertain.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

D = sys.argv[1]
SOFT, UNSURE = 400, 45  # sharpness below SOFT and face confidence below UNSURE: too blurry
dry = "--dry" in sys.argv
index = json.load(open(os.path.join(D, "index.json")))

faces = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
profiles = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")

def flat_gray(rgba):
    a = rgba[:, :, 3:4] / 255.0
    return cv2.cvtColor((rgba[:, :, :3] * a + 128 * (1 - a)).astype(np.uint8), cv2.COLOR_RGB2GRAY)

def portrait(rgba):
    """Face confidence (0 = not a portrait) for a head-and-shoulders shot: a face at least ~1/6 of the width across, top-centre, with nothing above
    it (the head is the top of the cut-out), and shoulders filling most of the width near the bottom."""
    g = flat_gray(rgba)
    H, W = g.shape
    m = rgba[:, :, 3] > 128
    rows = np.where(m.any(axis=1))[0]
    if not len(rows) or m[int(H * 0.75): int(H * 0.95)].mean() < 0.45:
        return 0
    top = rows[0]
    boxes, hits = faces.detectMultiScale2(g, 1.08, 5, minSize=(40, 40))
    found = [(tuple(b), int(n)) for b, n in zip(boxes, hits)]
    # profiles count as a portrait but carry no confidence score of their own
    found += [(tuple(b), 1) for b in profiles.detectMultiScale(g, 1.08, 5, minSize=(40, 40))]
    found += [((W - x - w, y, w, h), 1) for (x, y, w, h) in profiles.detectMultiScale(cv2.flip(g, 1), 1.08, 5, minSize=(40, 40))]
    best = 0
    for (x, y, w, h), n in found:
        cx, cy = x + w / 2, y + h / 2
        if w >= W * 0.17 and W * 0.22 <= cx <= W * 0.78 and cy <= H * 0.45 and y - top <= h * 0.9:
            best = max(best, n)
    return best

def touches_top(a):
    """Something reaches the top edge: a head cut off flat, or someone standing behind."""
    return int((a[:3] > 0.5).any(axis=0).sum()) > a.shape[1] * 0.03

def second_person(rgba):
    """Two faces of similar size in the cut-out."""
    a = rgba[:, :, 3:4] / 255.0
    flat = (rgba[:, :, :3] * a + 128 * (1 - a)).astype(np.uint8)
    g = cv2.cvtColor(flat, cv2.COLOR_RGB2GRAY)
    found = faces.detectMultiScale(g, scaleFactor=1.08, minNeighbors=5, minSize=(30, 30))
    if len(found) < 2:
        return False
    sizes = sorted((w * h for (_, _, w, h) in found), reverse=True)
    return sizes[1] > sizes[0] * 0.3

keep, blurry, crowd, framing = {}, [], [], []
for key, meta in index.items():
    rgba = np.array(Image.open(os.path.join(D, f"{key}.webp")).convert("RGBA")).astype(np.float32)
    conf = portrait(rgba) if meta.get("face") else 0
    if not conf:
        framing.append(key)
    elif meta.get("sharp", 0) < SOFT and conf < UNSURE:
        blurry.append(key)
    elif touches_top(rgba[:, :, 3] / 255.0) or second_person(rgba):
        crowd.append(key)
    else:
        keep[key] = {k: meta[k] for k in ("headTop", "artist", "license", "page")}
print(f"keep {len(keep)} | not a portrait {len(framing)} | blurry {len(blurry)} | cut off or a second person {len(crowd)}")
json.dump({"framing": framing, "blurry": blurry, "crowd": crowd}, open(os.path.join(D, "rejected.json"), "w"))
if not dry:
    for key in framing + blurry + crowd:
        os.remove(os.path.join(D, f"{key}.webp"))
    json.dump(keep, open(os.path.join(D, "index.json"), "w"))
