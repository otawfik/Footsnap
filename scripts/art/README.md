# Card art pipeline

Turns freely licensed player photos into the transparent cut-outs the cards use (`public/art/<playerId>.webp`,
credits in `public/art/index.json`). Run it again when squads change; it skips players already done.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install requests pillow "rembg[cpu]" "opencv-python-headless<5"

python scripts/art/resolve.py art.json        # find each squad player's photo
python scripts/art/langs.py art.json          # fill gaps from other-language Wikipedias
# cut out (4 workers in parallel; each takes a quarter of the players)
for i in 0 1; do SHARD=$i/2 python scripts/art/process.py art.json public/art u2net_human_seg "" & done; wait
python scripts/art/merge.py public/art         # merge the workers' credit files into index.json
python scripts/art/verify.py art.json public/art  # drop namesakes: Wikidata birth date must match
python scripts/art/clean.py public/art art-clean  # tidy every cut-out (below) into a new folder
python scripts/art/gate.py art-clean              # drop the ones that would make a card look bad
# re-frame every cut-out from its original so all cards share one framing (3 workers, then merge)
for i in 0 1 2; do SHARD=$i/3 python scripts/art/reframe.py public/art art/models & done; wait
python scripts/art/merge.py public/art
```

**Which photos.** For each player in the competitions' squad lists: the English Wikipedia article for
"<name> (footballer, born <year>)", then "<name> (footballer)", then "<name>". Only articles whose short
description mentions football count, and disambiguation pages are skipped. If the article has no lead image,
the article's Wikidata item image (P18) is used. Players with no English article are matched on Wikidata by
name **and exact date of birth**, so nobody gets a stranger's face. Finally, other-language Wikipedias, but
only images hosted on Wikimedia Commons. A last check compares every matched article's Wikidata birth date with
the squad's date of birth and drops any photo where they differ. About 30% of the ~3,070 players end up with a photo that passes every check below;
everyone else gets a plain shirt in their club's colours.

**What happens to a photo.** A 1280 px version (a standard Wikimedia size) is downloaded, politely: two workers at most, backing off on HTTP 429, the face is found (OpenCV), and the picture is
cropped to head and upper body (six face-heights tall) at 3:4. The background is removed with `rembg` (u2net_human_seg), and the
result is saved as a 600×800 WebP with transparency, with the height of the top of the head (for the frame
break) recorded.

**Clean-up and quality bar.** `clean.py` hardens the cut-out's edges (background removal leaves see-through
smears), keeps only the piece of the picture that holds the head (dropping stray bits of other people), pulls
the edge in by a pixel to lose the old background's fringe, and scores the face's sharpness. `gate.py` then
drops three kinds of photo: blurry ones (the player was small in the original, so the crop is upscaled),
ones where something touches the top edge (a head cut off flat, or someone standing behind), and ones with a
second face. A card with a bad photo looks worse than a card with a clean shirt, so when in doubt it goes.

**One framing for every card.** `reframe.py` goes back to each original photo, finds the face with YuNet
(`art/models/yunet.onnx`, from opencv_zoo), levels the eyes, and scales it so every face is the same height
(31% of the image) with the eyes on the same line (33% down). Where that framing reaches past the photo's
edge the canvas stays transparent and the body fades out over 70 px, instead of the crop being squeezed to
fit (which is what cut foreheads off tight photos and shrank heads in wide ones). Faces that would need
enlarging more than 1.5x are dropped as too soft. The photo itself is left as it is, no filter: a card has
to look like the player.

**Licences.** Only Wikimedia Commons files are used (no fair-use images). Each image's author and licence
come from the Commons API and are shown on the card and in the card view, with a link to the original and a
note that the background was removed. Under CC BY-SA, the edited cut-outs carry the same licence as their
originals.
