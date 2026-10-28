"""Re-frame every cut-out from its original photo so all cards share one framing.

The first pass (process.py) sized the crop from a Haar face box and clamped it to the photo's edges, so a
tight photo came out with the forehead cut off and a wide one with a tiny head. This pass finds the face
with YuNet (box + eye landmarks), levels the eyes, and maps every face to the same size and spot on a
600x800 canvas. Where the canvas reaches past the photo's edge it stays transparent instead of re-cropping.
Output replaces public/art/<id>.webp; index.json gets the new headTop.

    python scripts/art/reframe.py public/art art/models [id,id,...]
"""
import io, json, os, sys, time, urllib.parse
import numpy as np, cv2, requests
from PIL import Image
from rembg import new_session, remove

ART, MODELS = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] else None
OUT = os.environ.get("REFRAME_OUT", ART)
CACHE = os.environ.get("REFRAME_CACHE", "art/src")
W, H = 600, 800
FACE_H = float(os.environ.get("FACE_H", 0.31)) * H  # YuNet box height (brow to chin) on the card
EYE_Y = float(os.environ.get("EYE_Y", 0.33)) * H     # where the eye line sits
FEATHER = 70.0  # px over which a body fades out where the photo stops
SOFT = 1.5      # enlarging the photo more than this leaves the face visibly blurry
UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap)"}
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)

index = json.load(open(os.path.join(ART, "index.json")))
keys = [k for k in index if not ONLY or k in ONLY]
# SHARD=i/n: this worker takes the players whose id % n == i and writes index-i.json (merge.py joins them)
SHARD = os.environ.get("SHARD")
INDEX = "index.json"
if SHARD:
    si, sn = map(int, SHARD.split("/"))
    keys = [k for k in keys if int(k) % sn == si]
    INDEX = f"index-{si}.json"
detector = cv2.FaceDetectorYN.create(os.path.join(MODELS, "yunet.onnx"), "", (320, 320), 0.6)
os.environ.setdefault("U2NET_HOME", os.path.join(MODELS, "models"))
session = new_session("u2net_human_seg")


def source(key):
    path = os.path.join(CACHE, f"{key}.jpg")
    if os.path.exists(path):
        return Image.open(path).convert("RGB")
    title = "File:" + urllib.parse.unquote(index[key]["page"].split("File:")[1])
    for a in range(5):
        r = requests.get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "format": "json", "formatversion": 2,
            "titles": title, "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 1280}, headers=UA, timeout=60)
        if r.status_code == 200: break
        time.sleep(10 * (a + 1))
    ii = r.json()["query"]["pages"][0]["imageinfo"][0]
    url = ii.get("thumburl") or ii["url"]
    for a in range(5):
        resp = requests.get(url, headers=UA, timeout=60)
        if resp.status_code != 429: break
        time.sleep(min(120, int(resp.headers.get("Retry-After") or 0) or 15 * (a + 1)))
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    img.save(path, quality=95)
    time.sleep(0.5)
    return img


def face(img):
    a = np.array(img)[:, :, ::-1]
    h, w = a.shape[:2]
    detector.setInputSize((w, h))
    _, found = detector.detect(a)
    if found is None or not len(found): return None
    # the subject: big and confident, preferring the upper-middle of the photo
    def score(f):
        x, y, fw, fh = f[:4]; cx = (x + fw / 2) / w
        return fw * fh * f[14] * (1.2 - abs(cx - 0.5))
    return max(found, key=score)


def reframe(img, f):
    x, y, fw, fh = f[:4]
    (rx, ry), (lx, ly) = f[4:6], f[6:8]
    ang = np.degrees(np.arctan2(ly - ry, lx - rx))
    if abs(ang) > 15: ang = 0  # a tilted head is a pose, not a camera tilt
    s = FACE_H / fh
    ex, ey = (rx + lx) / 2, (ry + ly) / 2
    M = cv2.getRotationMatrix2D((float(ex), float(ey)), float(ang), float(s))
    M[0, 2] += W / 2 - ex; M[1, 2] += EYE_Y - ey
    src = np.array(img)
    # warp the photo and, separately, which canvas pixels the photo actually covers
    out = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    cover = cv2.warpAffine(np.full(src.shape[:2], 255, np.uint8), M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    # where the photo's top edge lands, measured over the head's columns: below the hair line means a cut head
    col = slice(int(W / 2 - FACE_H * 0.4), int(W / 2 + FACE_H * 0.4))
    top_edge = int(np.argmax(cover[:, col].max(axis=1) > 128))
    return out, cover, s, top_edge


done, report = 0, {}
for key in keys:
    try:
        img = source(key)
        f = face(img)
        if f is None:
            report[key] = "noface"; continue
        rgb, cover, s, top_edge = reframe(img, f)
        if s > SOFT:
            report[key] = f"soft s={s:.2f}"; continue
        cut = np.array(remove(Image.fromarray(rgb), session=session, post_process_mask=True))
        # where the photo ran out mid-body, fade the body out instead of ending on a straight line
        dist = cv2.distanceTransform((cover > 128).astype(np.uint8), cv2.DIST_L2, 5)
        fade = np.clip(dist / FEATHER, 0, 1); fade = fade * fade * (3 - 2 * fade)
        a = cut[:, :, 3].astype(np.float32) * fade
        cut[:, :, 3] = a.astype(np.uint8)
        rows = np.where((a > 128).any(axis=1))[0]
        head_top = float(rows[0] / H) if len(rows) else 0.0
        bottom = float(rows[-1] / H) if len(rows) else 0.0
        # sharpness of the face itself, at card size (a motion-blurred original stays blurry however it's framed)
        g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        fy0 = int(EYE_Y - FACE_H * 0.45); fx0 = int(W / 2 - FACE_H * 0.4)
        sharp = float(cv2.Laplacian(g[fy0:fy0 + int(FACE_H), fx0:fx0 + int(FACE_H * 0.8)], cv2.CV_32F).var())
        # hair touching where the photo stopped = the photographer cut the head off
        cut_head = bool(top_edge > 0 and rows.size and rows[0] <= top_edge + 2)
        Image.fromarray(cut, "RGBA").save(os.path.join(OUT, f"{key}.webp"), "WEBP", quality=82, method=6)
        entry = {k: v for k, v in index[key].items() if k != "cutHead"}
        index[key] = {**entry, "headTop": round(head_top, 3), "scale": round(float(s), 2), "sharp": round(sharp), "bottom": round(bottom, 3), **({"cutHead": True} if cut_head else {})}
        report[key] = f"ok s={s:.2f} sharp={sharp:.0f} bottom={bottom:.2f}" + (" CUTHEAD" if cut_head else "")
        done += 1
        if done % 25 == 0:
            json.dump({k: index[k] for k in keys}, open(os.path.join(OUT, INDEX), "w")); print("done", done, flush=True)
    except Exception as e:
        report[key] = f"err {type(e).__name__} {str(e)[:60]}"
json.dump({k: index[k] for k in keys}, open(os.path.join(OUT, INDEX), "w"))
json.dump(report, open(os.path.join(OUT, INDEX.replace("index", "report")), "w"), indent=0)
print("reframed", done, "of", len(keys), {r.split()[0]: sum(v.split()[0] == r.split()[0] for v in report.values()) for r in set(report.values())})
