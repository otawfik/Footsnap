"""Third pass: rescue verified photos the card pipeline couldn't frame.

    python scripts/art/rescue.py art/cands/identity.json art/keep.json art/rescue/cands art/models

identity.py verified ~850 players' photos as really them, but rounds.py placed only ~270: most of the rest
were action shots where the player is small in the frame. At 1280 px his face is under process.py's
minimum face size (1/14 of the width), so the crop fell back to the middle of the scene and gate.py
rightly called it "not a portrait"; or the face was so small that reframe.py would have to enlarge it
past 1.5x ("soft").

So for every verified candidate of a player still without a card photo:
  1. fetch the file again at up to 1920 px (Commons serves the original when it's smaller), so a small
     face has twice the pixels;
  2. find the same face identity.py chose (YuNet, same scoring: big, confident, near the middle) and check
     it's still him (SFace against the 1280 px candidate identity.py verified);
  3. cut a head-and-shoulders crop around it (process.py's own framing: six face-heights tall, 3:4), at
     full resolution, and keep it as the candidate.
Faces under MIN_FACE px tall even at 1920 are dropped: reframe.py would reject them as soft anyway.
The output has identity.json's shape, so rounds.py runs it through the usual process / clean / gate /
reframe stages unchanged. Downloads are polite: two workers, back off on HTTP 429.
"""
import io, json, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2, requests
from PIL import Image

IDENT, PLACED, OUT, MODELS = sys.argv[1:5]
UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap; rescue pass for small faces)"}
WIDTH = 1920  # a standard Wikimedia thumbnail step (non-standard widths get rate-limited)
CROP_FACES = 6.0
MIN_FACE = 150  # px; reframe.py wants the face 248 px tall in an 800 px card and enlarges at most 1.5x (165 px)
SAME = 0.363
os.makedirs(OUT, exist_ok=True)

ident = json.load(open(IDENT))
placed = set(json.load(open(PLACED)))
todo = {k: v["kept"] for k, v in ident.items() if v.get("kept") and k not in placed}
print(len(todo), "players with verified photos and no card photo", flush=True)


def get(url, **kw):
    for a in range(5):
        try:
            r = requests.get(url, headers=UA, timeout=90, **kw)
        except requests.RequestException:
            time.sleep(10 * (a + 1)); continue
        if r.status_code != 429: return r
        time.sleep(min(120, int(r.headers.get("Retry-After") or 0) or 15 * (a + 1)))
    return None


# big-thumbnail urls, 50 titles a request
names = sorted({c["image"] for cs in todo.values() for c in cs})
urls = {}
for i in range(0, len(names), 50):
    r = get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "format": "json", "formatversion": 2, "prop": "imageinfo",
            "iiprop": "url|size", "iiurlwidth": WIDTH, "titles": "|".join("File:" + n for n in names[i:i + 50])})
    if not r: continue
    d = r.json().get("query", {})
    norm = {n["to"]: n["from"] for n in d.get("normalized", [])}
    for pg in d.get("pages", []):
        if pg.get("imageinfo"):
            ii = pg["imageinfo"][0]
            urls[norm.get(pg["title"], pg["title"])[5:].replace(" ", "_")] = ii.get("thumburl") or ii["url"]
    time.sleep(0.3)
print("urls", len(urls), "of", len(names), flush=True)

local = threading.local()
def models():
    if not hasattr(local, "det"):
        local.det = cv2.FaceDetectorYN.create(os.path.join(MODELS, "yunet.onnx"), "", (320, 320), 0.6)
        local.rec = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "sface.onnx"), "")
    return local.det, local.rec


def subject(a):
    det, rec = models()
    h, w = a.shape[:2]
    det.setInputSize((w, h))
    _, found = det.detect(a)
    if found is None or not len(found): return None, None
    def score(f):
        cx = (f[0] + f[2] / 2) / w
        return f[2] * f[3] * f[14] * (1.2 - abs(cx - 0.5))
    f = max(found, key=score)
    return f, rec.feature(rec.alignCrop(a, f))


def rescue(item):
    key, cands = item
    out = []
    for n, c in enumerate(cands):
        url = urls.get(c["image"].replace(" ", "_"))
        if not url: continue
        r = get(url); time.sleep(0.4)
        if not r or r.status_code != 200 or "image" not in r.headers.get("Content-Type", ""): continue
        try:
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception:
            continue
        big = np.array(img)[:, :, ::-1]
        f, emb = subject(big)
        if f is None or f[3] < MIN_FACE: continue
        # still him: compare with the 1280 px file identity.py verified
        ref = cv2.imread(c["file"]) if os.path.exists(c["file"]) else None
        if ref is not None:
            rf, remb = subject(ref)
            if remb is not None and float(models()[1].match(emb, remb, cv2.FaceRecognizerSF_FR_COSINE)) < SAME: continue
        x, y, fw, fh = f[:4]
        ih, iw = big.shape[:2]
        ch = min(ih, fh * CROP_FACES); cw = ch * 3 / 4
        if cw > iw: cw = iw; ch = cw * 4 / 3
        left = min(max(0, x + fw / 2 - cw / 2), iw - cw); top = min(max(0, y - fh * 1.15), ih - ch)
        crop = img.crop((int(left), int(top), int(left + cw), int(top + ch)))
        path = os.path.join(OUT, f"{key}-{n}.jpg")
        crop.save(path, quality=95)
        out.append({**c, "file": path, "rescued": True})
    return key, out


res = {}
with ThreadPoolExecutor(2) as ex:
    for i, (key, out) in enumerate(ex.map(rescue, todo.items())):
        res[key] = {"kept": out}
        if i % 50 == 49: print(f"done {i + 1} / {len(todo)} | with a usable crop {sum(1 for v in res.values() if v['kept'])}", flush=True)
json.dump(res, open(os.path.join(OUT, "identity.json"), "w"), indent=0)
print("players", len(res), "| with a usable crop", sum(1 for v in res.values() if v["kept"]), flush=True)
