// ================= v5.4 (b): exports for every view, per model; prices and costs; alerts; pilot banner; validation history =================

// ---------- which runs an export covers: all, or one model ----------
function expUnits() { const sel = $('expModel')?.value || 'all'; return units().filter(u => sel === 'all' || u.key === sel); }
function renderExpModel() { const el = $('expModel'); if (!el) return; const cur = el.value || 'all';
  el.innerHTML = `<option value="all">All models</option>` + units().map(u => `<option value="${esc(u.key)}">${esc(u.label)}</option>`).join(''); el.value = [...el.options].some(o => o.value === cur) ? cur : 'all'; }

// ---------- extra export parts: everything shown on Results and Run ----------
function plainRows() { const A = expUnits().map(u => S.fits[u.key]).filter(Boolean), out = [];
  A.forEach(a => { if (a.fit) { topAttrs(a.fit, 3).forEach((t, i) => { const at = S.study.attrs.find(x => x.name === t.attr); out.push({ Run: a.label, Question: 'What it cares about most', Rank: i + 1, Attribute: t.attr, ImportancePct: +t.pct.toFixed(2), Answer: at ? attrPreference(a.fit, at).text : '' }); });
      out.push({ Run: a.label, Question: 'Does it favour whatever is listed first?', Rank: '', Attribute: '', ImportancePct: '', Answer: `Chose the first-listed product ${(100 * a.fit.firstShare).toFixed(1)}% (constant p ${a.fit.coefs[0].p < .001 ? '< .001' : '= ' + a.fit.coefs[0].p.toFixed(3)})` }); }
    const v = verdictOf(a.rhoStore); if (v) out.push({ Run: a.label, Question: 'Did its conjoint predict what it bought?', Rank: '', Attribute: '', ImportancePct: '', Answer: `${v.word} (rho = ${a.rhoStore.toFixed(3)}; predicted favourite ${a.bestName} picked in ${(100 * a.top1).toFixed(1)}% of ${a.nStore} trials)` }); });
  const W = A.filter(a => a.fit); if (W.length > 1) S.study.attrs.forEach(at => { const prs = W.map(a => attrPreference(a.fit, at)), t = prs.map(p => p.text);
    out.push({ Run: 'All models shown', Question: 'Holds across models?', Rank: '', Attribute: at.name, ImportancePct: '', Answer: prs.every(p => p.sig) && t.every(x => x === t[0]) ? 'Same in every model: ' + t[0] : W.map((a, i) => `${a.label}: ${t[i]}`).join('; ') }); });
  return out; }
function holdsRows() { const W = expUnits().map(u => S.fits[u.key]).filter(a => a && a.fit); if (!W.length) return [];
  return W[0].fit.coefs.map((c0, j) => { const cs = W.map(a => a.fit.coefs[j]), pos = cs.filter(c => c && c.p < .05 && c.B > 0).length, neg = cs.filter(c => c && c.p < .05 && c.B < 0).length, o = { Term: c0.term };
    W.forEach((a, i) => { o[a.label + ' B'] = cs[i]?.B ?? ''; o[a.label + ' p'] = cs[i]?.p ?? ''; }); o.HoldsIn = pos === cs.length ? `+ ${pos}/${cs.length}` : neg === cs.length ? `- ${neg}/${cs.length}` : `${Math.max(pos, neg)}/${cs.length}`; return o; }); }
function similarityRows() { const W = expUnits().map(u => S.fits[u.key]).filter(a => a && a.pred); return W.map(a => Object.fromEntries([['Run', a.label], ...W.map(b => [b.label, +E.spearman(a.pred, b.pred).toFixed(4)])])); }
function positionRows() { const out = []; expUnits().forEach(u => { const a = S.fits[u.key]; if (!a?.posShare) return; a.posShare.forEach((s, k) => out.push({ Run: u.label, Position: k + 1, SharePct: +(100 * s).toFixed(2), EvenSplitPct: +(100 / a.posShare.length).toFixed(2) })); }); return out; }
function clogitRows() { const out = []; expUnits().forEach(u => { const c = S.fits[u.key]?.clogit; if (!c) return; if (c.error) { out.push({ Run: u.label, Term: '', Note: c.error }); return; }
  c.terms.forEach(t => out.push({ Run: u.label, Term: t.term, B: t.B, SE: t.SE, z: t.z, p: t.p, OddsRatio: t.OR, Trials: c.n, PseudoR2: c.r2, Reference: c.ref, NeverChosen: (c.never || []).join(' | ') })); }); return out; }
