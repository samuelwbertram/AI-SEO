// ================= v5.5: position-controlled storefront test =================
// Does the locked conjoint prediction still predict storefront choice once page position is held constant?
// One conditional logit: locked utility + top-row and column indicators, on the trials run AFTER the lock.
// Two robustness checks: position-balanced choice shares, and trials where the predicted favourite was not top-left.
// Fixed rules only, no AI. Same input gives the same output.

function clogitFit(D, vars) { // D: [{ chosen: index, x: [[...], ...] }] — one row of x per product on the page
  const k = vars.length; let b = new Array(k).fill(0), H;
  const eval_ = bb => { const g = new Array(k).fill(0), h = Array.from({ length: k }, () => new Array(k).fill(0)); let L = 0;
    D.forEach(s => { const eta = s.x.map(r => r.reduce((t, v, j) => t + v * bb[j], 0)), mx = Math.max(...eta), ex = eta.map(e => Math.exp(e - mx)), Z = ex.reduce((a, c) => a + c, 0), pr = ex.map(e => e / Z);
      L += Math.log(pr[s.chosen]); const xb = new Array(k).fill(0); s.x.forEach((r, i) => r.forEach((v, j) => xb[j] += pr[i] * v));
      s.x[s.chosen].forEach((v, j) => g[j] += v - xb[j]); s.x.forEach((r, i) => { for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) h[j][l] += pr[i] * (r[j] - xb[j]) * (r[l] - xb[l]); }); });
    return { g, h, L }; };
  let cur = eval_(b);
  for (let it = 0; it < 200; it++) { const Hi = invMat(cur.h); if (!Hi) return { error: 'The position-controlled model could not be estimated (a term is perfectly predictive).' };
    const dir = Hi.map(r => r.reduce((t, hv, l) => t + hv * cur.g[l], 0)); let lam = 1, nb, nx;
    for (let s = 0; s < 40; s++) { nb = b.map((v, j) => v + lam * dir[j]); nx = eval_(nb); if (Number.isFinite(nx.L) && nx.L >= cur.L - 1e-12) break; lam /= 2; }
    const done = Math.abs(nx.L - cur.L) < 1e-10; b = nb; cur = nx; if (done) break; }
  H = cur.h; const V = invMat(H), ll0 = D.reduce((t, s) => t + Math.log(1 / s.x.length), 0);
  const terms = vars.map((v, j) => { const se = V ? Math.sqrt(V[j][j]) : NaN, z = b[j] / se; return { term: v, B: b[j], SE: se, z, p: 2 * (1 - normCdfV5(Math.abs(z))), OR: Math.exp(b[j]) }; });
  return { terms, b, ll: cur.L, ll0, r2: 1 - cur.L / ll0, n: D.length }; }

