// ================= GUIDE: first-visit tour + one-click demo =================
// Tour: opens on first visit, "? Tour" in the header replays it. Each stop opens its page and highlights the real control.
// Demo: runs Study 3 on 3 simulated models (no keys, no cost), then shows Results. "Exit demo" restores the project you had.

const TOUR = [
  { title: 'Welcome to the LLM Conjoint Lab', body: `This tool finds out what an AI model cares about when it chooses products, then checks whether that predicts what the same model buys in a shop.
<div class="g-flow"><span>1 Conjoint</span>→<span>2 Ranking</span>→<span>3 Locked prediction</span>→<span>4 Storefront</span>→<span>5 Results</span></div>
<b>Conjoint:</b> the AI picks between pairs of products that differ on price, battery life and so on. From thousands of picks we estimate how much each attribute counts for that model.<br>
<b>Storefront:</b> the AI then shops from a page of real products. If its conjoint weights predict its storefront picks, the model behaves consistently.<br><br>
Want to see it work first? The demo uses simulated models, so it needs no API keys and costs nothing.`, demo: true },
  { tab: 'study', el: '[data-key="openai"]', title: 'Start · API keys', body: 'Paste a key for each provider you will use (OpenAI, Anthropic, Google, or one OpenRouter key for everything). <b>Keys stay in this browser</b>: they go only to the AI provider and are never saved into files or exports. Models without a key are skipped.' },
  { tab: 'study', el: '#presetSel', title: '1 · Study', body: 'Pick a built-in study, or build your own: name the product, then add attributes (e.g. price, storage, waterproof yes/no) and the levels each can take. Any product and any attributes work. The tool builds the product pairs from these.' },
  { tab: 'products', el: '#products .card', title: '2 · Products', body: 'The real products the AI ranks and shops from on the storefront page, with their actual specs. Add them by pasting rows, from a link, or by typing.' },
  { tab: 'modules', el: '#moduleCards', title: '3 · Modules', body: 'Switch each part on or off: the conjoint, the ranking task and the storefront. The settings here set how many pairs, rankings and storefront trials each model gets.' },
  { tab: 'models', el: '#modelTable', title: '4 · Models', body: 'Pick the models to test (the top line shows which keys you have entered). Every model gets the exact same design.' },
  { tab: 'prompts', el: '#prompts .card', title: '5 · Preview', body: 'Exactly what each model is sent: the conjoint question, the ranking task and the storefront page. Check the wording here before you spend anything.' },
  { tab: 'run', el: '#launchBtn', title: '6 · Launch', body: '<b>▶ Launch study</b> does the whole run in order:<br><b>1. Quick check:</b> one call per model, so a wrong key or model name is caught before you spend anything.<br><b>2. Validation check:</b> one product is best on everything, so each model should pick it every time.<br><b>3. Pilot:</b> a small run.<br><b>4. Cost check:</b> the pilot projects what the full run will cost, and you confirm.<br><b>5. Full run</b>, then the analysis.<br>The spend cap pauses everything if cost reaches it. If anything stops, press Launch again and it carries on where it left off.' },
  { tab: 'results', el: '#analyseAll', title: '7 · Results', body: `Press <b>Analyse</b>. For each model you get:<br>
<b>Coefficients</b>: what the model prefers and how strongly (e.g. a negative price coefficient means it prefers cheaper).<br>
<b>Relative importance</b>: the share of the decision each attribute accounts for.<br>
<b>First-position bias</b>: whether it favours whichever product it sees first.<br>
<b>Prediction vs storefront</b>: whether its conjoint predicted what it actually picked (ρ near 1 = yes).<br>
<b>Compare models</b>: which preferences hold across every model.` },
  { tab: 'data', el: '#expGo', title: '8 · Export', body: 'Download everything: Excel or CSV for each part, SPSS syntax to rerun the analysis yourself, or a PDF report. Save the project file to share or reload a study later.' },
  { tab: 'verify', el: '#verifyGo', title: '9 · Verify', body: 'Check every result outside this tool. The verification pack holds the raw data, the locked predictions and ready-to-run <b>SPSS, R and Python</b> scripts. They re-fit the conjoint, confirm the prediction was locked before the storefront and was not changed, and recompute the storefront comparison, printing PASS or CHECK for each.' },
  { title: "That's it", body: 'Press <b>? Tour</b> at the top any time to see this again, or <b>▶ Demo</b> to watch a full run on simulated models.', demo: true }
];

let tourI = 0;
function guideCSS() { if (document.getElementById('guideCSS')) return; const st = document.createElement('style'); st.id = 'guideCSS'; st.textContent = `
#gShade{position:fixed;inset:0;z-index:900;background:rgba(20,20,22,.45)}
#gShade.hole{background:transparent}
#gSpot{position:fixed;z-index:901;border-radius:8px;box-shadow:0 0 0 9999px rgba(20,20,22,.45),0 0 0 3px var(--acc,#2f5d50);pointer-events:none;transition:all .2s}
#gCard{position:fixed;z-index:902;width:min(440px,92vw);background:#fff;border-radius:10px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-size:14px;line-height:1.5}
#gCard h3{margin:0 0 8px;font-size:17px}
#gCard .g-row{display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:8px}
#gCard .g-n{color:#888;font-size:12px}
.g-flow{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:10px 0;font-size:12.5px}
.g-flow span{background:#e7efe9;color:#2f5d50;border-radius:99px;padding:3px 9px;font-weight:600}
#gHead{margin-left:auto;display:flex;gap:6px}
header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
#demoBar{position:sticky;top:0;z-index:800;background:#fff4d6;border-bottom:1px solid #e6cf8f;padding:8px 14px;font-size:13.5px;display:flex;gap:12px;align-items:center;justify-content:center}`;
  document.head.appendChild(st); }

