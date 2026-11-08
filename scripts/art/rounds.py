"""Run identity.py's verified candidates through the normal pipeline, one candidate per player per round.

    python scripts/art/rounds.py art/cands art/models art/rounds [rounds=3]

Round n takes each still-unplaced player's n-th verified photo and runs the same stages as a first build:
process.py (crop + background removal, from the cached original), clean.py, gate.py (blurry / not a portrait
/ cut off / a second person), then reframe.py (one framing for every card; faces needing > 1.5x enlargement
are dropped), and finally drops cut heads (hair touching where the photo stopped). A player whose photo fails
any stage gets his next candidate in the next round. Survivors land in <out>/final/<id>.webp with their
credits in <out>/final/index.json; each round's originals are deleted once the round is done.
Two workers at every stage (the downloads were already made by identity.py).
"""
import glob, json, os, shutil, subprocess, sys

CANDS, MODELS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ROUNDS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
state = json.load(open(os.path.join(CANDS, "identity.json")))
more = {str(p["id"]): p for p in json.load(open(os.path.join(CANDS, "..", "more.json")))} if os.path.exists(os.path.join(CANDS, "..", "more.json")) else {}
FINAL = os.path.join(OUT, "final"); os.makedirs(FINAL, exist_ok=True)
final_path = os.path.join(FINAL, "index.json")
final = json.load(open(final_path)) if os.path.exists(final_path) else {}
env = {**os.environ, "U2NET_HOME": os.path.join(MODELS, "models")}
# rescue.py output: RESCUE=1 skips process.py's re-crop and gate.py's portrait check (see both)
if os.environ.get("RESCUE"): env.update({"ART_PRECROPPED": "1", "GATE_NO_PORTRAIT": "1"})
log = {}

def run(args, **extra):
    subprocess.run([PY, "-I", *args], check=True, env={**env, **extra})

def parallel(args, extra):
    procs = [subprocess.Popen([PY, "-I", *args], env={**env, **extra, "SHARD": f"{i}/2"}) for i in range(2)]
    for p in procs:
        if p.wait(): raise SystemExit(f"{args[0]} failed")

# START_ROUND=n resumes after a crash without redoing rounds already finished
for rnd in range(int(os.environ.get("START_ROUND", 0)), ROUNDS):
    todo = {k: v["kept"][rnd] for k, v in state.items() if k not in final and len(v["kept"]) > rnd}
    if not todo: break
    R = os.path.join(OUT, f"round-{rnd}")
    src, raw, clean, framed = (os.path.join(R, d) for d in ("src", "raw", "clean", "framed"))
    for d in (src, raw, clean, framed): os.makedirs(d, exist_ok=True)
    for k, c in todo.items():
        dst = os.path.join(src, f"{k}.jpg")
        if not os.path.exists(dst): shutil.copyfile(c["file"], dst)
    p = more.get
    art = [{"id": int(k), "name": (p(k) or {}).get("name", k), "image": c["image"]} for k, c in todo.items()]
    json.dump(art, open(os.path.join(R, "art.json"), "w"))
    parallel([os.path.join(HERE, "process.py"), os.path.join(R, "art.json"), raw, "u2net_human_seg", ""], {"ART_CACHE": src})
    run([os.path.join(HERE, "merge.py"), raw])
    run([os.path.join(HERE, "clean.py"), raw, clean])
    run([os.path.join(HERE, "gate.py"), clean])
    parallel([os.path.join(HERE, "reframe.py"), clean, MODELS], {"REFRAME_OUT": framed, "REFRAME_CACHE": src})
    reports = {}
    for f in glob.glob(os.path.join(framed, "report-*.json")): reports.update(json.load(open(f)))
    run([os.path.join(HERE, "merge.py"), framed])
    idx = json.load(open(os.path.join(framed, "index.json")))
    rej = json.load(open(os.path.join(clean, "rejected.json")))
    gated = json.load(open(os.path.join(clean, "index.json")))
    rawidx = json.load(open(os.path.join(raw, "index.json")))
    cleaned = set(json.load(open(os.path.join(clean, "index.json")))) | {k for v in rej.values() for k in v}
    kept = 0
    for k, c in todo.items():
        why = None
        if k not in rawidx: why = "process: no usable cut-out"
        elif k not in cleaned: why = "clean: nothing left"
        elif k in rej["framing"]: why = "gate: not a portrait"
        elif k in rej["blurry"]: why = "gate: blurry"
        elif k in rej["crowd"]: why = "gate: cut off or a second person"
        elif k not in idx: why = "reframe: " + reports.get(k, "failed").split()[0]
        elif idx[k].get("cutHead"): why = "reframe: head cut off"
        if why:
            log.setdefault(k, []).append({"image": c["image"], "why": why}); continue
        shutil.copyfile(os.path.join(framed, f"{k}.webp"), os.path.join(FINAL, f"{k}.webp"))
        final[k] = {**idx[k], "image": c["image"], "source": c["source"]}
        kept += 1
    json.dump(final, open(final_path, "w"), indent=0)
    shutil.rmtree(src)  # originals aren't kept
    print(f"round {rnd}: tried {len(todo)} | kept {kept} | total {len(final)}", flush=True)

json.dump(log, open(os.path.join(OUT, "rejected.json"), "w"), indent=0)
why = {}
for k, v in log.items():
    for r in v: why[r["why"]] = why.get(r["why"], 0) + 1
print("rejections by stage:", dict(sorted(why.items(), key=lambda kv: -kv[1])))
