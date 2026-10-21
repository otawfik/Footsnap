"""Stage 2: Commons credits, download, face crop, background removal -> transparent WebP cut-outs + index.json."""
import io, json, os, re, sys, time, html
import requests, numpy as np, cv2
from PIL import Image
from rembg import new_session, remove

UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap)"}
SRC, OUT, MODEL = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = set(sys.argv[4].split(",")) if len(sys.argv) > 4 and sys.argv[4] else None
os.makedirs(OUT, exist_ok=True)
# output size, Commons download width and crop height (in face heights); bigger = sharper cards, larger files
W, H = int(os.environ.get("ART_W", 600)), int(os.environ.get("ART_H", 800))
# 1280 is one of Wikimedia's standard (cached) thumbnail widths; bigger, non-standard widths get rate-limited
SRC_WIDTH = int(os.environ.get("ART_SRC_WIDTH", 1280))
CROP_FACES = float(os.environ.get("ART_CROP", 6.0))

res = [r for r in json.load(open(SRC)) if r.get("image")]
if ONLY: res = [r for r in res if r["name"] in ONLY]
SHARD = os.environ.get("SHARD")  # "i/n": this worker takes players whose id % n == i
main_path = os.path.join(OUT, "index.json")
main = json.load(open(main_path)) if os.path.exists(main_path) else {}
if SHARD:
    si, sn = map(int, SHARD.split("/"))
    res = [r for r in res if r["id"] % sn == si]
    index_path = os.path.join(OUT, f"index-{si}.json")
else:
    index_path = main_path
index = json.load(open(index_path)) if os.path.exists(index_path) else {}
done_before = set(main) | set(index)

def strip(s): return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

# Commons metadata, 50 files a call
meta = {}
files = sorted({r["image"] for r in res})
for i in range(0, len(files), 50):
    for a in range(4):
        rr = requests.get("https://commons.wikimedia.org/w/api.php", params={"action": "query", "format": "json", "formatversion": 2,
            "titles": "|".join("File:" + f for f in files[i:i+50]), "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": SRC_WIDTH}, headers=UA, timeout=60)
        if rr.status_code == 200: break
        time.sleep(3 + a * 3)
    d = rr.json()
    norm = {n["to"]: n["from"] for n in d.get("query", {}).get("normalized", [])}
    for p in d.get("query", {}).get("pages", []):
        if p.get("missing") or not p.get("imageinfo"): continue
        ii = p["imageinfo"][0]; em = ii.get("extmetadata", {})
        key = norm.get(p["title"], p["title"])[5:]
        meta[key.replace(" ", "_")] = meta[key.replace("_", " ")] = {
            "url": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
            "artist": strip(em.get("Artist", {}).get("value")) or strip(em.get("Credit", {}).get("value")) or "Unknown",
            "license": strip(em.get("LicenseShortName", {}).get("value")) or "See file page",
        }
    time.sleep(0.2)
print("metadata", len(files), "files", flush=True)

faces = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
session = new_session(MODEL)

def crop_box(img):
    g = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    found = faces.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(max(24, img.width // 14),) * 2)
    iw, ih = img.size
    if len(found):
        x, y, w, h = max(found, key=lambda f: f[2] * f[3])
        ch = min(ih, h * CROP_FACES); cw = ch * W / H
        if cw > iw: cw = iw; ch = cw * H / W
        cx = x + w / 2; top = y - h * 1.15
        left = min(max(0, cx - cw / 2), iw - cw); top = min(max(0, top), ih - ch)
        return (int(left), int(top), int(left + cw), int(top + ch)), True
    # no face found: top-anchored centre crop
    cw = min(iw, ih * W / H); ch = cw * H / W
    left = (iw - cw) / 2
    return (int(left), 0, int(left + cw), int(min(ih, ch))), False

done = skipped = 0
for r in res:
    key = str(r["id"])
    if key in done_before and os.path.exists(os.path.join(OUT, f"{key}.webp")): continue
    m = meta.get(r["image"]) or meta.get(r["image"].replace("_", " "))
    if not m or not m["url"]: skipped += 1; continue
    try:
        # be polite to Wikimedia: back off when it says we're going too fast
        for attempt in range(4):
            resp = requests.get(m["url"], headers=UA, timeout=60)
            if resp.status_code != 429: break
            time.sleep(min(120, int(resp.headers.get("Retry-After") or 0) or 15 * (attempt + 1)))
        if resp.status_code != 200 or "image" not in resp.headers.get("Content-Type", ""):
            skipped += 1; print("skip", r["name"], "HTTP", resp.status_code, flush=True); continue
        raw = resp.content
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if min(img.size) < 200: skipped += 1; continue
        box, face = crop_box(img)
        img = img.crop(box).resize((W, H), Image.LANCZOS)
        cut = remove(img, session=session, post_process_mask=True)
        a = np.array(cut)[:, :, 3]
        coverage = float((a > 128).mean())
        if coverage < 0.08: skipped += 1; continue  # segmentation failed: nothing left
        rows = np.where((a > 128).any(axis=1))[0]
        head_top = float(rows[0] / H) if len(rows) else 0.0
        cut.save(os.path.join(OUT, f"{key}.webp"), "WEBP", quality=80, method=4)
        index[key] = {"headTop": round(head_top, 3), "face": face, "artist": m["artist"][:120], "license": m["license"], "page": m["page"]}
        done += 1
        if done % 50 == 0:
            json.dump(index, open(index_path, "w"))
            print("processed", done, flush=True)
    except Exception as e:
        skipped += 1
        print("skip", r["name"], type(e).__name__, str(e)[:80], flush=True)
    time.sleep(0.4)
json.dump(index, open(index_path, "w"))
print(f"done {done} skipped {skipped} total {len(index)}")
