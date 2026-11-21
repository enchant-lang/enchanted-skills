---
name: brand-stage
description: Turn brand-development material (a copy notebook, personas, a customer journey, worry tables, a brand process) into an EDN entity model loaded into an in-memory datom db, and present it as a slide-first stage — three.js scenes driven from Beam Lisp compiled to JavaScript, CARI-style layouts — where gaps are computed from the model and drawn as empty places. Use when Othman asks to model a brand, a customer-experience framework or a journey as data, to present brand work to a room, or to find what a brand's journey is missing.
---

# brand-stage

A brand is mostly prose when it reaches you: a notebook, cards, two tables.
Read as data it is a small graph — a promise held by a few pillars, fears it
answers, people who walk a journey, the questions they ask at each step, the
worries an ad must answer, the assets each moment needs. `brand-stage` makes
that graph explicit (EDN → datom), then presents it so a room understands the
shape of the brand before reading a sentence, and sees the holes.

Kit: `kit/` (Beam Lisp). Design guidelines: `references/design-guidelines.bl.org`.
Worked example: `~/company/brand-development/knowledger-brand/` (Knowledger,
from Amine's Copy Notebook).

## 1. Model the brand as EDN

A model folder holds `index.edn` (name, schema file, tx files in load order),
`schema.edn` (one entry per attribute) and tx files (vectors of entity maps).

- Every entity has exactly one `:<kind>/id` keyword (`:db.unique/identity`).
- Refer to other entities by lookup ref: `[:persona/id :karim]`. The loader
  turns those into tempids and transacts the whole model in one transaction
  (datom refuses lookup refs in entity position and needs `:db/id` on maps).
- Mark provenance on any entity with `:fact/basis` — `:stated` (in the
  source), `:inferred` (your reading), `:assumed` (an estimate made to draw
  it). The stage draws the three differently; never let an estimate look
  like a fact.
- Keep the customer's own words verbatim, in their language.
- Model what a full customer-experience framework expects even where the
  source is silent: phases after the source stops (`:phase/scope :beyond`),
  dimensions nothing fills yet (`:dimension` with no `:dimension/attr`),
  assets the journey asks for but nobody has made (`:asset/status :missing`).
  Those empty slots are what make gaps visible.

Start a new model from the Knowledger schema with the MCP tool
`brand_new_model`, or copy the folder.

## 2. Write the deck

`stage.bl.org` next to the model: `#+title`, `#+subtitle`, `#+model: model`,
then one top-level heading per slide with a property drawer:

```org
* From first sight to a booked meeting
:PROPERTIES:
:LAYOUT: journey
:KICKER: the emotion journey
:SAY: doubt is highest early
:NAMESAKE: Copy Notebook — « From first sight to a booked meeting »
:END:
Speaker notes: paragraphs here open from the slide's kicker bar.
```

Layouts: `title words fears pillars people journey presence worries
framework process gaps`. `:SAY:` is the dozen words shown at rest; everything
else lives in the specimen sheet (click any mark). Gaps are never written in
the deck — `stage.project/gaps` computes them.

## 3. Serve it

```sh
cd ~/projects/enchanted-skills/brand-stage/kit
bl --cold js build stage.client.main -p src --out web/out     # after client changes (~1–3 min)
work serve NAME --http auto --cwd ~/projects/enchanted-skills/brand-stage/kit --ready-timeout 300 \
  -- /etc/profiles/per-user/othman/bin/bl serve serve.bl -- /abs/path/stage.bl.org
```

Deck and EDN edits need no restart (the db is rebuilt when their bytes
change); kit code changes need `work restart NAME`. `GET /api/model.edn`
returns `{:schema … :tx […]}` — enough to spin up the same datom db anywhere.

Keys: `← →`/space, `o` gallery, `n` notes, `t` night archive, `esc`.

## 4. Check it in a real browser

```sh
work run --timeout 1500 --memory 3G -- bl --cold run \
  -p ~/projects/beam-lisp/optional/browser-port/bl shoot.bl -- URL /tmp/stage-shots [dark]
```

Walks every slide at wall (1920×1080), laptop and phone (390×844), writes
PNGs, `report.edn` and a contact sheet `index.html`, and fails on page
errors, horizontal scroll or content spilling off-screen. Look at the
screenshots yourself before claiming a slide works.

## 5. Ask the model questions (MCP)

```sh
claude mcp add brand-stage -- bl run -p ~/projects/enchanted-skills/brand-stage/kit/src \
  ~/projects/enchanted-skills/brand-stage/kit/mcp.bl
```

Tools: `brand_model_check`, `brand_gaps`, `brand_coverage`, `brand_entity`,
`brand_query` (read-only Datalog as EDN; datom has no `(not …)` — use
`[(missing? $ ?e :attr)]` or a set difference), `brand_new_model`.

## Interop notes (Beam Lisp → JS)

- Client namespaces are `(ns ^:js …)`; `js/THREE.Mesh.` constructs,
  `(.add g m)` calls, `(.-x (.-position m))` reads, `#js {}` is shallow,
  `bl->js` / `js->bl` convert deeply. A BL collection passed raw to JS throws.
- There is no ES `import` from Beam Lisp: `web/index.html` imports three.js,
  sets `globalThis.THREE`, then imports `out/ns/stage.client.main.mjs`.
- `defonce` and `vector` (as a value) do not resolve in JS builds; use `def`
  and `(fn [i x] [i x])`.
- Labels are HTML pinned to 3D points (projected each frame), so text stays
  crisp, themeable and clickable; the scene never computes a figure the
  specimen sheet cannot show.
