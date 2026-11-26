// ================= v5.4: plain-English results summary =================
// Fixed rules only: every sentence below is filled in from numbers the analysis already computed.
// The same data always gives the same words. No AI is used anywhere in this file.
const VERDICT_STRONG = 0.70, VERDICT_PARTLY = 0.40;   // Spearman rho cut-offs approved by Sam, 26 Nov 2026
const SIG = 0.05;
function verdictOf(rho) { if (rho == null || isNaN(rho)) return null;
  return rho >= VERDICT_STRONG ? { word: 'Yes, strongly', cls: 'ok' } : rho >= VERDICT_PARTLY ? { word: 'Partly', cls: 'mid' } : { word: 'No', cls: 'no' }; }
function productLabel(name) { const p = S.val.products.find(x => x.name === name); const brand = p?.display?.['Brand and model']; return brand ? `${name} (${brand})` : name; }

// What one model prefers on one attribute, in words. Uses the fitted coefficients: continuous = sign of B on the
// difference; categorical = the level with the highest effect (the reference level counts as 0).
function attrPreference(fit, attr) {
  const feats = E.features(S.study.attrs), cs = fit.coefs.slice(1), mine = feats.map((f, j) => ({ f, c: cs[j] })).filter(x => x.f.attr === attr.name);
  if (!mine.length) return { text: 'no estimate', sig: false };
  if (attr.type !== 'categorical') { const c = mine[0].c; if (!c || c.p >= SIG) return { text: 'no clear direction', sig: false };
    return { text: attr.isPrice ? (c.B < 0 ? 'prefers a lower price' : 'prefers a higher price') : `prefers ${c.B > 0 ? 'higher' : 'lower'}`, sig: true, dir: c.B > 0 ? 1 : -1 }; }
  const ref = attr.levels.find(l => !mine.some(x => x.f.level === l));
  const opts = [{ level: ref, B: 0, p: 0 }, ...mine.map(x => ({ level: x.f.level, B: x.c.B, p: x.c.p }))];
  const best = opts.reduce((a, b) => (b.B > a.B ? b : a));
  // clear favourite: a non-reference level significantly above the reference, or the reference with every other level significantly below it
  const clear = best.level === ref ? mine.every(x => x.c.p < SIG && x.c.B < 0) : best.p < SIG && best.B > 0;
  if (clear) return { text: `prefers ${best.level}`, sig: true, best: best.level };
  const worse = mine.filter(x => x.c.p < SIG && x.c.B < 0).map(x => x.f.level);   // no clear favourite, but some levels clearly worse than the reference
  return worse.length ? { text: `avoids ${worse.join(' and ')} (no clear favourite)`, sig: false } : { text: 'no clear preference', sig: false }; }
const pTxt = p => p < .001 ? 'p < .001' : 'p = ' + p.toFixed(3).replace(/^0/, '');

function topAttrs(fit, n) { return fit.importance.map((x, i) => ({ ...x, i })).sort((a, b) => b.pct - a.pct || a.i - b.i).slice(0, n); }

function modelSummaryHTML(a) {
  const P = S.val.products, rows = [];
  if (a.fit) { const f = a.fit, top = topAttrs(f, 3);
    rows.push(`<div class="sumq">What it cares about most</div><ol class="sumlist">${top.map(t => { const at = S.study.attrs.find(x => x.name === t.attr); const pr = at ? attrPreference(f, at) : { text: '' };
      return `<li><b>${esc(t.attr)}</b> (${t.pct.toFixed(0)}% importance): ${esc(pr.text)}</li>`; }).join('')}</ol>`);
    const fs = f.firstShare, c0 = f.coefs[0];
    rows.push(`<div class="sumq">Does it favour whatever is listed first?</div><p>In the conjoint it chose the first-listed product ${(100 * fs).toFixed(0)}% of the time (50% = no lean). ${c0.p < SIG ? `That lean is real (${pTxt(c0.p)}).` : `That is within chance (${pTxt(c0.p)}).`}${a.posShare ? ` In the storefront it picked the product in the first position ${(100 * a.posShare[0]).toFixed(0)}% of the time (an even split is ${(100 / P.length).toFixed(0)}%).` : ''}</p>`); }
  else if (a.fitError) rows.push(`<p class="msg err">The conjoint could not be estimated: ${esc(a.fitError)}</p>`);
  const v = verdictOf(a.rhoStore);
  if (v) rows.push(`<div class="sumq">Did its conjoint predict what it bought?</div><p><span class="verdict ${v.cls}">${v.word}.</span> The ranking predicted from its conjoint matched its storefront picks at ρ = ${a.rhoStore.toFixed(2)}.${a.top1 != null ? ` Its predicted favourite, ${esc(productLabel(a.bestName))}, was picked in ${(100 * a.top1).toFixed(0)}% of ${a.nStore} storefront trials (chance = ${(100 / P.length).toFixed(0)}%).` : ''}</p>`);
  else if (a.fit) rows.push(`<div class="sumq">Did its conjoint predict what it bought?</div><p class="hint">No storefront trials yet for this model.</p>`);
  if (typeof predCheckHTML === 'function') rows.push(predCheckHTML(a));
  const vr = verdictOf(a.rhoRank);
  if (vr) rows.push(`<p class="hint">Separate ranking task (the AI ranks all products at once, "Rotman bot"): the predicted order matched those rankings at ρ = ${a.rhoRank.toFixed(2)} (${vr.word.toLowerCase()}).</p>`);
  const notes = [];
  if (a.nRows != null && a.nValid != null && a.nRows > a.nValid) notes.push(`${a.nRows - a.nValid} unclear conjoint answers were left out`);
  if (a.misreadRate) notes.push(`${(100 * a.misreadRate).toFixed(0)}% of storefront trials had a misread card`);
  if (a.fit?.separation) notes.push('some estimates are extreme, so read its full table with care');
  if (notes.length) rows.push(`<p class="hint">Note: ${notes.join('; ')}.</p>`);
  return `<div class="sumcard"><h3>${esc(a.label)}</h3>${rows.join('')}</div>`; }

