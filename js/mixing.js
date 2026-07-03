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
 * to justify Dijkstra, and there's no cheap admissible heuristic for A* here (effect
 * sets don't have an obvious "distance to goal" metric). Plain BFS already gives an
 * optimal answer in that setting.
 *
 * STATE EXPLOSION CONTROL
 * ------------------------
 * The reachable state space is large but not infinite (effect sets are bounded by 8 slots
 * and ~40-ish known effects), so two safety valves keep the search bounded in pathological
 * cases (e.g. impossible target combinations): MAX_DEPTH caps how many ingredients deep
 * the search will look, and MAX_VISITED caps total states explored before giving up.
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
 * The queue holds {state, steps} pairs, where `steps` is the full path taken to reach
 * `state` from the start. Because BFS visits states in non-decreasing distance order, and
 * `visited` prevents ever revisiting a state via a longer path, the first path found to a
 * satisfying state is a shortest one.
 */
function search(startState, targets){
  if(targets.length===0) return {steps:[], finalState:startState};
  if(targets.every(t=>startState.includes(t))) return {steps:[], finalState:startState};

  const visited = new Set([stateKey(startState)]);
  const queue = [{state:startState, steps:[]}];
  let qi=0; // read index; queue only grows, so this avoids O(n) Array.shift() per pop
  const MAX_DEPTH = 10, MAX_VISITED = 150000;

  while(qi<queue.length){
    const {state,steps} = queue[qi++];
    if(steps.length>=MAX_DEPTH) continue;

    for(const ing of INGREDIENTS){
      const ns = applyIngredient(state, ing);
      const key = stateKey(ns);
      if(visited.has(key)) continue; // already reached this state via an equal-or-shorter path
      visited.add(key);
      if(visited.size>MAX_VISITED) return {limitReached:true};

      const newSteps = steps.concat([{ing, from:state, to:ns}]);
      if(targets.every(t=>ns.includes(t))) return {steps:newSteps, finalState:ns};
      queue.push({state:ns, steps:newSteps});
    }
  }
  return null;
}
