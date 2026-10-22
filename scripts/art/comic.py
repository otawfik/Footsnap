"""Comic-book redraw of a transparent player cut-out, v2: inked + cel-coloured, Marvel Snap style.

usage: comic_v2.py <src.webp> <dst.webp> [--variant best|drama]
       comic_v2.py <src dir> <dst dir> [--variant best|drama] [--jobs N]   (batch: every <id>.webp)

  0. face exposure: the face is found (Haar cascades, else the head from the silhouette) and lifted
     toward a well-lit band with a luminance-only gamma, so dark skin keeps its colour (no ashy grey)
  1. flats: edge-preserving smoothing, lighter on the face so eyes and mouth survive
  2. cel shading: lightness split into a large-scale base and a shading term; the shading is cut
     into shadow / core shadow / base / highlight, cleaned (median + island removal) into a few
     hard, anti-aliased shapes. Skin gets one shadow level and keeps some continuous modelling.
  3. colour: chroma boosted on kit, skin painted in one natural hue (no lavender sheen, no hot
     spots), cool clean shadows and lifted shadows on white kits, badges/text restored from a
     lightly smoothed copy
  4. a cool rim light on the up-left facing edge; ("drama": a hard form-shadow band on the far side)
  5. ink: flow-based DoG at three scales (feature lines on the face, fine lines round the head,
     bold contours everywhere), despeckled by size and length, fat face blobs hollowed out,
     solid "spotted" blacks in hair and deep kit shadows, and a bold silhouette that thickens
     toward the bottom
  6. a light halftone in clothing core shadows only
"""
import os, sys
import numpy as np, cv2
from PIL import Image

INK = np.array([16, 12, 22], np.float32)
_FACE = None


def nblur(x, w, s):
    """Gaussian blur of x that only averages pixels where weight w > 0 (no background bleed)."""
    if x.ndim == 3:
        return np.dstack([nblur(x[:, :, c], w, s) for c in range(x.shape[2])])
    num = cv2.GaussianBlur(x * w, (0, 0), s)
    den = cv2.GaussianBlur(w, (0, 0), s)
    return num / np.maximum(den, 1e-4)


def fill_bg(rgb, m):
    """Replace background pixels by nearby figure colours so filters don't pull black in at the edge."""
    w = m.astype(np.float32)
    f = rgb.astype(np.float32)
    far = nblur(f, w, 12)
    near = nblur(f, w, 3)
    den3 = cv2.GaussianBlur(w, (0, 0), 3)
    fill = np.where((den3 > 0.05)[..., None], near, far)
    return np.where(m[..., None], f, fill)


def head_box(rgb, m):
    """The player's face: biggest frontal-face detection in the top half, else a box from the silhouette."""
    global _FACE
    if _FACE is None:
        _FACE = [cv2.CascadeClassifier(cv2.data.haarcascades + n) for n in
                 ("haarcascade_frontalface_default.xml", "haarcascade_frontalface_alt2.xml", "haarcascade_profileface.xml")]
    H, W = m.shape
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    g = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4)).apply(gray)  # helps very dark faces
    s = W // 7
    f = []
    for casc in _FACE:
        for img in (g, cv2.flip(g, 1)) if casc is _FACE[2] else (g,):
            for r in casc.detectMultiScale(img, 1.1, 4, minSize=(s, s)):
                r = list(r)
                if img is not g:
                    r[0] = W - r[0] - r[2]
                if r[1] + r[3] / 2 < H * 0.5 and m[int(r[1] + r[3] / 2), int(min(W - 1, r[0] + r[2] / 2))]:
                    f.append(r)
        if f:
            break
    if f:
        x, y, w, h = max(f, key=lambda r: r[2] * r[3])
        return int(x), int(y), int(w), int(h)
    rows = np.where(m.any(1))[0]
    top = rows[0] if len(rows) else 0
    band = m[top + int(H * 0.04): top + int(H * 0.22)]
    widths = band.sum(1)
    hw = int(np.median(widths)) if len(widths) else W // 3
    cx = int(np.mean(np.where(band)[1])) if band.any() else W // 2
    w = int(hw * 0.85)
    return cx - w // 2, top + int(hw * 0.3), w, w


