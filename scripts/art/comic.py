"""Base-card art: each cut-out redrawn in a comic-book style that keeps its real colours.

usage: comic.py <art dir>
writes <art dir>/comic/<id>.webp and marks each player "comic": true in <art dir>/index.json

  1. flats: edge-preserving smoothing, so skin and shirts become clean areas of colour
  2. cel shading: lightness stepped into a few tones (hue and skin tone untouched), with local
     contrast first so every face keeps its features
  3. ink: lines from a difference of Gaussians, specks removed, and a bold outline round the figure
  4. halftone dots in the shadows
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

INK = np.array([14, 12, 20], dtype=np.float32)

def comic(rgb, a, levels=6):
    m = a > 128
    x = cv2.edgePreservingFilter(rgb, flags=cv2.RECURS_FILTER, sigma_s=40, sigma_r=0.35)
    x = cv2.bilateralFilter(x, 7, 30, 7)
    lab = cv2.cvtColor(x, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = cv2.createCLAHE(clipLimit=1.3, tileGridSize=(6, 6)).apply(lab[:, :, 0].astype(np.uint8)).astype(np.float32)
    q = np.round(L / 255 * (levels - 1)) / (levels - 1) * 255
    lab[:, :, 0] = L * 0.5 + q * 0.5
    lab[:, :, 1:] = 128 + (lab[:, :, 1:] - 128) * 1.25
    out = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)

    g = cv2.cvtColor(x, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    dog = cv2.GaussianBlur(g, (0, 0), 1.0) - cv2.GaussianBlur(g, (0, 0), 1.6) * 0.985
    ink = (dog < -0.012).astype(np.uint8)
    n, lab_, st, _ = cv2.connectedComponentsWithStats(ink, 8)
    big = st[:, cv2.CC_STAT_AREA] >= 14
    big[0] = False
    ink = cv2.dilate(big[lab_].astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
    scale = max(1, round(rgb.shape[1] / 480))
    sil = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_GRADIENT, np.ones((5 + scale, 5 + scale), np.uint8)) > 0

    H, W = g.shape
    yy, xx = np.mgrid[0:H, 0:W]
    cell = 6
    r = np.hypot((xx % cell) - cell / 2 + 0.5, (yy % cell) - cell / 2 + 0.5)
    dark = 1 - cv2.GaussianBlur(L / 255, (0, 0), 2)
    dots = (r < (dark - 0.45).clip(0, 1) * cell * 0.9) & m
    out[dots] *= 0.72
    out[ink] = out[ink] * 0.12 + INK * 0.88
    out[sil] = INK
    return out

if __name__ == "__main__":
    ART = sys.argv[1]
    index = json.load(open(os.path.join(ART, "index.json")))
    os.makedirs(os.path.join(ART, "comic"), exist_ok=True)
    for key, meta in index.items():
        im = np.array(Image.open(os.path.join(ART, f"{key}.webp")).convert("RGBA"))
        out = comic(im[:, :, :3].copy(), im[:, :, 3])
        Image.fromarray(np.dstack([np.clip(out, 0, 255).astype(np.uint8), im[:, :, 3]]), "RGBA").save(os.path.join(ART, "comic", f"{key}.webp"), "WEBP", quality=84, method=4)
        meta["comic"] = True
    json.dump(index, open(os.path.join(ART, "index.json"), "w"))
    print("comic art for", len(index))