function validationSummaryRows() { const out = []; expUnits().filter(u => u.m.provider !== 'import').forEach(u => { const R = resOf(u); [...(R.validationHistory || []), ...(R.validation && !R.validation.archived ? [R.validation] : [])].forEach(V => { const T = Object.values(V.trials || {});
  out.push({ Run: u.label, CheckedAt: V.at || '', BestProduct: V.dominant, Trials: T.length, PickedBest: T.filter(t => t.choice === V.dominant).length, PickedOther: T.filter(t => t.choice && t.choice !== V.dominant).length, NoReadableChoice: T.filter(t => !t.choice && !t.cut).length, CutOff: T.filter(t => !t.choice && t.cut).length, Result: T.length && T.every(t => t.choice === V.dominant) ? 'PASS' : 'CHECK' }); }); }); return out; }

// ---------- prices per model: costs from saved token counts ----------
function priced(m) { return m.provider === 'sim' || m.provider === 'import' || m.provider === 'openrouter' || (m.pin != null && m.pout != null && m.pin !== '' && m.pout !== ''); }
function recost(m) { if (m.provider === 'openrouter' || m.provider === 'sim') return; units().filter(u => u.m === m).forEach(u => { const R = resOf(u);
  ['conjoint', 'ranking', 'store'].forEach(k => Object.values(R[k] || {}).forEach(x => { if (x.tin != null) x.cost = costFromTokens(m, x.tin, x.tout); }));
  [...(R.validationHistory || []), R.validation].filter(Boolean).forEach(V => Object.values(V.trials || {}).forEach(x => { if (x.tin != null) x.cost = costFromTokens(m, x.tin, x.tout); })); }); }
function noTokenCalls(m) { let n = 0; units().filter(u => u.m === m).forEach(u => { const R = resOf(u); ['conjoint', 'ranking', 'store'].forEach(k => Object.values(R[k] || {}).forEach(x => { if (x.tin == null && x.cost == null) n++; })); }); return n; }
function renderPrices() { const tbl = $('modelTable')?.querySelector('table'); if (!tbl || tbl.dataset.priced) return; tbl.dataset.priced = 1;
  tbl.rows[0].insertCell(4).outerHTML = '<th class="num">US$ per 1M tokens in / out <span class="info" data-tip="List price from the provider\'s pricing page. OpenAI, Anthropic and Google do not report cost, so the Lab counts tokens × these prices. Leave blank and spend is not counted for that model. Changing a price re-costs every call already made that saved its token counts.">i</span></th>';
  S.models.forEach((m, i) => { const row = tbl.rows[i + 1]; if (!row) return; const c = row.insertCell(4); c.className = 'num';
    c.innerHTML = m.provider === 'openrouter' ? '<span class="hint">reported by OpenRouter</span>' : m.provider === 'sim' || m.provider === 'import' ? '' :
      `<input data-pin="${i}" type="number" min="0" step="0.01" style="width:70px" value="${m.pin ?? ''}"> / <input data-pout="${i}" type="number" min="0" step="0.01" style="width:70px" value="${m.pout ?? ''}">${priced(m) ? '' : ' <span class="pill warn">no price: spend not counted</span>'}`; });
  tbl.querySelectorAll('[data-pin],[data-pout]').forEach(inp => inp.onchange = () => { const m = S.models[+(inp.dataset.pin ?? inp.dataset.pout)], v = inp.value === '' ? null : +inp.value;
    if (inp.dataset.pin != null) m.pin = v; else m.pout = v; recost(m); save(); renderModels(); renderRun?.(); const miss = noTokenCalls(m); if (miss) log(`${m.label}: ${miss} earlier calls saved no token counts, so their cost can't be worked out.`); }); }