def flow_dog(g, sig=1.0, k=1.6, tau=0.985, coh_sigma=3.0, steps=4):
    """Difference of Gaussians smoothed along the edge tangent flow (a cheap FDoG)."""
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    E = cv2.GaussianBlur(gx * gx, (0, 0), coh_sigma)
    F = cv2.GaussianBlur(gx * gy, (0, 0), coh_sigma)
    G = cv2.GaussianBlur(gy * gy, (0, 0), coh_sigma)
    # dominant gradient direction; tangent is perpendicular
    th = 0.5 * np.arctan2(2 * F, E - G)
    tx, ty = -np.sin(th), np.cos(th)
    d = cv2.GaussianBlur(g, (0, 0), sig) - tau * cv2.GaussianBlur(g, (0, 0), sig * k)
    H, W = g.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    acc = d.copy()
    wsum = 1.0
    for sgn in (1, -1):
        px, py = xx.copy(), yy.copy()
        for i in range(1, steps + 1):
            px += sgn * tx
            py += sgn * ty
            w = np.exp(-(i * i) / (2 * (steps / 2) ** 2))
            acc += w * cv2.remap(d, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            wsum += w
    return acc / wsum


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ink_lines(src, m, sc, fw, core):
    """Flow-DoG ink. Fine feature lines only around the head (fw), bolder major contours everywhere;
    despeckled by component size and smoothed so strokes have clean, tapered edges."""
    sm = cv2.edgePreservingFilter(src, flags=cv2.RECURS_FILTER, sigma_s=12 * sc, sigma_r=0.25)
    g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY)
    # local contrast normalisation so dark skin and dark kits get lines too
    g = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(g).astype(np.float32) / 255
    # features (eyelids, lashes, nostrils, lips): lighter smoothing so thin dark slits survive
    gf = cv2.cvtColor(cv2.bilateralFilter(src, 5, 18, 3), cv2.COLOR_RGB2GRAY)
    gf = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gf).astype(np.float32) / 255
    out = np.zeros(g.shape, np.float32)
    for sig, eps, minarea, wmap, img in ((1.0, -0.009, 30, fw, g), (2.0, -0.020, 80, None, g), (1.0, -0.007, 8, core, gf)):
        d = flow_dog(img, sig=sig * sc, coh_sigma=2 * sc)
        line = smoothstep(eps, eps - 0.010, d)
        if wmap is not None:
            line = line * wmap
        lb = (line > 0.5).astype(np.uint8)
        n, lab_, st, _ = cv2.connectedComponentsWithStats(lb, 8)
        ext = np.maximum(st[:, cv2.CC_STAT_WIDTH], st[:, cv2.CC_STAT_HEIGHT])
        keep = (st[:, cv2.CC_STAT_AREA] >= int(minarea * sc * sc)) & ((ext >= minarea * 0.4 * sc) | (st[:, cv2.CC_STAT_AREA] >= 4 * minarea * sc * sc))
        keep[0] = False
        out = np.maximum(out, line * keep[lab_])
    # on the face, fat ink blobs (mouth interiors, shadowed stubble) become their outline instead of
    # a solid black patch, which otherwise reads as a moustache or goatee
    kz = max(5, int(round(7 * sc)) | 1)
    fat = cv2.erode((out > 0.5).astype(np.uint8), np.ones((kz, kz), np.uint8))
    fat = cv2.dilate(fat, np.ones((3, 3), np.uint8)).astype(np.float32)
    out = out * (1 - fat * smoothstep(0.4, 0.8, fw) * 0.85)
    out = cv2.GaussianBlur(out, (0, 0), 0.7)
    return smoothstep(0.25, 0.6, out)


def clean_levels(t, nlev, k, sc):
    """Tone index map -> list of anti-aliased cumulative masks (t >= j) with small islands removed."""
    t = cv2.medianBlur(t.astype(np.uint8), k)
    t = cv2.medianBlur(t, k)
    masks = []
    amin = int(250 * sc * sc)
    for j in range(1, nlev):
        b = (t >= j).astype(np.uint8)
        for val in (1, 0):  # drop small islands of this tone, then small holes in it
            n, lab_, st, _ = cv2.connectedComponentsWithStats((b == val).astype(np.uint8), 8)
            small = st[:, cv2.CC_STAT_AREA] < amin
            small[0] = False
            b[small[lab_] & (b == val)] = 1 - val
        mk = cv2.GaussianBlur(b.astype(np.float32), (0, 0), 1.2 * sc)
        masks.append(smoothstep(0.35, 0.65, mk))
    return masks


