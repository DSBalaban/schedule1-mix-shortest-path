// Tests for js/mixing.js, validated against the in-game recipes in tests/test-recipes.json.
// Run: npm test   (watch mode: node --test --watch tests/test.js)
const { test, suite } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const load = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const src = load('data.js') + '\n' + load('mixing.js');
// The source files are plain <script>-globals, not modules, so build an engine by
// evaluating them. Each call returns a fresh instance with its own exploration cache.
const engine = () =>
  new Function(src + '; return { applyIngredient, search, INGREDIENTS, ALL_EFFECTS };')();

const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-recipes.json'), 'utf8'));
const byName = (n) => recipes.find((r) => r.name === n);
const shared = engine();

const replay = (recipe) => recipe.reduce((s, ing) => shared.applyIngredient(s, ing), []);

suite('fixtures', () => {
  test('all fixture effect and ingredient names exist in game data', () => {
    for (const r of recipes) {
      for (const e of r.effects)
        assert(shared.ALL_EFFECTS.includes(e), `unknown effect "${e}" in ${r.name}`);
      for (const i of r.possibleRecipe)
        assert(shared.INGREDIENTS.includes(i), `unknown ingredient "${i}" in ${r.name}`);
    }
  });
});

suite('game model (applyIngredient)', () => {
  for (const r of recipes) {
    test(`replays in-game recipe: ${r.name} (${r.possibleRecipe.length} steps)`, () => {
      const final = replay(r.possibleRecipe);
      for (const e of r.effects)
        assert(final.includes(e), `missing ${e} — got: ${final.join(', ')}`);
    });
  }

  test('a blocked transform keeps its source effect', () => {
    // Mouth Wash's Explosive→Sedating is blocked by Sedating already being present;
    // Explosive must survive, not be merged away.
    const out = shared.applyIngredient(
      ['Calorie-Dense', 'Explosive', 'Sedating', 'Toxic'],
      'Mouth Wash',
    );
    assert(out.includes('Explosive'), 'Explosive was destroyed by a blocked rule');
    assert(out.includes('Sedating'));
  });

  test('transforms still fire at the 8-effect cap; only the base effect is blocked', () => {
    const capped = [
      'Athletic',
      'Balding',
      'Calming',
      'Energizing',
      'Foggy',
      'Sedating',
      'Sneaky',
      'Toxic',
    ];
    const out = shared.applyIngredient(capped, 'Cuke'); // Toxic→Euphoric fires; base Energizing already present
    assert(out.includes('Euphoric') && !out.includes('Toxic'), 'transform must apply at the cap');
    assert.equal(out.length, 8, 'cap exceeded');
  });

  test('rules fire in alphabetical from-order: Calming→Slippery frees Calming for Foggy→Calming', () => {
    // In-game (Paracetamol, Donut, Donut, Mega Bean, Paracetamol): the last Paracetamol
    // consumes Foggy because Calming→Slippery runs first; reverse order kept Foggy (bug).
    const out = shared.applyIngredient(
      ['Calming', 'Calorie-Dense', 'Explosive', 'Foggy'],
      'Paracetamol',
    );
    assert.deepEqual(out, ['Calming', 'Calorie-Dense', 'Explosive', 'Slippery', 'Sneaky']);
  });

  test('an ingredient with nothing to do is a no-op state', () => {
    const out = shared.applyIngredient(['Sedating'], 'Flu Medicine'); // base already present, no rules match
    assert.deepEqual(out, ['Sedating']);
  });
});

suite('search', () => {
  test('finds a recipe no longer than the in-game one: Banana LeClerc', () => {
    const r = byName('Banana LeClerc');
    const res = shared.search([], r.effects);
    assert(res && res.steps, `search failed: ${JSON.stringify(res)}`);
    assert(
      res.steps.length <= r.possibleRecipe.length,
      `expected ≤${r.possibleRecipe.length} steps, got ${res.steps.length}`,
    );
    for (const e of r.effects) assert(res.finalState.includes(e), `result missing ${e}`);
    // The found recipe must itself replay to a valid product.
    const final = replay(res.steps.map((s) => s.ing));
    for (const e of r.effects)
      assert(final.includes(e), `found recipe does not replay: missing ${e}`);
  });

  test(
    'finds a recipe no longer than the in-game one: Monster Effects',
    { skip: !process.env.SLOW && 'deep exploration (~1min) — run with SLOW=1' },
    () => {
      const r = byName('Monster Effects');
      const res = shared.search([], r.effects);
      assert(res && res.steps, `search failed: ${JSON.stringify(res)}`);
      assert(res.steps.length <= r.possibleRecipe.length);
      for (const e of r.effects) assert(res.finalState.includes(e), `result missing ${e}`);
    },
  );

  test('found recipe replays in-game: Slippery Foggy Explosive', () => {
    // Regression: the pre-fix model returned Paracetamol, Donut, Donut, Mega Bean,
    // Paracetamol here, which in-game yields no Foggy.
    const targets = ['Slippery', 'Foggy', 'Explosive'];
    const res = shared.search([], targets);
    assert(res && res.steps, `search failed: ${JSON.stringify(res)}`);
    const final = replay(res.steps.map((s) => s.ing));
    for (const e of targets) assert(final.includes(e), `found recipe misses ${e}: ${final}`);
  });

  test('zero steps when targets are already on the base', () => {
    const res = shared.search(['Calming'], ['Calming']);
    assert.equal(res.steps.length, 0);
  });

  test('unknown target effect returns null', () => {
    assert.equal(shared.search([], ['Not An Effect']), null);
  });

  test('single-step transform from a base default effect', () => {
    const res = shared.search(['Calming'], ['Anti-gravity']); // Mouth Wash: Calming→Anti-gravity
    assert.equal(res.steps.length, 1);
    assert.equal(res.steps[0].ing, 'Mouth Wash');
  });

  test('incremental cache: growing targets stay minimal and end equal to a cold query', () => {
    const targets = byName('Banana LeClerc').effects;
    const warm = engine(); // simulates the UI flow: one query per added effect
    let prevLen = 0;
    for (let n = 1; n <= targets.length; n++) {
      const res = warm.search([], targets.slice(0, n));
      assert(res && res.steps, `subset search failed at n=${n}`);
      assert(res.steps.length >= prevLen, 'more targets cannot need fewer steps');
      for (const t of targets.slice(0, n)) assert(res.finalState.includes(t));
      prevLen = res.steps.length;
    }
    const cold = engine().search([], targets);
    assert.equal(prevLen, cold.steps.length, 'warm final query disagrees with cold query');
  });

  test('changing the start state invalidates the cache', () => {
    const eng = engine();
    eng.search([], ['Sedating']); // populate cache for the blank base
    const res = eng.search(['Calming'], ['Anti-gravity']);
    assert.equal(res.steps.length, 1);
    assert.equal(res.steps[0].ing, 'Mouth Wash');
  });
});