function priceWarning() { const miss = S.models.filter(m => !priced(m)); return miss.length ? `<div class="msg err">No price set for ${miss.map(m => esc(m.label)).join(', ')}, so their spend is not counted and the spend cap can't protect you. Add prices on page 4.</div>` : ''; }

// ---------- alerts: sound, browser notification, tab title ----------
const baseTitle = document.title;
function alertDone(title, body) { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); [0, .18].forEach((t, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = i ? 880 : 660; g.gain.setValueAtTime(.18, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + .25); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .3); }); } catch (e) {}
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch (e) {}
  document.title = '✓ ' + title + ' – ' + baseTitle; }
function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
window.addEventListener('focus', () => { if (document.title !== baseTitle) setTimeout(() => { document.title = baseTitle; }, 4000); });

// ---------- after a run: clear banner (pilot complete → check Results → full run) ----------
function runBanner(kind) { const el = $('runBanner'); if (!el) return; if (!kind) { el.innerHTML = ''; return; }
  const U = units().filter(u => u.m.provider !== 'import'), calls = U.reduce((t, u) => { const R = resOf(u); return t + ['conjoint', 'ranking', 'store'].reduce((s, k) => s + Object.keys(R[k] || {}).length, 0); }, 0);
  el.innerHTML = kind === 'pilot' ? `<div class="banner ok"><b>✓ Pilot complete</b> (${calls} calls so far across ${U.length} model${U.length === 1 ? '' : 's'}, $${spent().toFixed(2)} spent).<br>1) Check the <a href="#" data-go="results">Results page</a>: press Analyse and look at the summary. 2) When it looks right, press <b>▶ Launch full run</b>. The full run carries on from where the pilot stopped.<div class="row" style="margin-top:8px"><button class="b sec" data-go="results">Go to Results</button><button class="b" id="fullGo">▶ Launch full run</button></div></div>`
    : kind === 'full' ? `<div class="banner ok"><b>✓ Full run complete</b> (${calls} calls, $${spent().toFixed(2)} spent). Go to <a href="#" data-go="results">Results</a> and press Analyse, then Export or Verify.</div>`
    : `<div class="banner">■ Run stopped (${calls} calls so far). Press Start / resume or ▶ Launch study to carry on.</div>`;
  el.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); showTab(a.dataset.go); });
  if ($('fullGo')) $('fullGo').onclick = () => { S.settings.runSize = 'full'; syncV5?.(); save(); runBanner(null); $('startAll').click(); }; }

// ---------- Start / resume: validation first for any model that has not passed; banner and alert at the end ----------
function needsValidation() { return S.tasks.store && S.val.products.length > 1 ? units().filter(u => u.m.provider !== 'import' && u.m.provider !== 'sim').filter(u => { const V = resOf(u).validation, T = Object.values(V?.trials || {}); return !T.length || !T.every(t => t.choice === V.dominant); }) : []; }
function wrapStart() { const btn = $('startAll'), orig = btn.onclick; if (!orig || btn.dataset.wrapped) return; btn.dataset.wrapped = 1;
  btn.onclick = async (...a) => { if (run.active) return; askNotify(); runBanner(null);
    if (!launching && needsValidation().length) { log(`Validation check first for: ${needsValidation().map(u => u.label).join(', ')}.`); await runValidation(); showValidationOutcome();
      const bad = needsValidation(); if (bad.length && !confirmV5(`${bad.map(u => `${u.label}: ${resOf(u).validation?.hit ?? 0}/${resOf(u).validation?.n ?? 0}`).join('\n')}\n\nThese models did not pick the best product every time in the validation check. Each answer, and why it missed, is in the Validation check panel below the run table (Cancel to look first).\n\nCarry on with the run anyway?`)) return log('■ Run not started. See the Validation check panel.'); }
    const size = S.settings.runSize; await orig.apply(btn, a);
    if (globalStop) { runBanner('stopped'); alertDone('Run stopped', 'The run was stopped.'); return; }
    runBanner(size === 'pilot' ? 'pilot' : 'full'); alertDone(size === 'pilot' ? 'Pilot complete' : 'Full run complete', size === 'pilot' ? 'Check Results, then launch the full run.' : 'Go to Results and press Analyse.'); }; }
