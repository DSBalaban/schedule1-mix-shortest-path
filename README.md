# Mixing Pathfinder — Schedule 1

A small client-side tool that finds the **shortest ingredient sequence** to give a
_Schedule 1_ product any chosen combination of effects.

## What it does

In _Schedule 1_, products (weed, meth, cocaine, shrooms) can carry up to 8 simultaneous
"effects" (Calming, Toxic, Bright-eyed, etc.). Mixing in one of 16 ingredients can
transform effects already present and/or add a new one, following a fixed set of rules.

Given:

- a **starting product** (some start with one free effect, others start blank), and
- a set of **target effects** you want on the final product (up to 8),

the app searches the space of all possible mixes and reports the minimum number of
ingredients — and the exact sequence — needed to reach a product carrying every target
effect at once, plus a shopping list of what to buy.

## How the algorithm works

The mixing system is modeled as a graph:

- **Node** = a _state_, i.e. the exact set of effects currently on the product (order
  doesn't matter, no duplicates, capped at 8).
- **Edge** = "add ingredient X", which deterministically transforms one state into
  another (see `applyIngredient` in `js/mixing.js`).

Finding "the fewest ingredients to reach a state containing all target effects" is
exactly the shortest-path problem on this graph, from the start state to the nearest
node that is a superset of the targets. Since every edge (every ingredient add) costs
the same (1 step), plain **breadth-first search (BFS)** is optimal — no need for
Dijkstra or A*, since there's no meaningful edge weight or distance heuristic here.

BFS explores states in strict order of distance from the start, expanding one full
"layer" (all states reachable in _n_ ingredients) before moving to layer _n+1_. The
first time it reaches a state that contains every target effect, that path is
guaranteed to be one of the shortest possible — so the search can stop immediately.

Implementation notes (`js/mixing.js`):

- `stateKey()` canonicalizes an effect set (sorted, joined) so it can be used as a
  de-duplication key in a `Set`, regardless of insertion order.
- `applyIngredient()` encodes the actual game rule: every currently-present effect
  that has a matching transform rule for the new ingredient gets swapped simultaneously,
  then the ingredient's own base effect is added if a slot remains, and nothing happens
  once a product is already at the 8-effect cap.
- `search()` runs the BFS with a queue of `{state, steps}`, where `steps` records the
  full path taken so far. A `visited` set prevents re-expanding any state once reached
  (guaranteed to be via a shortest-or-equal path, by BFS ordering).
- Two safety limits bound the search when a target combination is very hard or
  impossible to reach jointly: `MAX_DEPTH` (10 ingredients) and `MAX_VISITED`
  (150,000 states). Hitting either returns a "give up" result rather than hanging.

### Known limitation

The "simultaneous transform" rule in `applyIngredient()` — multiple matching effects
all transforming at once when a new ingredient is added — is this app's own modeling
assumption for extending the game's (individually verified) single-effect transform
rules to multi-effect products. It has not been independently confirmed against
in-game behavior for every combination, so multi-target results should be treated as
an upper bound and spot-checked in-game.

## Project structure

```
schedule1-mix-pathfinder/
├── index.html       # page markup, loads css/style.css and the three js/ files
├── css/
│   └── style.css     # all visual styling
└── js/
    ├── data.js        # game data: ingredients, starting effects, transform rules
    ├── mixing.js       # pure pathfinding logic (applyIngredient, search) — no DOM
    └── ui.js           # DOM wiring: renders controls/results, re-runs search on input
```

`data.js` is the piece most likely to need edits after a game patch — it's isolated
from logic and rendering so that data updates don't touch algorithm or UI code.
`mixing.js` has no DOM dependency, so it can be tested or reused independently of the
page (e.g. from a console or a test runner) by loading `data.js` first.

Scripts are loaded as plain (non-module) `<script>` tags in dependency order
(`data.js` → `mixing.js` → `ui.js`) — no build step required.

## Sources

- [scheduleonemixer.com/how-mixing-in-schedule-1-works](https://scheduleonemixer.com/how-mixing-in-schedule-1-works) — vector-math reverse-engineering of the mixing system; source of the 114-row transformation table
- [faxagate.com/en/gaming/schedule-1-effects](https://faxagate.com/en/gaming/schedule-1-effects) — per-ingredient effect/transformation breakdown
- [prodigygamers.com/2025/04/18/schedule-1-all-effects-chart-list-each-mixers-result-guide](https://prodigygamers.com/2025/04/18/schedule-1-all-effects-chart-list-each-mixers-result-guide/) — per-ingredient effects chart
- [sportskeeda.com/esports/all-ingredients-schedule-1-their-effects](https://sportskeeda.com/esports/all-ingredients-schedule-1-their-effects) — base/default effect per ingredient
- [steamcommunity.com/sharedfiles/filedetails/?id=3468902915](https://steamcommunity.com/sharedfiles/filedetails/?id=3468902915) — community mixing guide with tested "if X then Y" tables
- [steamcommunity.com/sharedfiles/filedetails/?id=3454740900](https://steamcommunity.com/sharedfiles/filedetails/?id=3454740900) — community mixing guide, confirmed the OG Kush Shrinking recipe independently
- [steamcommunity.com/app/3164500/discussions/1/599648400266251583](https://steamcommunity.com/app/3164500/discussions/1/599648400266251583/) — player discussion thread hunting for a Shrinking recipe
- [gamerant.com/schedule-1-mixing-guide-all-ingredient-effects](https://gamerant.com/schedule-1-mixing-guide-all-ingredient-effects/) — confirmed 34-effect / 16-basic-18-advanced / Lethal-unobtainable framing
