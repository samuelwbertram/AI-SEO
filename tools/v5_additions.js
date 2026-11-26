// ================= v5 additions: Study 3, locked prediction, validation, spend cap, position model =================
const S3_ATTRS = [
  { name: 'Screen size', kind: 'list', levels: ['7 inches', '7.8 inches', '8 inches'], type: 'continuous', isPrice: false, better: '' },
  { name: 'Screen type', kind: 'list', levels: ['E Ink Carta', 'E Ink Carta 1200', 'Color E Ink'], type: 'categorical', isPrice: false, best: '',
    also: { Resolution: { 'E Ink Carta': '300 PPI', 'E Ink Carta 1200': '300 PPI', 'Color E Ink': '300 PPI B&W, 150 PPI color' } } },
  { name: 'Storage', kind: 'list', levels: ['16 GB', '32 GB', '64 GB'], type: 'continuous', isPrice: false, better: 'higher' },
  { name: 'Water resistance', kind: 'list', levels: ['Water-repellent', 'Waterproof (IPX7)', 'Waterproof (IPX8)'], type: 'categorical', isPrice: false, best: 'Waterproof (IPX8)' },
  { name: 'Battery life', kind: 'list', levels: ['Up to 3 weeks', 'Up to 4 weeks', 'Up to 6 weeks', 'Up to 8 weeks', 'Up to 12 weeks'], type: 'continuous', isPrice: false, better: 'higher' },
  { name: 'Weight', kind: 'list', levels: ['190 g', '215 g', '240 g', '265 g', '290 g'], type: 'continuous', isPrice: false, better: 'lower' },
  { name: 'Page buttons', kind: 'list', levels: ['No', 'Yes'], type: 'categorical', isPrice: false, best: 'Yes' },
  { name: 'Stylus support', kind: 'list', levels: ['No', 'Yes'], type: 'categorical', isPrice: false, best: 'Yes' },
  { name: 'Price', kind: 'list', levels: ['$149', '$199', '$249', '$299', '$349'], type: 'continuous', isPrice: true, better: 'lower' }
];
// The 10 real e-readers of the v5/v6 storefront runs (Google Sheet "AI SEO Storefront v4 – Products", tab "E-readers";
// specs from the-ebook-reader.com 7"-8" comparison table, checked 27 Oct 2026). Rating and reviews are held equal.
const S3_VAL = `Name,Brand and model,Screen size,Screen type,Resolution,Storage,Water resistance,Battery life,Weight,Page buttons,Stylus support,Price,Rating,Reviews,Card title
E01,Kindle Paperwhite (2024),7 inches,E Ink Carta,300 PPI,16 GB,Waterproof (IPX8),Up to 12 weeks,211 g,No,No,$159,4.5,1000,E-Reader
E02,Kindle Colorsoft,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 8 weeks,219 g,No,No,$279,4.5,1000,E-Reader
E03,Kobo Libra Colour,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 6 weeks,200 g,Yes,Yes,$219,4.5,1000,E-Reader
E04,Kobo Sage,8 inches,E Ink Carta 1200,300 PPI,32 GB,Waterproof (IPX8),Up to 3 weeks,241 g,Yes,Yes,$269,4.5,1000,E-Reader
E05,Boox Go 7 Color,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",64 GB,Water-repellent,Up to 4 weeks,195 g,Yes,No,$249,4.5,1000,E-Reader
E06,PocketBook InkPad 4,7.8 inches,E Ink Carta 1200,300 PPI,32 GB,Waterproof (IPX8),Up to 4 weeks,265 g,Yes,No,$269,4.5,1000,E-Reader
E07,PocketBook InkPad Color,7.8 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 4 weeks,270 g,Yes,No,$329,4.5,1000,E-Reader
E08,PocketBook Era,7 inches,E Ink Carta 1200,300 PPI,16 GB,Waterproof (IPX8),Up to 4 weeks,228 g,Yes,No,$219,4.5,1000,E-Reader
E09,PocketBook Era Color,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 4 weeks,235 g,Yes,No,$259,4.5,1000,E-Reader
E10,Nook GlowLight 4 Plus,7.8 inches,E Ink Carta,300 PPI,32 GB,Waterproof (IPX7),Up to 4 weeks,285 g,Yes,No,$199,4.5,1000,E-Reader`;
// Starting lineup on the three providers Sam has keys for (OpenAI, Anthropic, Google): 3 models from each.
// pin/pout = list price in US$ per million input/output tokens, used to count spend (direct APIs don't report cost). Edit any time.
const S3_MODELS = [
  { provider: 'openai', model: 'gpt-4o-2024-11-20', label: 'GPT-4o (2024-11-20)', pin: 2.5, pout: 10 },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o mini', pin: 0.15, pout: 0.6 },
  { provider: 'openai', model: 'gpt-6-luna', label: 'GPT-6 Luna', pin: 0.05, pout: 0.25 },
  { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', pin: 0.1, pout: 0.5 },
  { provider: 'anthropic', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', pin: 1, pout: 5 },
  { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', pin: 2, pout: 10 },
  { provider: 'google', model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', pin: 0.1, pout: 0.4 },
  { provider: 'google', model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', pin: 0.25, pout: 1.5 },
  { provider: 'google', model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', pin: 0.3, pout: 2.5 }];
function loadStudy3() {
  S.study = { product: 'e-reader', attrs: JSON.parse(JSON.stringify(S3_ATTRS)), iterations: 500, seed: 20261124, counterbalance: true };
  S.val = { headers: ['Name'], products: [] }; setValFromCSV(S3_VAL, true);
  S.tasks = { ...S.tasks, conjoint: true, ranking: true, rankRuns: 20, store: true, storeTrials: 1000, storeMode: 'image', cols: 5 };
  S.design = E.pairDesign(S.study.attrs, 500, 20261124); S.fits = {};
  S.projName = 'Study 3 – e-readers (conjoint → ACES storefront)';
  if (!S.models.length || confirmV5(`Replace the ${S.models.length} model(s) on page 4 with the Study 3 lineup (3 OpenAI, 3 Claude, 3 Gemini)?`)) S.models = S3_MODELS.map(m => ({ ...m }));
  save(); syncAll(); }

// ---------- one storefront trial, v3 method, on any product set (main run uses v3's own code path) ----------
async function storeTrialV3(u, trial, products, store, ctl, salt) {
  const page = E.shuffle(products, E.rng((+S.study.seed || 1) * 100003 + trial + (salt || 0))), names = products.map(p => p.name), image = S.tasks.storeMode !== 'text';
  const { res, pc, raw2, cut, cost, tin, tout } = await storeAsk(u, image ? E.storefrontImagePrompt(S.study.product) : E.storefrontTextPrompt(S.study.product, page, showHeaders()), image ? drawPage(page) : null, { type: 'store', products: page, image }, ctl, names);
  let mis = null, detail = '';
  if (image && pc.json?.cards) { mis = 0; const notes = []; page.forEach(p => { const c = pc.json.cards.find(x => E.normLevel(x.name) === E.normLevel(p.name)); if (!c) { mis++; notes.push(p.name + ' missing'); return; } showHeaders().slice(1).forEach(h => { const k = Object.keys(c).find(z => E.normLevel(z) === E.normLevel(h)); if (E.normLevel(k ? c[k] : '') !== E.normLevel(p.display[h])) { mis++; notes.push(`${p.name} ${h}: "${k ? c[k] : '—'}"`); } }); }); detail = notes.join('; '); }
  store[trial] = { order: page.map(p => p.name).join(' | '), choice: pc.choice, position: pc.choice ? page.findIndex(p => p.name === pc.choice) + 1 : null, misreads: mis, misread_detail: detail, raw: res.text, raw2, cut, served: res.served, cost, tin, tout, at: new Date().toISOString() };
  return !!pc.choice; }

// ---------- lock the conjoint prediction before the storefront ----------
async function sha256(t) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 'djb2-' + (h >>> 0).toString(16); } }
async function lockPrediction(u) { const R = resOf(u), rows = conjointRows(u), n = rows.filter(r => r.choice).length;
  if (R.lock && R.lock.n === n) return true;
  let fit; try { fit = E.analyseConjoint(rows, S.study.attrs); } catch (e) { log(`${u.label}: conjoint fit failed (${e.message})`); return false; }
  const P = S.val.products, util = P.map(p => E.utility(fit, S.study.attrs, productForPrediction(p))), mx = Math.max(...util), ex = util.map(v => Math.exp(v - mx)), sum = ex.reduce((a, b) => a + b, 0), rk = E.ranks(util, true);
  const predicted = P.map((p, i) => ({ product: p.name, utility: util[i], share: ex[i] / sum, rank: rk[i] }));
  const coefs = fit.coefs.map(c => [c.term, c.B]);
  const payload = JSON.stringify({ model: u.m.model, condition: u.c.label, answers: n, coefs, predicted });
  R.lock = { at: new Date().toISOString(), n, hash: await sha256(payload), predicted, coefs, payload }; R.locks = [...(R.locks || []), { at: R.lock.at, n, hash: R.lock.hash }];
  log(`${u.label}: prediction locked from ${n} answers · sha256 ${R.lock.hash}`); save(); return true; }

// ---------- validation: one product best on every attribute with a clear direction ----------
function validationProducts() { const P = JSON.parse(JSON.stringify(S.val.products)); if (P.length < 2) return {};
  let any = false;
  S.study.attrs.forEach(a => { let best, worst;
    if (a.type === 'continuous' && a.kind === 'list' && (a.better || a.isPrice)) { const dir = a.better || 'lower', L = a.levels.slice().sort((x, y) => E.leadNum(x) - E.leadNum(y)); best = dir === 'higher' ? L[L.length - 1] : L[0]; worst = dir === 'higher' ? L[0] : L[L.length - 1]; }
    else if (a.type === 'categorical' && a.best) { best = a.best; worst = a.levels.find(l => l !== a.best); }
    else { best = worst = P[0].display[a.name]; }
    if (best !== worst) any = true;
    P.forEach((p, i) => { const v = i === 0 ? best : worst; p.display[a.name] = v; if (a.type === 'categorical') { p.level = p.level || {}; p.level[a.name] = v; } Object.entries(a.also || {}).forEach(([c, map]) => { if (map[v] != null) p.display[c] = map[v]; }); }); });
  return any ? { prods: P, dominant: P[0].name } : {}; }
async function runValidation() { if (run.active) return; const U = units().filter(u => u.m.provider !== 'import'); if (!U.length) return log('Add models on page 4.');
  if (!S.tasks.store) return log('Switch on the storefront module (page 3) to run the validation check.');
  const { prods, dominant } = validationProducts(); if (!dominant) return log('Validation needs at least one attribute with a "better" direction.');
  const N = +S.settings.validationTrials || 10;
  log(`Validation check: ${dominant} is best on every attribute with a clear direction; the rest are worst. ${N} storefront trials per model.`);
  run.active = true; run.paused = false; globalStop = false; capWarned = false; $('startAll').disabled = true; $('runValidation').disabled = true; $('pauseAll').disabled = false; $('stopAll').disabled = false;
  U.forEach(u => { const R = resOf(u); if (R.validation && Object.keys(R.validation.trials || {}).length) R.validationHistory = [...(R.validationHistory || []), R.validation]; R.validation = { dominant, trials: {}, at: new Date().toISOString() }; }); renderValidation();
  const tick = setInterval(() => { renderProgress(); renderValidation(); }, 600);
  await Promise.all(U.map(async u => { const R = resOf(u); const ctl = run.ctl[u.key] = { stop: false }, st = run.stats[u.key] = { total: N, done: 0, ok: 0, bad: 0, err: 0, status: 'validation' };
    await workPhase(u, Array.from({ length: N }, (_, i) => ({ id: i + 1 })), st, ctl, t => storeTrialV3(u, t.id, prods, R.validation.trials, ctl, 99991));
    const v = Object.values(R.validation.trials); R.validation.n = v.length; R.validation.hit = v.filter(x => x.choice === dominant).length; st.status = 'validation done';
    log(`${u.label}: picked ${dominant} in ${R.validation.hit}/${R.validation.n} trials ${R.validation.hit === R.validation.n && R.validation.n ? '✓ PASS' : '✕ CHECK before the real run'}`); }));
  clearInterval(tick); run.active = false; $('startAll').disabled = false; $('runValidation').disabled = false; $('pauseAll').disabled = true; $('stopAll').disabled = true; save(); renderProgress(); renderValidation(); }

// ---------- analysis: locked prediction vs storefront, read-back, position model ----------
function acesClogit(rows, P) { const cols = +S.tasks.cols || 5, ids = P.map(p => p.name);
  const sets = rows.filter(x => x.choice && x.order).map(x => ({ chosen: x.choice, alts: x.order.split(' | ').map((id, i) => ({ id, row: Math.floor(i / cols) + 1, col: i % cols + 1 })) }));
  if (sets.length < 10) return null;
  const nRows = Math.max(...sets.flatMap(s => s.alts.map(a => a.row))), chosen = new Set(sets.map(s => s.chosen)), keepIds = ids.filter(i => chosen.has(i));
  if (keepIds.length < 2) return { error: 'Only one product was ever chosen, so there is nothing to compare.', never: ids.filter(i => !chosen.has(i)) };
  // Reference categories as in v6: first chosen product, bottom row, last column. Never-chosen products are dropped (as in ACES).
  const vars = [...keepIds.slice(1).map(i => 'fe_' + i), ...Array.from({ length: nRows - 1 }, (_, r) => 'row_' + (r + 1)), ...Array.from({ length: cols - 1 }, (_, c) => 'col_' + (c + 1))];
  const X = s => s.alts.filter(a => chosen.has(a.id)).map(a => ({ id: a.id, x: vars.map(v => v.startsWith('fe_') ? +(a.id === v.slice(3)) : v.startsWith('row_') ? +(a.row === +v.slice(4)) : +(a.col === +v.slice(4))) }));
  const D = sets.map(s => ({ chosen: s.chosen, alts: X(s) })), k = vars.length; let b = new Array(k).fill(0), ll = -Infinity, H;
  const step = () => { const g = new Array(k).fill(0); H = Array.from({ length: k }, () => new Array(k).fill(0)); let L = 0;
    D.forEach(s => { const eta = s.alts.map(a => a.x.reduce((t, v, j) => t + v * b[j], 0)), mx = Math.max(...eta), ex = eta.map(e => Math.exp(e - mx)), Z = ex.reduce((x, y) => x + y, 0), pr = ex.map(e => e / Z);
      const ci = s.alts.findIndex(a => a.id === s.chosen); L += Math.log(pr[ci]); const xb = new Array(k).fill(0); s.alts.forEach((a, i) => a.x.forEach((v, j) => xb[j] += pr[i] * v));
      s.alts[ci].x.forEach((v, j) => g[j] += v - xb[j]); s.alts.forEach((a, i) => { for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += pr[i] * (a.x[j] - xb[j]) * (a.x[l] - xb[l]); }); });
    return { g, L }; };
  const llAt = bb => D.reduce((L, s) => { const eta = s.alts.map(a => a.x.reduce((t, v, j) => t + v * bb[j], 0)), mx = Math.max(...eta), Z = eta.reduce((z, e) => z + Math.exp(e - mx), 0);
    return L + eta[s.alts.findIndex(a => a.id === s.chosen)] - mx - Math.log(Z); }, 0);
  // Newton-Raphson with step-halving: a full step can overshoot when a product is chosen only once or twice
  for (let it = 0; it < 200; it++) { const { g, L } = step(); const Hi = invMat(H); if (!Hi) return { error: 'Position model could not be estimated (a product or position is perfectly predictive).' };
    const dir = Hi.map(r => r.reduce((t, h, l) => t + h * g[l], 0)); let lam = 1, nb, nl;
    for (let h = 0; h < 40; h++) { nb = b.map((v, j) => v + lam * dir[j]); nl = llAt(nb); if (Number.isFinite(nl) && nl >= L - 1e-12) break; lam /= 2; }
    b = nb; if (Math.abs(nl - L) < 1e-12) { ll = nl; break; } ll = nl; }
  step(); const V = invMat(H), ll0 = D.reduce((t, s) => t + Math.log(1 / s.alts.length), 0);
  const terms = vars.map((v, j) => { const se = V ? Math.sqrt(V[j][j]) : NaN, z = b[j] / se; return { term: v, B: b[j], SE: se, z, p: 2 * (1 - normCdfV5(Math.abs(z))), OR: Math.exp(b[j]) }; });
  return { terms, n: D.length, ll, ll0, r2: 1 - ll / ll0, ref: `${keepIds[0]}, bottom row, last column`, never: ids.filter(i => !chosen.has(i)) }; }
function invMat(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; } }
  return A.map(r => r.slice(n)); }
function normCdfV5(x) { const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2); return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }
function acesAnalyse(u, out, R, P) {
  if (R.lock && out.share) { const pred = P.map(p => (R.lock.predicted.find(x => x.product === p.name) || {}).share ?? 0); out.lockedPred = pred; out.rhoLocked = E.spearman(pred, out.share);
    out.maeLocked = pred.reduce((t, v, i) => t + Math.abs(v - out.share[i]), 0) / pred.length; out.topPred = P[pred.indexOf(Math.max(...pred))].name; out.topObs = P[out.share.indexOf(Math.max(...out.share))].name; }
  else if (R.lock) out.lockedPred = P.map(p => (R.lock.predicted.find(x => x.product === p.name) || {}).share ?? 0);
  out.lock = R.lock || null;
  const all = Object.values(R.store || {});
  if (all.length) { out.aces = true; out.sfTrials = all.length; out.sfValid = all.filter(x => x.choice).length;
    const rc = all.filter(x => x.choice && x.misreads === 0); out.readCorrect = rc.length; out.shareCorrect = P.map(p => rc.length ? rc.filter(x => x.choice === p.name).length / rc.length : 0);
    if (out.lockedPred && rc.length) out.rhoLockedCorrect = E.spearman(out.lockedPred, out.shareCorrect);
    const f = {}; all.forEach(x => (x.misread_detail || '').split('; ').filter(Boolean).forEach(k => f[k] = (f[k] || 0) + 1)); out.misreadFields = f;
    out.clogit = acesClogit(all, P);
    const c = all.reduce((t, x) => t + (x.cost || 0), 0); out.sfCost = c; out.sfCostPer = all.length ? c / all.length : 0; }
  if (R.validation && R.validation.n) out.validation = { dominant: R.validation.dominant, hit: R.validation.hit, n: R.validation.n }; }
function acesResultsHTML(a) { if (!a.lock && !a.aces && !a.validation) return ''; const P = S.val.products; let h = '';
  if (a.validation) h += `<p><b>Validation check:</b> picked the dominant product (${esc(a.validation.dominant)}) in ${a.validation.hit}/${a.validation.n} trials <span class="pill ${a.validation.hit === a.validation.n ? '' : 'warn'}">${a.validation.hit === a.validation.n ? 'pass' : 'check'}</span></p>`;
  if (a.lock) h += `<h3>Locked conjoint prediction vs storefront</h3><p class="hint">Prediction locked ${new Date(a.lock.at).toLocaleString()} from ${a.lock.n} conjoint answers, before any storefront trial. SHA-256 <code>${esc(a.lock.hash)}</code>. Predicted share = multinomial logit on each product's conjoint utility (constant left out).</p>`;
  if (a.aces) h += `<div class="stats">${[['Locked prediction vs storefront (ρ)', a.rhoLocked], ['Same, chosen card read correctly (ρ)', a.rhoLockedCorrect]].map(([k, v]) => `<div class="stat"><b>${v == null || isNaN(v) ? '—' : v.toFixed(2)}</b><span>${k}</span></div>`).join('')}
      <div class="stat"><b>${a.maeLocked == null ? '—' : (100 * a.maeLocked).toFixed(1) + ' pts'}</b><span>mean gap between predicted and actual share</span></div>
      <div class="stat"><b>${a.topPred ? esc(a.topPred) + ' / ' + esc(a.topObs) : '—'}</b><span>top pick: predicted / actual</span></div>
      <div class="stat"><b>${a.sfValid}/${a.sfTrials}</b><span>valid add_to_cart choices</span></div>
      <div class="stat"><b>${a.sfValid ? (100 * (a.sfValid - a.readCorrect) / a.sfValid).toFixed(0) + '%' : '—'}</b><span>choices where a card was misread</span></div>
      <div class="stat"><b>$${(a.sfCostPer || 0).toFixed(4)}</b><span>cost per storefront trial</span></div></div>`;
  if (a.lockedPred) h += `<table><tr><th>Product</th><th class="num">Predicted share (locked)</th>${a.share ? '<th class="num">Storefront share</th><th class="num">Share, read correctly</th>' : ''}</tr>${P.map((p, i) => `<tr><td>${esc(p.name)} <small class="mute">${esc(p.display['Brand and model'] || '')}</small></td><td class="num">${(100 * a.lockedPred[i]).toFixed(1)}%</td>${a.share ? `<td class="num">${(100 * a.share[i]).toFixed(1)}%</td><td class="num">${a.shareCorrect ? (100 * a.shareCorrect[i]).toFixed(1) + '%' : ''}</td>` : ''}</tr>`).join('')}</table>`;
  if (a.misreadFields && Object.keys(a.misreadFields).length) h += `<p class="hint">Misread fields: ${Object.entries(a.misreadFields).map(([k, v]) => esc(k) + ' ' + v).join(' · ')}</p>`;
  if (a.clogit) h += a.clogit.error ? `<p class="hint">${esc(a.clogit.error)}</p>` : `<h3>Conditional logit: product effects + page position</h3><p class="hint">${a.clogit.n} choices · reference: ${esc(a.clogit.ref)} · McFadden pseudo-R² ${fmt(a.clogit.r2)}${a.clogit.never.length ? ' · never chosen (left out): ' + esc(a.clogit.never.join(', ')) : ''}</p><table><tr><th>Term</th><th class="num">B</th><th class="num">S.E.</th><th class="num">z</th><th class="num">Sig.</th><th class="num">Odds ratio</th></tr>${a.clogit.terms.map(t => `<tr class="${t.p < .05 ? 'sig' : ''}"><td>${esc(t.term)}</td><td class="num">${fmt(t.B)}</td><td class="num">${fmt(t.SE)}</td><td class="num">${fmt(t.z, 2)}</td><td class="num">${fmtP(t.p)}</td><td class="num">${fmt(t.OR)}</td></tr>`).join('')}</table>`;
  return h; }

// ---------- settings for v5 ----------
function syncV5() { const d = DEFAULT().settings; Object.keys(d).forEach(k => { if (S.settings[k] === undefined) S.settings[k] = d[k]; });
  ['pilotPairs', 'pilotRanks', 'pilotTrials', 'spendCap', 'validationTrials'].forEach(id => { $(id).value = S.settings[id]; $(id).oninput = e => { S.settings[id] = +e.target.value; save(); }; });
  $('runSize').value = S.settings.runSize; $('runSize').onchange = e => { S.settings.runSize = e.target.value; save(); renderProgress(); };
  $('reasoning').value = S.settings.reasoning ?? ''; $('reasoning').onchange = e => { S.settings.reasoning = e.target.value; save(); };
  $('runValidation').onclick = runValidation; }
setInterval(() => { const el = $('spendLine'); if (!el) return; const pr = projectFull();
  el.textContent = `Spent so far: $${spent().toFixed(3)}${+S.settings.spendCap > 0 ? ` of the $${(+S.settings.spendCap).toFixed(2)} cap` : ''}.` + (pr.tot > 0 ? ` Projected cost of a full run, from the calls so far: about $${pr.tot.toFixed(2)}${pr.missing.length ? ` (not counting ${pr.missing.length} model(s) with no calls yet)` : ''}.` : ''); }, 1500);

// v3's storefront cards were a fixed 290 px wide, so long values ran into the next card. Width now fits the longest line.
function cardWidth(order, heads) { const g = document.createElement('canvas').getContext('2d'); let w = 0;
  order.forEach(p => heads.forEach(h => { g.font = '17px Arial'; const a = g.measureText(h + ': ').width; g.font = 'bold 17px Arial'; w = Math.max(w, a + g.measureText(String(p.display[h] ?? '')).width); }));
  return Math.max(290, Math.ceil(w + 32)); }

function confirmV5(msg) { try { return window.confirm(msg); } catch (e) { return true; } }
// Cost of a call from its tokens when the API doesn't report cost (OpenAI, Anthropic and Google direct)
function costFromTokens(m, inTok, outTok) { if (m.pin == null || m.pout == null || inTok == null) return null; return ((+inTok || 0) * m.pin + (+outTok || 0) * m.pout) / 1e6; }
// Full-run projection from what each model has cost so far, per kind of call
function projectFull() { const z = { conjoint: (S.design ? S.design.length : 0) * (S.study.counterbalance ? 2 : 1), ranking: +S.tasks.rankRuns || 0, store: +S.tasks.storeTrials || 0 }; let tot = 0, missing = [];
  units().filter(u => u.m.provider !== 'import').forEach(u => { const R = resOf(u); let t = 0, ok = true;
    ['conjoint', 'ranking', 'store'].forEach(k => { if (k === 'conjoint' && !S.tasks.conjoint || k === 'ranking' && !S.tasks.ranking || k === 'store' && !S.tasks.store) return; const v = Object.values(R[k] || {}).filter(x => x.cost != null); if (!v.length) { ok = false; return; } t += z[k] * v.reduce((s, x) => s + x.cost, 0) / v.length; });
    if (ok) tot += t; else missing.push(u.label); });
  return { tot, missing }; }
