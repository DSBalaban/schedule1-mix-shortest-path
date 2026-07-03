# Mixing Pathfinder — Schedule 1

A small client-side tool that finds the **shortest ingredient sequence** to give a
*Schedule 1* product any chosen combination of effects.

## What it does

In *Schedule 1*, products (weed, meth, cocaine, shrooms) can carry up to 8 simultaneous
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

- **Node** = a *state*, i.e. the exact set of effects currently on the product (order
  doesn't matter, no duplicates, capped at 8).
- **Edge** = "add ingredient X", which deterministically transforms one state into
  another (see `applyIngredient` in `js/mixing.js`).

Finding "the fewest ingredients to reach a state containing all target effects" is
exactly the shortest-path problem on this graph, from the start state to the nearest
node that is a superset of the targets. Since every edge (every ingredient add) costs
the same (1 step), plain **breadth-first search (BFS)** is optimal — no need for
Dijkstra or A*, since there's no meaningful edge weight or distance heuristic here.

BFS explores states in strict order of distance from the start, expanding one full
"layer" (all states reachable in *n* ingredients) before moving to layer *n+1*. The
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
