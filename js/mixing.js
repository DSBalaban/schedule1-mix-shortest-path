/**
 * Mixing state search.
 *
 * PROBLEM
 * -------
 * A product is fully described by the *set* of effects currently on it (order doesn't
 * matter, duplicates can't exist, and there's a hard cap of 8 effects). Adding one of the
 * 16 ingredients deterministically transforms that set into a new set, per applyIngredient()
 * below. So the whole mixing system is a directed graph:
 *
 *   node  = an effect set (a "state"), e.g. {"Calming","Energizing"}
 *   edge  = "add ingredient X", labeled with the ingredient, leading to a new state
 *
 * Given a starting state (the product's default effect, or none) and a set of target
 * effects the user wants present simultaneously, search() finds the SHORTEST path
 * (fewest ingredients) from the start node to any node whose effect set is a superset
 * of the targets. This is exactly unweighted shortest-path-in-a-graph, so breadth-first
 * search (BFS) is the right tool: BFS explores nodes in order of distance from the start,
 * so the first time it reaches a state containing all targets, that path is guaranteed
 * minimal.
 *
 * WHY BFS AND NOT E.G. DIJKSTRA/A*
 * ---------------------------------
 * Every edge (every ingredient add) costs exactly 1 step, so there are no edge weights
 * to justify Dijkstra, and there's no admissible heuristic for A* here (an ingredient can
 * just as easily transform an existing target effect away as add a missing one, so
 * "targets matched so far" isn't guaranteed to only improve — it can't be used as a
 * strict distance-to-goal bound). Plain BFS still gives an optimal (fewest-ingredients)
 * answer in that setting.
 *
 * STATE EXPLOSION CONTROL
 * ------------------------
 * The reachable state space is large but not infinite (effect sets are bounded by 8 slots
 * and ~40-ish known effects), so two safety valves keep the search bounded in pathological
 * cases (e.g. impossible target combinations): MAX_DEPTH caps how many ingredients deep
 * the search will look, and MAX_VISITED caps total states explored before giving up.
 *
 * Within those limits, search() still visits states depth-by-depth (preserving BFS
 * optimality — a depth-d match is only returned once no shorter one exists), but *within*
 * each depth it expands the most-promising states first: those already containing more of
 * the target effects. Real target combos are typically reached via an intermediate state
 * that already has most targets, one step before the final ingredient completes the set —
 * so this ordering tends to surface a match early in its depth layer instead of only after
 * grinding through the (usually much larger) irrelevant remainder of that layer, without
 * changing which depth counts as "shortest."
 */

// Canonical string form of an effect set, used as a Set/Map key so two states with the
// same effects in different insertion order are recognized as identical for `visited`.
function stateKey(arr){ return arr.slice().sort().join('|'); }

/**
 * Simulates mixing one ingredient into a product currently holding `effectsArr`.
 *
 * Game rule being modeled: adding an ingredient simultaneously transforms every
 * currently-present effect that has a matching TRANSFORM_MAP rule for that ingredient,
 * then adds the ingredient's own base effect if a slot remains. If the product is
 * already at the 8-effect cap, further ingredients have no effect at all.
 *
 * Note: this "simultaneous transform" behavior is the app's own modeling assumption
 * about how multiple matching effects resolve at once — the footer flags multi-target
 * results as an upper bound to verify in-game, since it isn't independently confirmed.
 */
function applyIngredient(effectsArr, ingredient){
  const cur = new Set(effectsArr);
  if(cur.size >= 8) return effectsArr.slice();
  const next = new Set(cur);
  for(const e of cur){
    const rule = TRANSFORM_MAP[e] && TRANSFORM_MAP[e][ingredient];
    if(rule){ next.delete(e); next.add(rule); }
  }
  const base = BASE_EFFECTS[ingredient];
  if(next.size < 8 && !next.has(base)) next.add(base);
  return Array.from(next).sort();
}

/**
 * Breadth-first search for the shortest ingredient sequence turning `startState` into
 * a state that contains every effect in `targets`.
 *
 * Returns:
 *   {steps: [], finalState}                — targets already satisfied, 0 ingredients needed
 *   {steps: [{ing, from, to}, ...], finalState} — shortest sequence found, in order
 *   {limitReached: true}                    — MAX_VISITED exceeded before a match was found
 *   null                                    — search space (up to MAX_DEPTH) exhausted, no match exists
 *
 * Processes one full depth layer (`frontier`) at a time — `steps` is the full path taken
 * to reach each state from the start, so every state in `frontier` is the same number of
 * ingredients from the start. Because depths are processed in increasing order, and
 * `visited` prevents ever reaching a state via a longer path, the first match found is
 * guaranteed shortest, regardless of the order states are expanded *within* a depth.
 *
 * That within-depth order is not arbitrary, though: each layer is sorted so states already
 * containing more of `targets` are expanded first (see file header). This can only change
 * *which* same-depth match is returned when several exist (all equally valid, since they're
 * the same length) and how many states get visited before a match is found — never whether
 * a shorter match gets missed.
 */
function search(startState, targets){
  if(targets.length===0) return {steps:[], finalState:startState};
  if(targets.every(t=>startState.includes(t))) return {steps:[], finalState:startState};

  const visited = new Set([stateKey(startState)]);
  let frontier = [{state:startState, steps:[]}];
  const MAX_DEPTH = 10, MAX_VISITED = 150000;
  let visitedCount = 1;

  for(let depth=0; depth<MAX_DEPTH && frontier.length>0; depth++){
    const nextFrontier = [];
    for(const {state,steps} of frontier){
      for(const ing of INGREDIENTS){
        const ns = applyIngredient(state, ing);
        const key = stateKey(ns);
        if(visited.has(key)) continue; // already reached this state via an equal-or-shorter path
        visited.add(key);
        visitedCount++;
        if(visitedCount>MAX_VISITED) return {limitReached:true};

        const newSteps = steps.concat([{ing, from:state, to:ns}]);
        if(targets.every(t=>ns.includes(t))) return {steps:newSteps, finalState:ns};
        nextFrontier.push({state:ns, steps:newSteps, matched:targets.filter(t=>ns.includes(t)).length});
      }
    }
    // Most-targets-already-present first, so the next depth's expansion (and its own match
    // check) reaches likely candidates before the layer's irrelevant bulk.
    nextFrontier.sort((a,b)=>b.matched-a.matched);
    frontier = nextFrontier;
  }
  return null;
}
