"""Stage 1: find each squad player's Wikipedia photo (batched MediaWiki API), same matching rules as the app."""
import json, sys, time, requests
UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap)"}
API = "https://en.wikipedia.org/w/api.php"
LEAGUES = [2021, 2014, 2002, 2019, 2015, 2001]
out_path = sys.argv[1]

players = {}
for lg in LEAGUES:
    teams = requests.get(f"https://footsnap-app.vercel.app/api/fd/competitions/{lg}/teams", timeout=60).json()["teams"]
    for t in teams:
        for p in t.get("squad") or []:
            players.setdefault(p["id"], {"id": p["id"], "name": p["name"], "dob": p.get("dateOfBirth"), "leagues": set()})["leagues"].add(lg)
print("players:", len(players), flush=True)

def query(titles):
    for attempt in range(4):
        r = requests.get(API, params={"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                                      "prop": "pageimages|description|pageprops", "piprop": "name|original",
                                      "titles": "|".join(titles)}, headers=UA, timeout=60)
        if r.status_code == 200:
            return r.json()
        time.sleep(2 + attempt * 3)
    r.raise_for_status()

def candidates(p):
    year = (p["dob"] or "")[:4]
    c = []
    if year: c.append(f'{p["name"]} (footballer, born {year})')
    c += [f'{p["name"]} (footballer)', p["name"]]
    return c

# look up every candidate title in batches of 50
want = sorted({t for p in players.values() for t in candidates(p)})
pages = {}
for i in range(0, len(want), 50):
    batch = want[i:i + 50]
    d = query(batch)["query"]
    norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
    redir = {n["from"]: n["to"] for n in d.get("redirects", [])}
    byTitle = {pg["title"]: pg for pg in d.get("pages", [])}
    for t in batch:
        tt = redir.get(norm.get(t, t), norm.get(t, t))
        pages[t] = byTitle.get(tt)
    time.sleep(0.15)
    if i % 1000 == 0: print("looked up", i, "/", len(want), flush=True)

found = {}
for p in players.values():
    for t in candidates(p):
        pg = pages.get(t)
        if not pg or pg.get("missing") or "disambiguation" in (pg.get("pageprops") or {}):
            continue
        desc = (pg.get("description") or "").lower()
        if "football" not in desc and "soccer" not in desc:
            continue
        found[p["id"]] = {"title": pg["title"], "image": pg.get("pageimage"), "original": (pg.get("original") or {}).get("source"),
                          "qid": (pg.get("pageprops") or {}).get("wikibase_item")}
        break

WD = "https://www.wikidata.org/w/api.php"
def wd(params):
    for attempt in range(4):
        r = requests.get(WD, params={"format": "json", **params}, headers=UA, timeout=60)
        if r.status_code == 200: return r.json()
        time.sleep(2 + attempt * 3)
    r.raise_for_status()

def entities(qids):
    out = {}
    q = list(qids)
    for i in range(0, len(q), 50):
        d = wd({"action": "wbgetentities", "ids": "|".join(q[i:i+50]), "props": "claims"})
        out.update(d.get("entities", {}))
        time.sleep(0.15)
    return out

def claim(ent, prop):
    for c in (ent.get("claims") or {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if v is not None: return v
    return None

FOOTBALLER = {"Q937857", "Q18515558"}  # association football player, footballer
def is_footballer(ent):
    occ = [c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") for c in (ent.get("claims") or {}).get("P106", [])]
    return any(o in FOOTBALLER for o in occ)

def born(ent):
    v = claim(ent, "P569")
    return v["time"][1:11] if isinstance(v, dict) and "time" in v else None

# 1b: article but no photo -> the article's Wikidata item's image (P18)
need = [pid for pid, f in found.items() if not f.get("original") and f.get("qid")]
ents = entities({found[pid]["qid"] for pid in need})
for pid in need:
    img = claim(ents.get(found[pid]["qid"], {}), "P18")
    if img:
        found[pid]["image"] = img; found[pid]["source"] = "wikidata"
print("1b: photos from the article's Wikidata item:", sum(1 for pid in need if found[pid].get("image")), "of", len(need), flush=True)

# 1c: no article at all -> search Wikidata by name, accept only a footballer born on the same day
missing = [p for p in players.values() if p["id"] not in found and p["dob"]]
cand = {}
for n, p in enumerate(missing):
    d = wd({"action": "wbsearchentities", "search": p["name"], "language": "en", "type": "item", "limit": 7})
    cand[p["id"]] = [x["id"] for x in d.get("search", [])]
    time.sleep(0.1)
    if n % 100 == 0: print("1c search", n, "/", len(missing), flush=True)
ents = entities({q for qs in cand.values() for q in qs})
hits = 0
for p in missing:
    for q in cand[p["id"]]:
        e = ents.get(q, {})
        if is_footballer(e) and born(e) == p["dob"][:10]:
            img = claim(e, "P18")
            found[p["id"]] = {"qid": q, "image": img, "source": "wikidata", "title": None}
            if img: hits += 1
            break
print("1c: matched on Wikidata by name + exact birth date, with photo:", hits, "of", len(missing), flush=True)

res = [{"id": p["id"], "name": p["name"], "dob": p["dob"], "leagues": sorted(p["leagues"]), **found.get(p["id"], {})} for p in players.values()]
json.dump(res, open(out_path, "w"), indent=1)
article = sum(1 for r in res if r.get("title"))
photo = sum(1 for r in res if r.get("image"))
print(f"players {len(res)} | footballer article {article} ({article*100//len(res)}%) | with photo {photo} ({photo*100//len(res)}%)")
for lg in LEAGUES:
    sub = [r for r in res if lg in r["leagues"]]
    print(lg, len(sub), "photo", sum(1 for r in sub if r.get("image")), f'({sum(1 for r in sub if r.get("image"))*100//len(sub)}%)')