function posControl(rows, P, lock) {
  if (!lock || !lock.predicted) return null; const cols = +S.tasks.cols || 5;
  const U = Object.fromEntries(lock.predicted.map(x => [x.product, x.utility]));
  if (P.some(p => typeof U[p.name] !== 'number')) return { error: 'The locked prediction has no utility for every product, so the position-controlled test needs a new lock.' };
  const valid = rows.filter(x => x.choice && x.order), after = valid.filter(x => !x.at || x.at > lock.at), pre = valid.length - after.length;
  if (after.length < 20) return { error: `Only ${after.length} storefront trials ran after the prediction was locked; the position-controlled test needs at least 20.`, pre };
  const pages = after.map(x => { const ids = x.order.split(' | '); return { ids, chosen: ids.indexOf(x.choice), alts: ids.map((id, i) => ({ id, row: Math.floor(i / cols) + 1, col: i % cols + 1 })) }; }).filter(p => p.chosen >= 0);
  const nRows = Math.max(...pages.flatMap(p => p.alts.map(a => a.row)));
  const posVars = [...Array.from({ length: nRows - 1 }, (_, r) => 'row_' + (r + 1)), ...Array.from({ length: cols - 1 }, (_, c) => 'col_' + (c + 1))];
  const posX = a => posVars.map(v => v.startsWith('row_') ? +(a.row === +v.slice(4)) : +(a.col === +v.slice(4)));
  const base = clogitFit(pages.map(p => ({ chosen: p.chosen, x: p.alts.map(a => [U[a.id]]) })), ['Locked utility']);
  const full = clogitFit(pages.map(p => ({ chosen: p.chosen, x: p.alts.map(a => [U[a.id], ...posX(a)]) })), ['Locked utility', ...posVars]);
  if (base.error || full.error) return { error: base.error || full.error, pre };
  const hit = bb => pages.filter(p => { const s = p.alts.map(a => [U[a.id], ...posX(a)].reduce((t, v, j) => t + v * (bb[j] || 0), 0)); return s.indexOf(Math.max(...s)) === p.chosen; }).length / pages.length;
  const hitBase = hit([1]), hitFull = hit(full.b);
  // Position-balanced share: a product's choice rate in each page slot it appeared in, averaged over slots
  const cell = {}; pages.forEach(p => p.alts.forEach((a, i) => { const k = a.id + '|' + (i + 1); cell[k] = cell[k] || [0, 0]; cell[k][1]++; if (i === p.chosen) cell[k][0]++; }));
  const balanced = P.map(pr => { const r = Object.entries(cell).filter(([k]) => k.split('|')[0] === pr.name).map(([, v]) => v[0] / v[1]); return r.length ? r.reduce((a, c) => a + c, 0) / r.length : 0; });
  const util = P.map(p => U[p.name]), fav = P[util.indexOf(Math.max(...util))].name;
  const away = pages.filter(p => p.ids[0] !== fav), awayShare = P.map(pr => away.length ? away.filter(p => p.ids[p.chosen] === pr.name).length / away.length : 0);
  const tl = pages.filter(p => p.ids[0] === fav);
  return { n: pages.length, pre, base, full, hitBase, hitFull, balanced, rhoBalanced: E.spearman(util, balanced), fav,
    favTopLeft: { n: tl.length, share: tl.length ? tl.filter(p => p.ids[p.chosen] === fav).length / tl.length : null },
    favAway: { n: away.length, share: away.length ? away.filter(p => p.ids[p.chosen] === fav).length / away.length : null, rho: E.spearman(util, awayShare) },
    ref: 'bottom row, last column' }; }

function posTermLabel(t) { return t === 'Locked utility' ? 'Locked conjoint utility' : t.startsWith('row_') ? `Row ${t.slice(4)} (vs bottom row)` : t.startsWith('col_') ? `Column ${t.slice(4)} (vs last column)` : t; }

function posControlSummaryHTML(a) { const c = a.posctl; if (!c) return ''; if (c.error) return `<div class="sumq">Does it still predict once page position is controlled for?</div><p class="hint">${esc(c.error)}</p>`;
  const u = c.full.terms[0], ok = u.p < SIG && u.B > 0;
  return `<div class="sumq">Does it still predict once page position is controlled for?</div><p><span class="verdict ${ok ? 'ok' : 'no'}">${ok ? 'Yes' : 'No'}.</span> Holding page position constant, each extra point of locked conjoint utility multiplied the odds of being bought by ${u.OR.toFixed(2)} (${pTxt(u.p)}; ${c.n} trials after the lock). With position added, the model picks the actual choice in ${(100 * c.hitFull).toFixed(0)}% of trials (conjoint alone: ${(100 * c.hitBase).toFixed(0)}%; chance ${(100 / S.val.products.length).toFixed(0)}%).</p>
    <p class="hint">Checks: position-balanced shares match the prediction at ρ = ${c.rhoBalanced.toFixed(2)}. When the predicted favourite ${esc(c.fav)} was not top-left, it was still bought in ${c.favAway.share == null ? '—' : (100 * c.favAway.share).toFixed(0) + '%'} of ${c.favAway.n} trials${c.favTopLeft.n ? ` (top-left: ${(100 * c.favTopLeft.share).toFixed(0)}% of ${c.favTopLeft.n})` : ''}.${c.pre ? ` ${c.pre} trial(s) run before the lock are left out.` : ''}</p>`; }

