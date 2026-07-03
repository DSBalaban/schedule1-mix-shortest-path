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
 * of the targets. Every edge costs 1, so breadth-first search gives the minimal answer:
 * the first time BFS reaches a state containing all targets, no shorter path exists.
 *
 * GAME RULES MODELED (per ingredient added)
 * -----------------------------------------
 * 1. Each transform rule [from, ingredient, to] fires only if `from` is on the product
 *    AND `to` is NOT already on it. A blocked rule leaves `from` untouched — it is never
 *    consumed/merged away. (Getting this wrong silently destroys effects: e.g. Mouth Wash
 *    on a product with both Explosive and Sedating must keep Explosive, because
 *    Explosive→Sedating is blocked by Sedating already being present.)
 * 2. All of an ingredient's rules check `from` against the pre-mix snapshot, so one
 *    rule's output can't chain into another rule in the same mix.
 * 3. Transforms fire even when the product is at the 8-effect cap. The cap only blocks
 *    step 4.
 * 4. The ingredient's own base effect is added last, if a slot is free and it isn't
 *    already present.
 *
 * PERFORMANCE
 * -----------
 * States are bitmasks over ALL_EFFECTS (34 effects → two 32-bit words lo/hi, packed into
 * one float64 key = hi*2^32+lo, exact below 2^53). visited doubles as a parent-pointer
 * map for path reconstruction, so frontier entries are just numbers — no per-state arrays
 * or string keys. Within each depth layer, states already containing more target effects
 * are expanded first (bucketed, not sorted — O(n)); this never changes which depth wins,
 * only how fast the winning state surfaces inside its layer. Two safety valves bound
 * pathological queries: MAX_DEPTH and MAX_VISITED.
 */

const EFFECT_IDX = new Map(ALL_EFFECTS.map((e, i) => [e, i]));
const W = 4294967296;          // 2^32: lo-word span of a packed state key
const P = 17179869184;         // 2^34: state-key span inside a parent-map value

// One precomputed rule pack per ingredient: parallel single-bit masks for each
// transform rule (from/to, split into lo/hi words) plus the base effect's bit.
const ING_RULES = INGREDIENTS.map(ing => {
  const pack = { ing, fLo: [], fHi: [], tLo: [], tHi: [], bLo: 0, bHi: 0 };
  const bit = e => { const i = EFFECT_IDX.get(e); return i < 32 ? [(1 << i) >>> 0, 0] : [0, (1 << (i - 32)) >>> 0]; };
  TRANSFORMS.forEach(([f, i, t]) => {
    if (i !== ing) return;
    const [fl, fh] = bit(f), [tl, th] = bit(t);
    pack.fLo.push(fl); pack.fHi.push(fh); pack.tLo.push(tl); pack.tHi.push(th);
  });
  [pack.bLo, pack.bHi] = bit(BASE_EFFECTS[ing]);
  return pack;
});

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function maskOf(effects) {
  let lo = 0, hi = 0;
  for (const e of effects) {
    const i = EFFECT_IDX.get(e);
    if (i < 32) lo = (lo | (1 << i)) >>> 0; else hi = (hi | (1 << (i - 32))) >>> 0;
  }
  return [lo, hi];
}

// ALL_EFFECTS is sorted, so iterating bits in index order yields sorted names.
function maskToNames(lo, hi) {
  const out = [];
  for (let i = 0; i < ALL_EFFECTS.length; i++) {
    if (i < 32 ? (lo >>> i) & 1 : (hi >>> (i - 32)) & 1) out.push(ALL_EFFECTS[i]);
  }
  return out;
}

// Core mix step on a bitmask state; returns the packed key of the resulting state.
function applyMask(lo, hi, pack) {
  let nl = lo, nh = hi;
  const { fLo, fHi, tLo, tHi } = pack;
  for (let k = 0; k < fLo.length; k++) {
    // `from` checked against the pre-mix snapshot (lo/hi), `to` against the evolving state.
    if (((lo & fLo[k]) | (hi & fHi[k])) && !((nl & tLo[k]) | (nh & tHi[k]))) {
      nl = (nl & ~fLo[k]) | tLo[k];
      nh = (nh & ~fHi[k]) | tHi[k];
    }
  }
  nl >>>= 0; nh >>>= 0;
  if (!((nl & pack.bLo) | (nh & pack.bHi)) && popcount(nl) + popcount(nh) < 8) {
    nl = (nl | pack.bLo) >>> 0; nh = (nh | pack.bHi) >>> 0;
  }
  return nh * W + nl;
}

/**
 * Simulates mixing one ingredient into a product currently holding `effectsArr`.
 * Name-based wrapper around applyMask — same semantics the search uses.
 */
function applyIngredient(effectsArr, ingredient) {
  const pack = ING_RULES[INGREDIENTS.indexOf(ingredient)];
  const [lo, hi] = maskOf(effectsArr);
  const key = applyMask(lo, hi, pack);
  return maskToNames(key % W, Math.floor(key / W));
}

/**
 * Breadth-first search for the shortest ingredient sequence turning `startState` into
 * a state that contains every effect in `targets`.
 *
 * Returns:
 *   {steps: [], finalState}                     — targets already satisfied
 *   {steps: [{ing, from, to}, ...], finalState} — shortest sequence, in order
 *   {limitReached: true}                        — MAX_VISITED exceeded before a match
 *   null                                        — reachable space exhausted, no match exists
 */
function search(startState, targets) {
  if (targets.every(t => startState.includes(t))) return { steps: [], finalState: startState };
  if (targets.some(t => !EFFECT_IDX.has(t))) return null;

  const [tLo, tHi] = maskOf(targets);
  const [sLo, sHi] = maskOf(startState);
  const startKey = sHi * W + sLo;

  const MAX_DEPTH = 16, MAX_VISITED = 30000000;
  // visited + parent pointers in one map: value = ingredientIndex * 2^34 + parentKey.
  const parent = new Map([[startKey, -1]]);
  let frontier = [startKey];
  let visitedCount = 1;

  function reconstruct(key) {
    const steps = [];
    for (let k = key, v; (v = parent.get(k)) !== -1; k = v % P) {
      const pk = v % P;
      steps.unshift({
        ing: INGREDIENTS[Math.floor(v / P)],
        from: maskToNames(pk % W, Math.floor(pk / W)),
        to: maskToNames(k % W, Math.floor(k / W)),
      });
    }
    return { steps, finalState: maskToNames(key % W, Math.floor(key / W)) };
  }

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    // Next layer bucketed by how many targets a state already holds (max 8 targets fit
    // on a product), so the most-promising states are expanded first next depth.
    const buckets = [[], [], [], [], [], [], [], [], []];
    for (const key of frontier) {
      const lo = key % W, hi = Math.floor(key / W);
      for (let g = 0; g < ING_RULES.length; g++) {
        const nkey = applyMask(lo, hi, ING_RULES[g]);
        if (nkey === key || parent.has(nkey)) continue;
        parent.set(nkey, g * P + key);
        if (++visitedCount > MAX_VISITED) return { limitReached: true };
        const nl = nkey % W, nh = Math.floor(nkey / W);
        if (((nl & tLo) >>> 0) === tLo && ((nh & tHi) >>> 0) === tHi) return reconstruct(nkey);
        buckets[popcount(nl & tLo) + popcount(nh & tHi)].push(nkey);
      }
    }
    frontier = [];
    for (let m = buckets.length - 1; m >= 0; m--) {
      for (const k of buckets[m]) frontier.push(k);
    }
  }
  return null;
}
