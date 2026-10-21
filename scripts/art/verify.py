"""Stage 3: catch namesakes. For photos matched through an English Wikipedia article, compare the article's
Wikidata birth date (P569) with the squad's date of birth; on a mismatch, drop the photo and delete its cut-out."""
import json, os, sys, time, requests
UA = {"User-Agent": "FootSnap art pipeline (https://github.com/otawfik/Footsnap)"}
src, out = sys.argv[1], sys.argv[2]
res = json.load(open(src))
check = [r for r in res if r.get("image") and r.get("qid") and r.get("dob")]
born = {}
q = sorted({r["qid"] for r in check})
for i in range(0, len(q), 50):
    for a in range(4):
        rr = requests.get("https://www.wikidata.org/w/api.php", params={"action": "wbgetentities", "format": "json", "ids": "|".join(q[i:i+50]), "props": "claims"}, headers=UA, timeout=60)
        if rr.status_code == 200: break
        time.sleep(3 + 3 * a)
    for qid, e in rr.json().get("entities", {}).items():
        for c in (e.get("claims") or {}).get("P569", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            if isinstance(v, dict) and "time" in v:
                born.setdefault(qid, set()).add(v["time"][1:11])
    time.sleep(0.15)
index_path = os.path.join(out, "index.json")
index = json.load(open(index_path)) if os.path.exists(index_path) else {}
bad = []
for r in check:
    dates = born.get(r["qid"])
    if dates and r["dob"][:10] not in dates:
        bad.append((r["name"], r["dob"][:10], sorted(dates)[0], r.get("title")))
        r["image"] = None; r["mismatch"] = True
        index.pop(str(r["id"]), None)
        p = os.path.join(out, f'{r["id"]}.webp')
        if os.path.exists(p): os.remove(p)
json.dump(res, open(src, "w"), indent=1)
json.dump(index, open(index_path, "w"), separators=(",", ":"))
unverified = sum(1 for r in check if r["qid"] not in born)
print(f"checked {len(check)} | birth-date mismatches removed {len(bad)} | no birth date on Wikidata (kept) {unverified}")
for b in bad[:25]: print("  ", b)