def comic(rgb, a, variant="best"):
    H, W = a.shape
    sc = W / 600.0
    m = a > 128
    mf = m.astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    src = np.clip(fill_bg(rgb, m), 0, 255).astype(np.uint8)

    # ---- 0. face exposure, in RGB so hue and saturation survive (no ashy lifted skin)
    x, y, w, h = head_box(src, m)
    cx, cy = x + w / 2, y + h * 0.55
    fm = np.zeros((H, W), np.float32)
    cv2.ellipse(fm, (int(cx), int(cy)), (max(1, int(w * 0.33)), max(1, int(h * 0.42))), 0, 0, 360, 1, -1)
    sel = (fm > 0) & m
    L0 = cv2.cvtColor(src, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32) / 2.55
    face_L = float(np.percentile(L0[sel], 60)) if sel.sum() > 50 else 55.0
    fw = np.zeros((H, W), np.float32)
    cv2.ellipse(fw, (int(cx), int(cy - h * 0.1)), (int(w * 0.85), int(h * 1.05)), 0, 0, 360, 1, -1)
    fw = cv2.GaussianBlur(fw, (0, 0), max(2, w * 0.2))
    target = min(52.0, face_L + 16.0)
    lab0 = cv2.cvtColor(src, cv2.COLOR_RGB2LAB).astype(np.float32)
    C0 = np.hypot(lab0[:, :, 1] - 128, lab0[:, :, 2] - 128)
    h0 = np.arctan2(lab0[:, :, 2] - 128, lab0[:, :, 1] - 128)
    skin0 = ((h0 > 0.05) & (h0 < 1.5) & (C0 > 4) & (lab0[:, :, 0] > 38)).astype(np.float32)
    skin0 = cv2.GaussianBlur(skin0, (0, 0), 6 * sc)
    lw = fw * smoothstep(0.15, 0.6, skin0)
    if face_L < target:
        # gamma lift (darks rise more than highlights) toward the target face lightness
        gam = float(np.clip(np.log(target / 100) / np.log(max(face_L, 5) / 100), 0.55, 1.0))
        f = src.astype(np.float32)
        Y = (f @ np.array([0.299, 0.587, 0.114], np.float32)) / 255 + 1e-3
        lit = f * ((Y ** gam) / Y)[..., None]      # lift luminance, keep channel ratios = keep saturation
        src = np.clip(src * (1 - lw[..., None]) + lit * lw[..., None], 0, 255).astype(np.uint8)

    # ---- 1. flats: edge-preserving smoothing; lighter around the face so eyes and mouth survive
    body = cv2.edgePreservingFilter(src, flags=cv2.RECURS_FILTER, sigma_s=25 * sc, sigma_r=0.30)
    face = cv2.edgePreservingFilter(src, flags=cv2.RECURS_FILTER, sigma_s=8 * sc, sigma_r=0.13)
    sm = (body * (1 - fw[..., None]) + face * fw[..., None]).astype(np.uint8)
    smb = cv2.bilateralFilter(sm, 7, 20, 5)
    sm = (smb * (1 - fw[..., None]) + sm * fw[..., None]).astype(np.uint8)
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[:, :, 0] / 2.55
    A = lab[:, :, 1] - 128
    B = lab[:, :, 2] - 128
    base3 = cv2.edgePreservingFilter(sm, flags=cv2.RECURS_FILTER, sigma_s=80 * sc, sigma_r=0.6)
    Lb = cv2.cvtColor(base3, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32) / 2.55
    Lb = nblur(Lb, mf, 3 * sc)

    C = np.hypot(A, B)
    hue = np.arctan2(B, A)
    skin = ((hue > 0.05) & (hue < 1.50) & (C > 5) & (C < 50) & (L > 8)).astype(np.float32)
    # inside the face, sheen/sky reflections (bluish or grey) are still skin
    # (face + forehead only: never the collar, or a grey/white kit gets painted skin-coloured)
    fh = np.zeros((H, W), np.uint8)
    cv2.ellipse(fh, (int(cx), int(y + h * 0.4)), (int(w * 0.45), int(h * 0.6)), 0, 0, 360, 1, -1)
    skin = np.maximum(skin, ((fh > 0) & (L > max(30.0, 0.8 * face_L)) & (C < 25)).astype(np.float32))
    fwide = np.zeros((H, W), np.float32)
    cv2.ellipse(fwide, (int(cx), int(y + h * 0.95)), (int(w * 1.0), int(h * 1.45)), 0, 0, 360, 1, -1)
    fwide = cv2.GaussianBlur(fwide, (0, 0), max(2, w * 0.15))
    skin = cv2.GaussianBlur(skin, (0, 0), 3 * sc) * smoothstep(0.1, 0.5, np.maximum(fw, fwide))  # skin = near the head

    # ---- 2. base value: lift the darks a little, S-curve for punch
    Lb2 = np.where(Lb < 28, 28 - (28 - Lb) * 0.7, Lb)
    Lb2 = 50 + (Lb2 - 50) * 1.12

    # ---- 3. cel shading with clean shapes: tone index -> median cleanup -> anti-aliased masks
    shade = L - Lb
    shade_s = cv2.GaussianBlur(shade, (0, 0), 2.5 * sc) * (1 - skin) + cv2.GaussianBlur(shade, (0, 0), 6.0 * sc) * skin
    t = np.full((H, W), 2, np.uint8)               # 0 core shadow, 1 shadow, 2 base, 3 highlight
    t[shade_s < -5] = 1
    t[(shade_s < -14) & (skin < 0.5)] = 0           # no core shadow on faces
    t[shade_s > 8 + 2 * skin] = 3
    t[(shade_s < -5) & (shade_s > -8) & (skin > 0.5)] = 2   # skin: one shadow level, only clear shadows
    k = 7 if sc < 1.2 else 9
    m_sh, m_base, m_hi = clean_levels(t, 4, k, sc)  # (t>=1), (t>=2), (t>=3)
    deep = 1 - m_sh
    shad = 1 - m_base
    tone = -10.0 * shad - 9.0 * deep + 7.0 * m_hi
    cont = np.clip(shade_s, -12, 12)
    # faces keep more of the continuous modelling (features), clothing is flatter
    Lout = Lb2 + tone + cont * 0.2
    # faces: blend toward the lightly smoothed lightness so eyes, brows and mouth stay readable
    Lface = 50 + (L - 50) * 1.08 + 4.0 * m_hi - 3.0 * shad
    fcore = smoothstep(0.3, 0.8, fw) * smoothstep(0.2, 0.6, skin)
    Lout = Lout * (1 - 0.65 * fcore) + Lface * 0.65 * fcore
    # eye band: keep the real eye (whites, iris, lids) with a little extra local contrast
    ew = np.zeros((H, W), np.float32)
    cv2.ellipse(ew, (int(cx), int(y + h * 0.42)), (int(w * 0.40), int(h * 0.12)), 0, 0, 360, 1, -1)
    ew = cv2.GaussianBlur(ew, (0, 0), max(1, w * 0.04)) * mf
    Lloc = cv2.GaussianBlur(L, (0, 0), 5 * sc)
    Leye = Lface + (L - Lloc) * 0.6
    Lout = Lout * (1 - 0.85 * ew) + Leye * 0.85 * ew
    # faces never sink to black: the darkest skin shadows stay a readable deep brown
    zone = smoothstep(0.3, 0.7, np.maximum(fw, fwide)) * smoothstep(0.1, 0.4, skin)
    Lout = np.where(Lout < 22, Lout + (22 - Lout) * 0.45 * zone, Lout)
    # white/light-grey kit: lighten its shadows so it reads as clean white cloth, not grey mud
    Cn = np.hypot(A, B)
    nb = smoothstep(10, 4, Cn) * (1 - skin) * smoothstep(55, 70, Lb) * mf
    Lout = Lout + nb * np.clip(93 - Lout, 0, None) * 0.4
    # small high-contrast detail (badges, sponsor text, numbers, trims) comes back from the lightly
    # smoothed image so kits stay identifiable
    labd = cv2.cvtColor(face, cv2.COLOR_RGB2LAB).astype(np.float32)
    Ld = labd[:, :, 0] / 2.55
    lc = cv2.GaussianBlur(np.abs(Ld - cv2.GaussianBlur(Ld, (0, 0), 2.5 * sc)), (0, 0), 2 * sc)
    wd = smoothstep(2.5, 6.0, lc) * (1 - fcore) * mf
    wd = smoothstep(0.2, 0.6, cv2.GaussianBlur(wd, (0, 0), 1.5 * sc))
    Lout = Lout * (1 - wd) + (50 + (Ld - 50) * 1.1) * wd
    A = A * (1 - wd) + (labd[:, :, 1] - 128) * wd
    B = B * (1 - wd) + (labd[:, :, 2] - 128) * wd

    # ---- 4. colour: punchy flats, natural skin, clean cool shadows on white kits
    Ab = nblur(A, mf, 1.5 * sc)
    Bb = nblur(B, mf, 1.5 * sc)
    boost = (1.55 * (1 - skin) + 1.12 * skin) * (1 + 0.2 * shad)
    Cb = np.hypot(Ab, Bb) + 1e-3
    boost = np.maximum(boost, skin * np.clip(19.0 / Cb, 1, 2.2))   # skin never reads ashy/grey
    Ao, Bo = Ab * boost, Bb * boost
    # skin is painted in one hue (only value changes): kills grey/lavender sheen patches
    sw = skin * smoothstep(0.1, 0.4, fw)
    As_ = nblur(Ao, sw + 1e-4, 18 * sc)
    Bs_ = nblur(Bo, sw + 1e-4, 18 * sc)
    Cs_ = np.hypot(As_, Bs_) + 1e-3
    hs = np.arctan2(Bs_, As_)
    lean = 0.25 + 0.45 * float(smoothstep(58, 38, face_L))
    hs = hs * (1 - lean) + 0.9 * lean               # lean toward a warm golden-brown, away from mauve/grey
    hs = np.clip(hs, 0.55, 0.95)                    # natural skin hues only (fixes green/magenta colour casts)
    Co = np.maximum(np.hypot(Ao, Bo), np.maximum(0.8 * Cs_, 18.0 + 4.0 * float(smoothstep(55, 35, face_L))))
    Co = np.minimum(Co, 1.25 * np.maximum(Cs_, 18.0) + 4)   # no hot orange/red spots on skin
    keep = 1 - 0.85 * sw
    Ao = Ao * keep + np.cos(hs) * Co * (1 - keep)
    Bo = Bo * keep + np.sin(hs) * Co * (1 - keep)
    Ao += skin * shad * 3.0                         # skin shadows lean warm, never grey
    neutral = smoothstep(12, 5, C) * (1 - skin) * smoothstep(50, 65, Lb)
    Ao += neutral * shad * -1.5
    Bo += neutral * shad * -6.0
    out_lab = np.dstack([np.clip(Lout, 0, 100) * 2.55, np.clip(Ao + 128, 0, 255), np.clip(Bo + 128, 0, 255)])
    out = cv2.cvtColor(out_lab.astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)

    # ---- 5. thin rim light on the silhouette edges facing the key light (upper left)
    dist = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    md = cv2.GaussianBlur(mf, (0, 0), 6 * sc)
    nx = cv2.Sobel(md, cv2.CV_32F, 1, 0, ksize=3)
    ny = cv2.Sobel(md, cv2.CV_32F, 0, 1, ksize=3)
    nn = np.hypot(nx, ny) + 1e-6
    facing = (nx / nn) * 0.7 + (ny / nn) * 0.7
    ow = (3.0 + 2.5 * (yy / H)) * sc
    rim = smoothstep(ow + 4.5 * sc, ow + 3.0 * sc, dist) * smoothstep(0.35, 0.6, facing) * mf
    out = out + (np.array([215, 232, 255], np.float32) - out) * (rim[..., None] * 0.4)

    if variant == "drama":
        # form shadow: a hard-edged cel band on the edges turned away from the key light, so the
        # figure reads as a lit 3-D volume (the classic comic colourist trick)
        md2 = cv2.GaussianBlur(mf, (0, 0), 24 * sc)
        gx2 = cv2.Sobel(md2, cv2.CV_32F, 1, 0, ksize=3)
        gy2 = cv2.Sobel(md2, cv2.CV_32F, 0, 1, ksize=3)
        n2 = np.hypot(gx2, gy2) + 1e-6
        away = -(gx2 / n2) * 0.85 - (gy2 / n2) * 0.25      # edge on the right / lower right
        band = ((md2 < 0.90) & (away > 0.30) & m).astype(np.float32)
        band = smoothstep(0.4, 0.6, cv2.GaussianBlur(band, (0, 0), 3 * sc))
        band *= (1 - 0.6 * fcore)
        out = out * (1 - band[..., None] * np.array([0.36, 0.32, 0.20], np.float32))
        deep = np.maximum(deep, band * (1 - skin))

    # ---- 6. halftone in the core shadows of clothing only
    cell = 5.0 * sc
    u = (xx + yy) / (cell * 1.4142)
    v = (xx - yy) / (cell * 1.4142)
    r = np.hypot(u - np.round(u), v - np.round(v))
    dot = smoothstep(0.30, 0.22, r) * deep * (1 - skin)
    out *= (1 - (0.35 if variant == "drama" else 0.25) * dot[..., None])

    # ---- 7. ink: lines + bold silhouette (heavier toward the bottom of the figure)
    core = np.zeros((H, W), np.float32)
    cv2.ellipse(core, (int(cx), int(y + h * 0.58)), (int(w * 0.42), int(h * 0.36)), 0, 0, 360, 1, -1)
    core = cv2.GaussianBlur(core, (0, 0), max(1, w * 0.04))
    line = ink_lines(src, m, sc, smoothstep(0.15, 0.5, fw), core) * mf
    sil = smoothstep(ow + 0.8, ow - 0.8, dist)
    # spot blacks: the darkest non-skin masses (hair, deep folds, dark kit shadows) go solid ink
    near_skin = cv2.dilate((skin > 0.5).astype(np.uint8), np.ones((int(9 * sc), int(9 * sc)), np.uint8)) > 0
    blk = ((L < 18) & (np.hypot(A, B) < 9) & ((~near_skin) | ((L < 9) & (fwide < 0.3))) & (fm == 0) & m).astype(np.uint8) * 255
    blk = cv2.medianBlur(cv2.medianBlur(blk, k), k)
    n, lab_, st, _ = cv2.connectedComponentsWithStats((blk > 127).astype(np.uint8), 8)
    keep = st[:, cv2.CC_STAT_AREA] >= int(120 * sc * sc)
    keep[0] = False
    blk = smoothstep(0.35, 0.65, cv2.GaussianBlur(keep[lab_].astype(np.float32), (0, 0), 1.2 * sc))
    ink = np.maximum(np.maximum(line * 0.95, sil), blk * 0.92)
    out = out * (1 - ink[..., None]) + INK * ink[..., None]
    return np.clip(out, 0, 255)


def _one(job):
    src, dst, variant = job
    im = np.array(Image.open(src).convert("RGBA"))
    out = comic(im[:, :, :3].copy(), im[:, :, 3], variant)
    Image.fromarray(np.dstack([out.astype(np.uint8), im[:, :, 3]]), "RGBA").save(dst, "WEBP", quality=84, method=4)


if __name__ == "__main__":
    args = sys.argv[1:]
    variant, jobs = "best", os.cpu_count() or 1
    if "--variant" in args:
        i = args.index("--variant"); variant = args[i + 1]; del args[i:i + 2]
    if "--jobs" in args:
        i = args.index("--jobs"); jobs = int(args[i + 1]); del args[i:i + 2]
    src, dst = args
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
        todo = [(os.path.join(src, f), os.path.join(dst, f), variant) for f in sorted(os.listdir(src)) if f.endswith(".webp")]
        cv2.setNumThreads(1)
        from multiprocessing import Pool
        with Pool(jobs) as pool:
            for n, _ in enumerate(pool.imap_unordered(_one, todo, chunksize=4), 1):
                if n % 100 == 0:
                    print(n, "/", len(todo), flush=True)
        print("comic art for", len(todo))
    else:
        _one((src, dst, variant))