function tourShow(i) { guideCSS(); tourEnd(true); tourI = Math.max(0, Math.min(i, TOUR.length - 1)); const t = TOUR[tourI];
  if (t.tab) showTab(t.tab);
  const shade = document.createElement('div'); shade.id = 'gShade'; document.body.appendChild(shade);
  const card = document.createElement('div'); card.id = 'gCard';
  card.innerHTML = `<h3>${t.title}</h3><div>${t.body}</div><div class="g-row"><span class="g-n">${tourI + 1} / ${TOUR.length}</span><span>
    ${t.demo ? '<button class="b sec" id="gDemo">▶ Try the free demo</button> ' : ''}
    ${tourI > 0 ? '<button class="b sec" id="gBack">Back</button> ' : ''}
    <button class="b" id="gNext">${tourI === TOUR.length - 1 ? 'Done' : 'Next'}</button></span></div>
    <div style="text-align:right;margin-top:6px"><a href="#" id="gSkip" style="font-size:12px;color:#888">${tourI === TOUR.length - 1 ? '' : 'Skip the tour'}</a></div>`;
  document.body.appendChild(card);
  const target = t.el && document.querySelector(t.el);
  if (target) { target.scrollIntoView({ block: 'center' });
    setTimeout(() => { const r = target.getBoundingClientRect(), pad = 6, spot = document.createElement('div'); spot.id = 'gSpot';
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
      document.body.appendChild(spot); shade.classList.add('hole');
      const below = r.bottom + 16 + card.offsetHeight < innerHeight, top = below ? r.bottom + 16 : Math.max(12, r.top - card.offsetHeight - 16);
      card.style.top = top + 'px'; card.style.left = Math.max(12, Math.min(r.left, innerWidth - card.offsetWidth - 12)) + 'px'; }, 120); }
  else { card.style.top = '50%'; card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%)'; }
  document.getElementById('gNext').onclick = () => tourI === TOUR.length - 1 ? tourEnd() : tourShow(tourI + 1);
  const back = document.getElementById('gBack'); if (back) back.onclick = () => tourShow(tourI - 1);
  const d = document.getElementById('gDemo'); if (d) d.onclick = () => { tourEnd(); demoStart(); };
  document.getElementById('gSkip').onclick = e => { e.preventDefault(); tourEnd(); };
  shade.onclick = () => tourEnd(); }
function tourEnd(quiet) { ['gShade', 'gSpot', 'gCard'].forEach(id => document.getElementById(id)?.remove()); if (!quiet) { try { localStorage.setItem('conjointLabV5.toured', '1'); } catch (e) {} } }
addEventListener('keydown', e => { if (!document.getElementById('gCard')) return; if (e.key === 'Escape') tourEnd(); if (e.key === 'ArrowRight') document.getElementById('gNext')?.click(); if (e.key === 'ArrowLeft') document.getElementById('gBack')?.click(); });
addEventListener('resize', () => { if (document.getElementById('gCard')) tourShow(tourI); });

// ---------- demo ----------
async function demoStart() {
  if (run.active) return alert('A run is in progress. Pause or stop it before starting the demo.');
  if (!S.demo) await IDB.set('preDemo', JSON.parse(JSON.stringify(S)));
  S.models = []; loadStudy3(); S.models = [];
  [11, 22, 33].forEach((s, i) => addModel('sim', 'sim-' + s, 'Simulated ' + 'ABC'[i]));
  Object.assign(S.settings, { runSize: 'pilot', pilotPairs: 150, pilotRanks: 3, pilotTrials: 60, validationTrials: 10, spendCap: 0 });
  S.projName = 'DEMO – simulated models'; S.demo = true; save(); syncAll(); demoBar();
  showTab('run'); log('Demo: 3 simulated AI models with made-up preferences. No API calls, no cost.');
  await runValidation();
  $('startAll').click(); await new Promise(r => setTimeout(r, 300));
  while (run.active) await new Promise(r => setTimeout(r, 300));
  $('analyseAll').click(); showTab('results'); }
async function demoExit() { const prev = await IDB.get('preDemo'); S = prev ? { ...DEFAULT(), ...prev } : DEFAULT(); delete S.demo;
  await IDB.set('preDemo', null); save(); syncAll(); document.getElementById('demoBar')?.remove(); showTab('study'); }
function demoBar() { if (document.getElementById('demoBar')) return; const b = document.createElement('div'); b.id = 'demoBar';
  b.innerHTML = '<span><b>Demo mode:</b> simulated AI models with made-up preferences, not real AI results.</span><button class="b sec" id="demoExit">Exit demo</button>';
  document.body.insertBefore(b, document.body.firstChild); document.getElementById('demoExit').onclick = demoExit; }

function guideInit() { guideCSS(); const h = document.querySelector('header'); if (h && !document.getElementById('gHead')) { const w = document.createElement('span'); w.id = 'gHead';
    w.innerHTML = '<button class="b sec" id="gTourBtn">? Tour</button><button class="b sec" id="gDemoBtn">▶ Demo</button>'; h.appendChild(w);
    document.getElementById('gTourBtn').onclick = () => tourShow(0); document.getElementById('gDemoBtn').onclick = demoStart; }
  if (S.demo) demoBar();
  let seen = false; try { seen = !!localStorage.getItem('conjointLabV5.toured'); } catch (e) {}
  if (!seen && !S.demo) tourShow(0); }
