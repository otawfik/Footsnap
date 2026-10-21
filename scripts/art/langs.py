"""Stage 1d: players with a Wikidata item but no photo -> the lead image on de/es/it/fr/pt/nl Wikipedia, if it's a Commons file."""
import json, sys, time, requests
UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap)"}
res = json.load(open(sys.argv[1]))
need = [r for r in res if r.get("qid") and not r.get("image")]
print("players with an item but no photo:", len(need), flush=True)

def get(url, params):
    for a in range(4):
        r = requests.get(url, params={"format": "json", **params}, headers=UA, timeout=60)
        if r.status_code == 200: return r.json()
        time.sleep(2 + a * 3)
    return {}

# sitelinks for the items
links = {}
q = [r["qid"] for r in need]
for i in range(0, len(q), 50):
    d = get("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(q[i:i+50]), "props": "sitelinks"})
    for qid, e in d.get("entities", {}).items():
        links[qid] = {k: v["title"] for k, v in (e.get("sitelinks") or {}).items()}
    time.sleep(0.1)

LANGS = ["dewiki", "eswiki", "itwiki", "frwiki", "ptwiki", "nlwiki"]
images = {}
for wiki in LANGS:
    todo = [(r["qid"], links.get(r["qid"], {}).get(wiki)) for r in need if r["qid"] not in images and links.get(r["qid"], {}).get(wiki)]
    host = f"https://{wiki[:-4]}.wikipedia.org/w/api.php"
    for i in range(0, len(todo), 50):
        batch = todo[i:i+50]
        d = get(host, {"action": "query", "formatversion": 2, "redirects": 1, "prop": "pageimages", "piprop": "name", "titles": "|".join(t for _, t in batch)})
        byTitle = {p["title"]: p.get("pageimage") for p in d.get("query", {}).get("pages", [])}
        norm = {n["from"]: n["to"] for n in d.get("query", {}).get("normalized", [])}
        redir = {n["from"]: n["to"] for n in d.get("query", {}).get("redirects", [])}
        for qid, t in batch:
            tt = redir.get(norm.get(t, t), norm.get(t, t))
            if byTitle.get(tt): images[qid] = byTitle[tt]
        time.sleep(0.1)
    print(wiki, "running total", len(images), flush=True)

# keep only files that live on Commons (freely licensed, reusable)
names = list(set(images.values()))
oncommons = set()
for i in range(0, len(names), 50):
    d = get("https://commons.wikimedia.org/w/api.php", {"action": "query", "formatversion": 2, "titles": "|".join("File:" + n for n in names[i:i+50]), "prop": "imageinfo", "iiprop": "size"})
    for p in d.get("query", {}).get("pages", []):
        if not p.get("missing") and p.get("imageinfo"): oncommons.add(p["title"][5:])
    time.sleep(0.1)
added = 0
for r in need:
    img = images.get(r["qid"])
    if img and img.replace("_", " ") in {n.replace("_", " ") for n in oncommons}:
        r["image"] = img; r["source"] = "otherwiki"; added += 1
json.dump(res, open(sys.argv[1], "w"), indent=1)
photo = sum(1 for r in res if r.get("image"))
print(f"added {added} | with photo {photo} of {len(res)} ({photo*100//len(res)}%)")
for lg in [2021, 2014, 2002, 2019, 2015, 2001]:
    sub = [r for r in res if lg in r["leagues"]]
    n = sum(1 for r in sub if r.get("image")); print(lg, f"{n}/{len(sub)} ({n*100//len(sub)}%)")