function showValidationOutcome() { const U = units().filter(u => u.m.provider !== 'import'), ok = U.filter(u => { const V = resOf(u).validation, T = Object.values(V?.trials || {}); return T.length && T.every(t => t.choice === V.dominant); });
  alertDone('Validation check done', `${ok.length}/${U.length} models passed.`); $('valPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

function initV54b() {
  const parts = $('expParts'); if (parts && !$('expModel')) parts.insertAdjacentHTML('beforebegin', '<div class="row" style="margin-top:10px"><label>Models <select id="expModel"></select></label><span class="hint">Export every model together, or one model on its own.</span></div>');
  renderExpModel(); const _st = showTab; showTab = function (t) { _st(t); if (t === 'data') renderExpModel(); };
  const mp = $('modelProgress'); if (mp && !$('runBanner')) mp.insertAdjacentHTML('beforebegin', '<div id="runBanner"></div>');
  wrapStart(); const _rm = renderModels; renderModels = function () { _rm(); renderPrices(); }; renderPrices();
  const _rr = renderRun; renderRun = function () { _rr(); const pw = $('priceWarn') || (() => { $('runPlan')?.insertAdjacentHTML('afterend', '<div id="priceWarn"></div>'); return $('priceWarn'); })(); if (pw) pw.innerHTML = priceWarning(); };
  const st = document.createElement('style'); st.textContent = `.banner{border:1px solid #d8d5ce;border-radius:10px;padding:12px 14px;margin:10px 0;background:#fafaf7}.banner.ok{background:#e8f4ed;border-color:#b9dcc8}`; document.head.appendChild(st); }

// ---------- products found online: code names so the AI never sees the brand; no links kept ----------
function codeNames(list) { if (!S.val.headers.includes('Brand and model')) S.val.headers.push('Brand and model');
  let k = 1; const next = () => { let n; do { n = 'P' + String(k++).padStart(2, '0'); } while (S.val.products.some(x => x.name === n)); return n; };
  return list.map(p => ({ name: next(), display: { ...(p.display || {}), 'Brand and model': p.name } })); }

// ---------- product predictions vs actual: storefront picks, share and rank from every storefront trial of the run ----------
// (pilot and full trials are one set: the full run carries on from the pilot; demo and validation trials are never included)
function productRows(u, a) { const P = S.val.products; if (!a) return [];
  const picks = a.share ? a.share.map(s => Math.round(s * a.nStore)) : null, sRank = a.share ? E.ranks(a.share, true) : null;
  return P.map((p, i) => ({ Run: u.label, Product: p.name, BrandAndModel: p.display?.['Brand and model'] ?? '',
    PredictedUtility: a.pred?.[i] ?? '', PredictedShareLockedPct: a.lockedPred ? +(100 * a.lockedPred[i]).toFixed(2) : '', PredictedRank: a.predRank?.[i] ?? '',
    StorefrontPicks: picks ? picks[i] : '', StorefrontTrials: a.nStore ?? '', StorefrontSharePct: a.share ? +(100 * a.share[i]).toFixed(2) : '', StorefrontRank: sRank ? sRank[i] : '',
    RankMatches: sRank && a.predRank ? (sRank[i] === a.predRank[i] ? 1 : 0) : '', RankGap: sRank && a.predRank ? +(sRank[i] - a.predRank[i]).toFixed(1) : '',
    RankingTask_MeanRank: a.avgRank?.[i] ?? '', RankingTask_RankedFirst: a.firstCount?.[i] ?? '', RankingTask_Runs: a.nRank ?? '' })); }

// ---------- "Did the prediction work?": predicted rank vs actual storefront rank over every storefront trial ----------
function predCheck(a) { if (!a?.pred || !a?.share || !a.nStore) return null; const P = S.val.products, K = P.length;
  const pr = E.ranks(a.pred, true), sr = E.ranks(a.share, true), picks = a.share.map(s => Math.round(s * a.nStore));
  const rows = P.map((p, i) => ({ product: p.name, brand: p.display?.['Brand and model'] || '', pred: pr[i], actual: sr[i], picks: picks[i], match: pr[i] === sr[i], near: Math.abs(pr[i] - sr[i]) <= 1 })).sort((x, y) => x.pred - y.pred);
  const topPred = rows[0], topActual = rows.slice().sort((x, y) => x.actual - y.actual)[0], lastPred = rows[rows.length - 1];
  const top3p = new Set(rows.filter(r => r.pred <= 3).map(r => r.product)), top3a = rows.filter(r => r.actual <= 3).map(r => r.product);
  let pear = null; if (a.lockedPred) { const x = a.lockedPred, y = a.share, mx = x.reduce((s, v) => s + v, 0) / K, my = y.reduce((s, v) => s + v, 0) / K; const c = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0), vx = x.reduce((s, v) => s + (v - mx) ** 2, 0), vy = y.reduce((s, v) => s + (v - my) ** 2, 0); pear = vx && vy ? c / Math.sqrt(vx * vy) : null; }
  return { rows, K, trials: a.nStore, exact: rows.filter(r => r.match).length, near: rows.filter(r => r.near).length, topHit: topPred.picks === Math.max(...rows.map(r => r.picks)), topPred, topActual,
    top3: top3a.filter(p => top3p.has(p)).length, lastHit: lastPred.picks === Math.min(...rows.map(r => r.picks)), lastPred, rho: a.rhoStore, pear }; }
function predCheckHTML(a) { const c = predCheck(a); if (!c) return '';
  const yn = b => b ? '<b class="ok">✓ yes</b>' : '<b class="no">✕ no</b>';
  return `<div class="sumq">Did the prediction work? Predicted rank vs actual storefront rank (all ${c.trials} storefront trials)</div>
    <ul class="sumlist"><li>Predicted favourite ${esc(c.topPred.product)} was the most picked: ${yn(c.topHit)}${c.topHit ? '' : ` (most picked: ${esc(c.topActual.product)})`}</li>
      <li>Predicted top 3 in the actual top 3: <b>${c.top3} of 3</b></li>
      <li>Exact rank matches: <b>${c.exact} of ${c.K}</b> products · within one place: <b>${c.near} of ${c.K}</b></li>
      <li>Predicted last (${esc(c.lastPred.product)}) was picked least (ties count): ${yn(c.lastHit)}</li>
      <li>Rank match over all products (Spearman ρ): <b>${c.rho == null ? '—' : c.rho.toFixed(2)}</b>${c.pear != null ? ` · predicted vs actual share (Pearson r): <b>${c.pear.toFixed(2)}</b>` : ''}</li></ul>
    <table class="predcheck"><tr><th>Product</th><th class="num">Predicted rank</th><th class="num">Actual rank</th><th class="num">Storefront picks</th><th></th></tr>${c.rows.map(r => `<tr><td>${esc(r.product)}${r.brand ? ' <span class="hint">' + esc(r.brand) + '</span>' : ''}</td><td class="num">${r.pred}</td><td class="num">${r.actual}</td><td class="num">${r.picks} of ${c.trials}</td><td>${r.match ? '✓ exact' : r.near ? '≈ within 1' : ''}</td></tr>`).join('')}</table>
    <p class="hint">Actual rank = rank by number of storefront picks (ties share the average rank). Products picked by the AI only a handful of times swap places by chance, so the top of the table counts most.</p>`; }
function predCheckRows() { const out = []; expUnits().forEach(u => { const c = predCheck(S.fits[u.key]); if (!c) return;
  out.push({ Run: u.label, Row: 'Summary', StorefrontTrials: c.trials, PredictedFavourite: c.topPred.product, MostPicked: c.topActual.product, FavouriteWasMostPicked: c.topHit ? 1 : 0, Top3Overlap: c.top3, ExactRankMatches: c.exact, WithinOneRank: c.near, Products: c.K, PredictedLast: c.lastPred.product, PredictedLastWasLeastPicked: c.lastHit ? 1 : 0, SpearmanRho: c.rho, PearsonShare: c.pear ?? '' });
  c.rows.forEach(r => out.push({ Run: u.label, Row: 'Product', Product: r.product, BrandAndModel: r.brand, PredictedRank: r.pred, ActualStorefrontRank: r.actual, StorefrontPicks: r.picks, StorefrontTrials: c.trials, ExactMatch: r.match ? 1 : 0, WithinOne: r.near ? 1 : 0 })); }); return out; }