function posControlTableHTML(a) { const c = a.posctl; if (!c || c.error) return '';
  const tr = (m, lab) => m.terms.map((t, i) => `<tr class="${t.p < .05 ? 'sig' : ''}">${i === 0 ? `<td rowspan="${m.terms.length}">${lab}</td>` : ''}<td>${esc(posTermLabel(t.term))}</td><td class="num">${fmt(t.B)}</td><td class="num">${fmt(t.SE)}</td><td class="num">${fmt(t.z, 2)}</td><td class="num">${fmtP(t.p)}</td><td class="num">${fmt(t.OR)}</td></tr>`).join('');
  return `<h3>Position-controlled test: locked prediction + page position</h3><p class="hint">Conditional logit on the ${c.n} storefront trials run after the lock${c.pre ? ` (${c.pre} earlier trial(s) left out)` : ''}. Reference: ${c.ref}. McFadden pseudo-R²: conjoint alone ${fmt(c.base.r2)}, with position ${fmt(c.full.r2)}. Picks the actual choice: ${(100 * c.hitBase).toFixed(1)}% → ${(100 * c.hitFull).toFixed(1)}%.</p>
    <table><tr><th>Model</th><th>Term</th><th class="num">B</th><th class="num">S.E.</th><th class="num">z</th><th class="num">Sig.</th><th class="num">Odds ratio</th></tr>${tr(c.base, 'Conjoint only')}${tr(c.full, 'Conjoint + position')}</table>
    <table><tr><th>Product</th><th class="num">Locked utility</th><th class="num">Position-balanced share</th></tr>${S.val.products.map((p, i) => `<tr><td>${esc(p.name)}</td><td class="num">${fmt(a.lock.predicted.find(x => x.product === p.name)?.utility)}</td><td class="num">${(100 * c.balanced[i]).toFixed(1)}%</td></tr>`).join('')}</table>
    <p class="hint">Position-balanced share = the product's pick rate in each page slot it appeared in, averaged over slots (ρ with the prediction = ${fmt(c.rhoBalanced)}). Predicted favourite ${esc(c.fav)}: bought in ${c.favTopLeft.n ? (100 * c.favTopLeft.share).toFixed(1) + '% of ' + c.favTopLeft.n + ' top-left trials' : 'no top-left trials'} and ${c.favAway.share == null ? '—' : (100 * c.favAway.share).toFixed(1) + '%'} of the ${c.favAway.n} others (ρ on those trials = ${fmt(c.favAway.rho)}).</p>`; }

function posControlRows() { const out = []; expUnits().forEach(u => { const a = S.fits[u.key], c = a?.posctl; if (!c) return; if (c.error) { out.push({ Run: u.label, Model: '', Term: '', Note: c.error }); return; }
  [['Conjoint only', c.base], ['Conjoint + position', c.full]].forEach(([lab, m]) => m.terms.forEach(t => out.push({ Run: u.label, Model: lab, Term: posTermLabel(t.term), B: t.B, SE: t.SE, z: t.z, p: t.p, OddsRatio: t.OR, PseudoR2: m.r2, HitRatePct: +(100 * (lab === 'Conjoint only' ? c.hitBase : c.hitFull)).toFixed(2), TrialsAfterLock: c.n, TrialsBeforeLockLeftOut: c.pre })));
  S.val.products.forEach((p, i) => out.push({ Run: u.label, Model: 'Check: position-balanced share', Term: p.name, B: '', SE: '', z: '', p: '', OddsRatio: '', PseudoR2: '', HitRatePct: +(100 * c.balanced[i]).toFixed(2), TrialsAfterLock: c.n, TrialsBeforeLockLeftOut: c.pre, Note: i === 0 ? `rho with prediction = ${c.rhoBalanced.toFixed(4)}` : '' }));
  out.push({ Run: u.label, Model: 'Check: favourite not top-left', Term: c.fav, B: '', SE: '', z: '', p: '', OddsRatio: '', PseudoR2: '', HitRatePct: c.favAway.share == null ? '' : +(100 * c.favAway.share).toFixed(2), TrialsAfterLock: c.favAway.n, TrialsBeforeLockLeftOut: c.pre, Note: `top-left: ${c.favTopLeft.n ? (100 * c.favTopLeft.share).toFixed(2) + '% of ' + c.favTopLeft.n : 'none'}; rho on non-top-left trials = ${c.favAway.rho == null ? '' : c.favAway.rho.toFixed(4)}` }); }); return out; }

(function initPosControl() {
  const _aa = acesAnalyse; acesAnalyse = function (u, out, R, P) { _aa(u, out, R, P); const all = Object.values(R.store || {}); if (all.length && R.lock) out.posctl = posControl(all, P, R.lock); };
  const _ah = acesResultsHTML; acesResultsHTML = function (a) { return _ah(a) + posControlTableHTML(a); };
  if (typeof modelSummaryHTML === 'function') { const _ms = modelSummaryHTML; modelSummaryHTML = function (a) { const h = _ms(a), add = posControlSummaryHTML(a); if (!add) return h; const i = h.lastIndexOf('<p class="hint">Separate ranking task'); return i > 0 ? h.slice(0, i) + add + h.slice(i) : h.replace(/<\/div>$/, add + '</div>'); }; }
})();
