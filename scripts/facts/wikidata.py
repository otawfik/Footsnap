"""Real facts for every squad player, from Wikidata, for the Duel abilities (lib/abilities.ts).

    python3 scripts/facts/wikidata.py <squads-dir> lib/facts.json

Not club histories: Wikidata's P54 lists are often incomplete (Calvin Bassey's has only Fulham), so a
count of clubs would make false "one-club man" claims.

football-data's squads say only Goalkeeper / Defence / Midfield / Offence, age and passport. Wikidata
says more, and every fact here is one it states:
  pos     the player's listed positions (P413), mapped to POS_WORDS below, most specific first
  cm      height (P2048), in centimetres
  caps    senior caps for his country (P1350 on the P54 national-team statement), the highest listed

Matching is by exact date of birth AND name, never name alone: the squad's DOB must equal the item's P569
and the squad name's surname must appear in the item's label or aliases. Two footballers left after that =
no facts for him (better a generic ability than a stranger's). Queries go to the public SPARQL endpoint,
one at a time, a second apart, with a descriptive User-Agent.
"""
import json, os, sys, time, unicodedata, re
import requests

SQUADS, OUT = sys.argv[1], sys.argv[2]
UA = {"User-Agent": "FootSnap facts (https://github.com/otawfik/Footsnap; Duel abilities from Wikidata)", "Accept": "application/sparql-results+json"}
EP = "https://query.wikidata.org/sparql"

# position labels (P413, English) -> FootSnap's position words, checked in this order
POS_WORDS = [("goalkeeper", "gk"), ("wing-back", "fb"), ("wing back", "fb"), ("full-back", "fb"), ("full back", "fb"),
             ("left-back", "fb"), ("right-back", "fb"), ("left back", "fb"), ("right back", "fb"), ("winger", "wg"),
             ("centre-back", "cb"), ("center back", "cb"), ("centre back", "cb"), ("sweeper", "cb"), ("defender", "cb"),
             ("defensive midfielder", "dm"), ("attacking midfielder", "am"), ("playmaker", "am"),
             ("centre-forward", "st"), ("center forward", "st"), ("striker", "st"), ("forward", "fw"), ("midfielder", "cm")]
SPECIFIC = ["gk", "wg", "fb", "dm", "am", "st", "cb", "cm", "fw"]


def pos_word(label):
    l = label.lower()
    return next((w for k, w in POS_WORDS if k in l), None)


NOT_SENIOR = re.compile(r"under-?\d|\bu-?\d\d\b|olympic|youth|\bb\b|reserves|\bii\b|academy|amateur", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]+", " ", s).split()


def sparql(q, tries=5):
    for i in range(tries):
        try:
            r = requests.post(EP, data={"query": q}, headers=UA, timeout=90)
        except requests.exceptions.RequestException:
            time.sleep(5 * (i + 1))
            continue
        if r.status_code == 200:
            time.sleep(1)
            return r.json()["results"]["bindings"]
        time.sleep(5 * (i + 1))
    raise RuntimeError("SPARQL failed after retries")


players = {}
for f in sorted(os.listdir(SQUADS)):
    if not f.endswith(".json"):
        continue
    for t in json.load(open(os.path.join(SQUADS, f)))["teams"]:
        for p in t.get("squad", []):
            if p.get("dateOfBirth"):
                players[p["id"]] = {"name": p["name"], "dob": p["dateOfBirth"][:10], "team": t["id"], "teamName": t["name"]}
print(len(players), "players with a date of birth", flush=True)

# 1. footballers born on each date
by_dob = {}
for pid, p in players.items():
    by_dob.setdefault(p["dob"], []).append(pid)
dobs = sorted(by_dob)
cands = {}  # dob -> [(qid, [name tokens...])]
for i in range(0, len(dobs), 60):
    vals = " ".join(f'"{d}T00:00:00Z"^^xsd:dateTime' for d in dobs[i : i + 60])
    rows = sparql(f"""SELECT ?item ?dob (GROUP_CONCAT(DISTINCT ?n; separator="|") AS ?names) WHERE {{
      VALUES ?dob {{ {vals} }}
      ?item wdt:P569 ?dob; wdt:P106 wd:Q937857.
      {{ ?item rdfs:label ?n }} UNION {{ ?item skos:altLabel ?n }}
    }} GROUP BY ?item ?dob""")
    for r in rows:
        cands.setdefault(r["dob"]["value"][:10], []).append((r["item"]["value"].rsplit("/", 1)[1], r["names"]["value"].split("|")))
    print(f"dates {min(i + 60, len(dobs))}/{len(dobs)}", flush=True)

match = {}
for pid, p in players.items():
    toks = norm(p["name"])
    if not toks:
        continue
    sur = toks[-1]
    hits = []
    for qid, names in cands.get(p["dob"], []):
        ns = [norm(n) for n in names]
        if any(sur in n or (len(n) and set(n) <= set(toks)) for n in ns):
            hits.append(qid)
    if len(set(hits)) == 1:
        match[pid] = hits[0]
print(len(match), "matched by name + date of birth", flush=True)

# 2. the facts
qids = sorted(set(match.values()))
facts = {q: {"pos": set(), "cm": None, "clubs": {}, "caps": 0} for q in qids}
for i in range(0, len(qids), 150):
    vals = " ".join(f"wd:{q}" for q in qids[i : i + 150])
    for r in sparql(f"""SELECT ?item ?posL ?h WHERE {{ VALUES ?item {{ {vals} }}
        OPTIONAL {{ ?item wdt:P413 ?pos. ?pos rdfs:label ?posL. FILTER(LANG(?posL) = "en") }}
        OPTIONAL {{ ?item p:P2048/psn:P2048/wikibase:quantityAmount ?h }} }}"""):
        f = facts[r["item"]["value"].rsplit("/", 1)[1]]
        if "posL" in r and pos_word(r["posL"]["value"]):
            f["pos"].add(pos_word(r["posL"]["value"]))
        if "h" in r:
            f["cm"] = round(float(r["h"]["value"]) * 100)  # normalised to metres
    for r in sparql(f"""SELECT ?item ?team ?teamL ?caps WHERE {{ VALUES ?item {{ {vals} }}
        ?item p:P54 ?st. ?st ps:P54 ?team. ?team rdfs:label ?teamL. FILTER(LANG(?teamL) = "en")
        OPTIONAL {{ ?st pq:P1350 ?caps }} }}"""):
        f = facts[r["item"]["value"].rsplit("/", 1)[1]]
        label = r["teamL"]["value"]
        if NOT_SENIOR.search(label):
            continue
        if "national" in label.lower():
            if "caps" in r:
                f["caps"] = max(f["caps"], int(float(r["caps"]["value"])))
        else:
            f["clubs"][r["team"]["value"].rsplit("/", 1)[1]] = label
    print(f"facts {min(i + 150, len(qids))}/{len(qids)}", flush=True)

out = {}
for pid, q in match.items():
    f = facts[q]
    pos = sorted(f["pos"], key=SPECIFIC.index)
    e = {"q": q}
    if pos:
        e["pos"] = pos
    if f["cm"] and 150 <= f["cm"] <= 210:
        e["cm"] = f["cm"]
    if f["caps"]:
        e["caps"] = f["caps"]
    out[str(pid)] = e
json.dump(out, open(OUT, "w"), separators=(",", ":"), sort_keys=True)
print(len(out), "players written to", OUT, flush=True)
