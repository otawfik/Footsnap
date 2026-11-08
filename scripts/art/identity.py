"""Download more.py's candidates and make sure each one shows the right player, before any cut-out is made.

    python scripts/art/identity.py more.json art/cands art/models

A Commons category or a "depicts" tag says a player is *in* a photo, not that he is the face in front, so
every candidate is checked face by face (YuNet finds faces, SFace compares them):
  - the face the cut-out would use (same choice as reframe.py: big, confident, near the middle) must clearly
    dominate: no second face at least DOMINANT of its area, or the cut-out could be someone else;
  - a file found through Commons (category / depicts) must look like the player: SFace similarity of at
    least SAME (OpenCV's published threshold) with a photo the player's Wikidata item or Wikipedia article
    uses (refs), or, when he has none, with another of his candidate files;
  - P18 and Wikipedia lead images are trusted as resolve.py trusts them (still subject to the first rule).
Passing files stay in <cands>/<id>-<n>.jpg (the 1280 px Commons thumbnail, as process.py would fetch it);
references and failures are deleted. <cands>/identity.json lists, per player, the passing images in order.
Downloads are polite: 1280 px (a standard Wikimedia thumbnail width), two workers, back off on HTTP 429.
"""
import io, json, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2, requests
from PIL import Image

UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap; second pass for missing players)"}
SRC, OUT, MODELS = sys.argv[1], sys.argv[2], sys.argv[3]
SAME, DOMINANT = 0.363, 0.30
KEEP = 3  # verified candidates kept per player (rounds.py tries them in order)
os.makedirs(OUT, exist_ok=True)
players = json.load(open(SRC))
state_path = os.path.join(OUT, "identity.json")
state = json.load(open(state_path)) if os.path.exists(state_path) else {}

# thumbnail URLs, 50 files a call
urls = {}
names = sorted({c["image"] for p in players for c in p["cands"]} | {f for p in players for f in p.get("refs", [])})
for i in range(0, len(names), 50):
    for a in range(5):
        r = requests.get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "format": "json", "formatversion": 2,
            "titles": "|".join("File:" + f for f in names[i:i + 50]), "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 1280}, headers=UA, timeout=60)
        if r.status_code == 200: break
        time.sleep(10 * (a + 1))
    d = r.json().get("query", {})
    norm = {n["to"]: n["from"] for n in d.get("normalized", [])}
    for pg in d.get("pages", []):
        if pg.get("imageinfo"):
            ii = pg["imageinfo"][0]
            urls[norm.get(pg["title"], pg["title"])[5:].replace(" ", "_")] = ii.get("thumburl") or ii["url"]
    time.sleep(0.2)
print("urls", len(urls), "of", len(names), flush=True)

local = threading.local()
def models():
    if not hasattr(local, "det"):
        local.det = cv2.FaceDetectorYN.create(os.path.join(MODELS, "yunet.onnx"), "", (320, 320), 0.6)
        local.rec = cv2.FaceRecognizerSF.create(os.path.join(MODELS, "sface.onnx"), "")
    return local.det, local.rec

def fetch(name):
    url = urls.get(name.replace(" ", "_"))
    if not url: return None
    for a in range(5):
        try:
            resp = requests.get(url, headers=UA, timeout=60)
        except requests.RequestException:
            time.sleep(10 * (a + 1)); continue
        if resp.status_code != 429: break
        time.sleep(min(120, int(resp.headers.get("Retry-After") or 0) or 15 * (a + 1)))
    time.sleep(0.4)
    if resp.status_code != 200 or "image" not in resp.headers.get("Content-Type", ""): return None
    try:
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception:
        return None

def subject(img):
    """The face reframe.py would frame, its embedding, and whether it dominates the photo."""
    det, rec = models()
    a = np.array(img)[:, :, ::-1]
    h, w = a.shape[:2]
    det.setInputSize((w, h))
    _, found = det.detect(a)
    if found is None or not len(found): return None, None, "no face"
    def score(f):
        x, y, fw, fh = f[:4]; cx = (x + fw / 2) / w
        return fw * fh * f[14] * (1.2 - abs(cx - 0.5))
    i = max(range(len(found)), key=lambda k: score(found[k]))
    f = found[i]; area = f[2] * f[3]
    rivals = [g for k, g in enumerate(found) if k != i and g[2] * g[3] >= area * DOMINANT]
    emb = rec.feature(rec.alignCrop(a, f))
    return f, emb, ("second face" if rivals else None)

def similar(e1, e2):
    _, rec = models()
    return float(rec.match(e1, e2, cv2.FaceRecognizerSF_FR_COSINE))

def check(p):
    key = str(p["id"])
    if key in state: return key, state[key]
    refs = []
    for name in p.get("refs", []):
        img = fetch(name)
        if img is None: continue
        f, e, _ = subject(img)
        if f is not None: refs.append(e)
    got = []
    for n, c in enumerate(p["cands"]):
        img = fetch(c["image"])
        if img is None: got.append((c, None, None, "download failed")); continue
        f, e, why = subject(img)
        got.append((c, img, e, why))
    kept, log = [], []
    for n, (c, img, e, why) in enumerate(got):
        if not why and c["source"] in ("category", "depicts", "title"):
            if refs:
                best = max(similar(e, r) for r in refs)
            elif c["source"] == "title":
                # two title finds agreeing only proves they show the same person: most such pairs were namesakes
                best = -1
            else:
                others = [o[2] for m, o in enumerate(got) if m != n and o[2] is not None and not o[3]]
                best = max((similar(e, o) for o in others), default=-1)
            if best < SAME: why = f"face doesn't match ({best:.2f}, {'refs' if refs else 'other candidates'})"
        if not why and len(kept) >= KEEP: why = "spare"
        if why:
            log.append({"image": c["image"], "source": c["source"], "why": why}); continue
        path = os.path.join(OUT, f"{key}-{n}.jpg")
        img.save(path, quality=95)
        kept.append({"image": c["image"], "source": c["source"], "file": path})
    return key, {"kept": kept, "rejected": log}

done = 0
with ThreadPoolExecutor(2) as pool:
    for key, res in pool.map(check, players):
        state[key] = res; done += 1
        if done % 50 == 0:
            json.dump(state, open(state_path, "w"), indent=0); print("checked", done, "/", len(players), flush=True)
json.dump(state, open(state_path, "w"), indent=0)
why = {}
for v in state.values():
    for r in v["rejected"]:
        k = r["why"].split(" (")[0]
        if k != "spare": why[k] = why.get(k, 0) + 1
print(f"players {len(state)} | with a verified candidate {sum(bool(v['kept']) for v in state.values())} | candidates kept {sum(len(v['kept']) for v in state.values())}")
print("rejected:", why)
