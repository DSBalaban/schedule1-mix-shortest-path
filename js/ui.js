/**
 * DOM wiring: renders controls/results and re-runs the search whenever the
 * selected base product or target-effect list changes. Depends on data.js
 * (game data) and mixing.js (search engine) being loaded first.
 */

let selectedEffects = [];
const baseSelect = document.getElementById('baseSelect');
const addEffect = document.getElementById('addEffect');
const pillsEl = document.getElementById('pills');
const outputEl = document.getElementById('output');

function populateAddEffect(){
  addEffect.innerHTML = '<option value="">+ choose effect…</option>';
  ALL_EFFECTS.forEach(e=>{
    if(selectedEffects.includes(e)) return;
    const o = document.createElement('option'); o.value=e; o.textContent=e;
    addEffect.appendChild(o);
  });
  addEffect.disabled = selectedEffects.length>=8;
}

function renderPills(){
  pillsEl.innerHTML = '';
  selectedEffects.forEach(e=>{
    const p = document.createElement('span'); p.className='pill';
    p.innerHTML = `${e}`;
    const btn = document.createElement('button'); btn.textContent='×';
    btn.onclick = ()=>{ selectedEffects = selectedEffects.filter(x=>x!==e); populateAddEffect(); renderPills(); run(); };
    p.appendChild(btn);
    pillsEl.appendChild(p);
  });
}

addEffect.addEventListener('change', ()=>{
  const v = addEffect.value;
  if(v && !selectedEffects.includes(v) && selectedEffects.length<8){
    selectedEffects.push(v);
    populateAddEffect(); renderPills(); run();
  }
});
baseSelect.addEventListener('change', run);

function effPill(name, isTarget, isNew){
  const cls = ['eff']; if(isTarget) cls.push('target'); if(isNew) cls.push('new');
  return `<span class="${cls.join(' ')}">${name}</span>`;
}

function run(){
  const baseName = baseSelect.value;
  const def = STRAIN_DEFAULTS[baseName];
  const startState = def ? [def] : [];

  if(selectedEffects.length===0){
    outputEl.innerHTML = `<div class="panel" data-label="Result"><div class="why">Pick at least one target effect above.</div></div>`;
    return;
  }

  const result = search(startState, selectedEffects);

  if(!result){
    outputEl.innerHTML = `<div class="panel" data-label="Result"><div class="unobtainable">No combination of ingredients (within the search limits) lands all of these on the same product from ${baseName}. Try removing one target, or start from a different base.</div></div>`;
    return;
  }
  if(result.limitReached){
    outputEl.innerHTML = `<div class="panel" data-label="Result"><div class="unobtainable">Search space got too large before finding a match (this combination may need a long recipe, or may not be jointly reachable). Try fewer target effects.</div></div>`;
    return;
  }

  const steps = result.steps;
  let html = '';

  if(steps.length>0){
    const counts = {};
    steps.forEach(s=>counts[s.ing]=(counts[s.ing]||0)+1);
    html += `<div class="panel" data-label="Shopping list"><div class="shopping">`;
    Object.entries(counts).forEach(([ing,n])=>{
      html += `<span class="chip">${ing}${n>1?' × '+n:''}</span>`;
    });
    html += `</div></div>`;
  }

  html += `<div class="panel" data-label="Mixing sequence">`;
  html += `<div class="stepcount">Minimum <b>${steps.length}</b> ingredient${steps.length===1?'':'s'} to get all ${selectedEffects.length} target effect${selectedEffects.length===1?'':'s'} on one product.</div>`;
  html += `<div class="steps">`;

  html += `<div class="stepcard"><div class="stepline"><span class="stepnum">0</span><span class="stepbase">Start: ${baseName}${def? ' ('+def+')':' (blank)'}</span></div>`;
  html += `<div class="effectset">`;
  if(startState.length===0){ html += `<span class="eff" style="opacity:.5">— no starting effect —</span>`; }
  startState.forEach(e=> html += effPill(e, selectedEffects.includes(e), false));
  html += `</div></div>`;

  steps.forEach((s,idx)=>{
    const added = s.to.filter(e=>!s.from.includes(e));
    const removed = s.from.filter(e=>!s.to.includes(e));
    html += `<div class="stepcard"><div class="stepline"><span class="stepnum">${idx+1}</span><span class="stepadd">+ ${s.ing}</span>`;
    if(removed.length) html += `<span class="stepdelta">(${removed.join(', ')} → ${added.join(', ')||'—'})</span>`;
    html += `</div><div class="effectset">`;
    s.to.forEach(e=> html += effPill(e, selectedEffects.includes(e), added.includes(e)));
    html += `</div></div>`;
  });

  html += `</div></div>`;
  outputEl.innerHTML = html;
}

populateAddEffect();
baseSelect.value = 'OG Kush';
selectedEffects = ['Shrinking'];
populateAddEffect();
renderPills();
run();