function acrossHTML(A) { const W = A.filter(a => a.fit); if (W.length < 2) return '';
  const agree = [], split = [], unclear = [];
  S.study.attrs.forEach(at => { const prs = W.map(a => attrPreference(a.fit, at)), texts = prs.map(p => p.text);
    if (prs.every(p => p.sig) && texts.every(t => t === texts[0])) agree.push(`<li><b>${esc(at.name)}</b>: every model ${esc(texts[0])}</li>`);
    else if (prs.filter(p => p.sig).length >= 2 && new Set(prs.filter(p => p.sig).map(p => p.text)).size > 1) split.push(`<li><b>${esc(at.name)}</b>: ${W.map((a, i) => `${esc(a.label)} ${esc(texts[i])}`).join('; ')}</li>`);
    else unclear.push(at.name); });
  const mean = S.study.attrs.map((at, i) => ({ attr: at.name, i, m: W.reduce((s, a) => s + ((a.fit.importance.find(x => x.attr === at.name) || { pct: 0 }).pct), 0) / W.length })).sort((x, y) => y.m - x.m || x.i - y.i);
  let sim = '';
  if (W.every(a => a.pred)) { const rs = []; W.forEach((a, i) => W.forEach((b, j) => { if (j > i) rs.push(E.spearman(a.pred, b.pred)); })); const m = rs.reduce((s, x) => s + x, 0) / rs.length, v = verdictOf(m);
    sim = `<p>Do the models rank the products the same way? <span class="verdict ${v.cls}">${v.word}.</span> Their predicted product orders match at an average ρ = ${m.toFixed(2)} across ${rs.length} model pairs.</p>`; }
  return `<div class="sumcard wide"><h3>Which preferences hold across models? (${W.length} models)</h3>
    <div class="sumq">Same preference in every model</div>${agree.length ? `<ul class="sumlist">${agree.join('')}</ul>` : '<p class="hint">None: no attribute has the same clear preference in every model.</p>'}
    ${split.length ? `<div class="sumq">Models disagree</div><ul class="sumlist">${split.join('')}</ul>` : ''}
    ${unclear.length ? `<p class="hint">Mixed or unclear in at least one model: ${unclear.map(esc).join(', ')}.</p>` : ''}
    <div class="sumq">Most important on average</div><p>${mean.slice(0, 3).map(x => `${esc(x.attr)} (${x.m.toFixed(0)}%)`).join(', then ')}.</p>${sim}</div>`; }

function summaryHTML(A, title) { if (!A.length) return '';
  return `<div class="card summary"><h2>${esc(title)}</h2><p class="hint">Plain-English summary, written from the numbers below by fixed rules (no AI). “Clear” means p &lt; .05. Verdicts use the Spearman match ρ: .70 or more = Yes, strongly; .40 to .69 = Partly; below .40 = No.</p>
    ${acrossHTML(A)}<div class="sumgrid">${A.map(modelSummaryHTML).join('')}</div></div>`; }
function fullTables(inner, label) { return `<details class="fulltables"><summary>${esc(label || 'Show full tables (coefficients, importance, predictions)')}</summary>${inner}</details>`; }
(() => { const st = document.createElement('style'); st.textContent = `
  .summary h3{margin:0 0 6px} .sumgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px;margin-top:12px}
  .sumcard{border:1px solid var(--line,#ddd);border-radius:10px;padding:12px 14px;background:var(--bg2,#fafaf7)} .sumcard.wide{margin-top:8px}
  .sumq{font-weight:600;margin:10px 0 4px} .sumlist{margin:0 0 4px 18px;padding:0} .sumlist li{margin:2px 0}
  .predcheck{margin-top:6px;width:100%} .predcheck td:last-child{white-space:nowrap} b.ok{color:#1d5b3c} b.no{color:#8a2a20}
  .verdict{display:inline-block;font-weight:700;padding:1px 8px;border-radius:999px;margin-right:6px}
  .verdict.ok{background:#d9efe3;color:#1d5b3c} .verdict.mid{background:#fbefcf;color:#7a5a00} .verdict.no{background:#f6d9d6;color:#8a2a20}
  details.fulltables{margin:8px 0 16px} details.fulltables>summary{cursor:pointer;font-weight:600;padding:10px 14px;border:1px solid var(--line,#ddd);border-radius:10px;background:#fff;list-style:none}
  details.fulltables>summary::before{content:'▸ '} details.fulltables[open]>summary::before{content:'▾ '} details.fulltables[open]>summary{margin-bottom:12px}`; document.head.appendChild(st); })();
