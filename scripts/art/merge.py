"""Merge the per-worker credit files (index-<i>.json) into index.json and drop entries without an image file."""
import glob, json, os, sys
out = sys.argv[1]
merged = {}
for f in sorted(glob.glob(os.path.join(out, "index*.json"))):
    merged.update(json.load(open(f)))
merged = {k: v for k, v in merged.items() if os.path.exists(os.path.join(out, f"{k}.webp"))}
json.dump(merged, open(os.path.join(out, "index.json"), "w"), separators=(",", ":"))
for f in glob.glob(os.path.join(out, "index-*.json")):
    os.remove(f)
print("index entries:", len(merged))
