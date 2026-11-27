// ================= v5.5: Shopper brief module =================
// A shopper brief is a condition (page 4) whose text, written the way a shopper would ask, goes before every conjoint and
// ranking prompt (and, if ticked, the storefront instruction). A condition with no brief is the baseline. For each model
// the tool compares each brief with that model's baseline and answers three questions:
//   Q1  By how much does the brief move relative importance (and the raw weights)?
//   Q2  Do the attributes the brief did not mention shrink in proportion, or are they reshuffled?
//   Q3  Does the brief's own conjoint predict what the model recommends (ranking task; optional storefront) better than the baseline conjoint?
// Fixed rules only, no AI: same data, same numbers and words.

const BRIEF_TYPES = [['multi', 'Several attributes'], ['one', 'One attribute'], ['price', 'Price or value only'], ['offlist', 'Mentions something not in the study']];
const BRIEF_EXAMPLES = [ // e-reader versions of the team's example prompts (27 Nov 2026)
  { label: 'Brief: screen, battery, budget', brief: "Can you recommend a good new e-reader? I'm looking for something with a great screen and a long battery life for reading every day, with a budget of around $200.", type: 'multi', targets: ['Screen type', 'Battery life', 'Price'] },
  { label: 'Brief: waterproof and light', brief: 'Any e-readers that are waterproof and light enough to hold in one hand?', type: 'multi', targets: ['Water resistance', 'Weight'] },
  { label: 'Brief: storage and battery', brief: 'Find me the best everyday e-reader with lots of storage and good battery life.', type: 'multi', targets: ['Storage', 'Battery life'] },
  { label: 'Brief: colour screen', brief: 'Recommend a colour e-reader.', type: 'one', targets: ['Screen type'] },
  { label: 'Brief: page buttons', brief: 'I need an e-reader with page-turn buttons.', type: 'one', targets: ['Page buttons'] },
  { label: 'Brief: under $250', brief: 'Can you offer some recommendations for e-readers under $250?', type: 'price', targets: ['Price'] },
  { label: 'Brief: best for the price', brief: 'Recommend the best e-reader for the price.', type: 'price', targets: ['Price'] },
  { label: 'Brief: pink', brief: 'I am looking for a new e-reader. And I want it to be pink.', type: 'offlist', targets: [] } ];

const hasBrief = c => !!(c && c.brief && String(c.brief).trim());
function briefPrefixText(u, type = 'conjoint') { const c = u?.c; if (!hasBrief(c)) return ''; if (type === 'store' && !c.briefStore) return ''; return String(c.brief).trim() + '\n\n'; }
function briefTargets(c) { const names = S.study.attrs.map(a => a.name); return (c.briefTargets || []).filter(t => names.includes(t)); }

// ---------- the brief goes before the prompt; never during the validation check ----------
function briefFor(u, simTask) { const c = u?.c; if (!hasBrief(c) || !simTask) return null; if (run?.stats?.[u.key]?.status === 'validation') return null;
  const ty = simTask.type; if (ty !== 'conjoint' && ty !== 'ranking' && !(ty === 'store' && c.briefStore)) return null; return { text: String(c.brief).trim(), targets: briefTargets(c) }; }

// ---------- analysis helpers ----------
function lnGammaB(z) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const c of g) s += c / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function pChiSqB(x, df) { if (!(x > 0)) return 1; const a = df / 2, z = x / 2, gln = lnGammaB(a);
  if (z < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= z / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return Math.max(0, 1 - sum * Math.exp(-z + a * Math.log(z) - gln)); }
  let b = z + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return Math.min(1, Math.exp(-z + a * Math.log(z) - gln) * h); }
function wilcoxonB(d) { const x = d.filter(v => Number.isFinite(v) && Math.abs(v) > 1e-12), n = x.length; if (n < 5) return { n, W: null, z: null, p: null };
  const r = E.ranks(x.map(Math.abs), false), W = x.reduce((s, v, i) => s + (v > 0 ? r[i] : 0), 0), mean = n * (n + 1) / 4;
  const cnt = {}; r.forEach(v => cnt[v] = (cnt[v] || 0) + 1); const tie = Object.values(cnt).reduce((s, t) => s + (t ** 3 - t), 0) / 48, sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tie);
  const z = sd ? (W - mean) / sd : 0; return { n, W, z, p: 2 * (1 - normCdfV5(Math.abs(z))) }; }
function conjXY(u) { const X = [], y = []; conjointRows(u).forEach(r => { if (r.choice !== 'first' && r.choice !== 'second') return; const a = E.encodeProduct(r.p1, S.study.attrs), b = E.encodeProduct(r.p2, S.study.attrs); if (a.some(isNaN) || b.some(isNaN)) return; X.push(a.map((v, j) => v - b[j])); y.push(r.choice === 'first' ? 1 : 0); }); return { X, y }; }
const llOf = fit => -fit.m2LL / 2;

// Q2 test: the weights the brief did not target are all multiplied by ONE common factor (lambda), against each one free.
function proportionalTest(base, brief, fBase, fBrief, targetIdx) { const k = base.X[0]?.length || 0, T = targetIdx, N = [...Array(k).keys()].filter(j => !T.includes(j));
  if (N.length < 2) return null; const y = [...base.y, ...brief.y], names = Array.from({ length: 2 + k + T.length }, (_, i) => 'v' + i);
  const ll = lam => { const X = [...base.X.map(x => [1, 0, ...x, ...T.map(() => 0)]), ...brief.X.map(x => [0, 1, ...x.map((v, j) => T.includes(j) ? 0 : lam * v), ...T.map(j => x[j])])]; try { return llOf(E.logit(X, y, names)); } catch (e) { return -Infinity; } };
  let lo = Math.log(0.02), hi = Math.log(50); const gr = (Math.sqrt(5) - 1) / 2; let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = ll(Math.exp(c)), fd = ll(Math.exp(d));
  for (let i = 0; i < 36; i++) { if (fc > fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = ll(Math.exp(c)); } else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = ll(Math.exp(d)); } }
  const lam = Math.exp((lo + hi) / 2), llR = ll(lam), llF = llOf(fBase) + llOf(fBrief), LR = Math.max(0, 2 * (llF - llR)), df = N.length - 1;
  return { lambda: lam, LR, df, p: pChiSqB(LR, df), nTerms: N.length }; }

function sfPagesB(rows, lockAt) { const cols = +S.tasks.cols || 5; return rows.filter(x => x.choice && x.order && (!lockAt || !x.at || x.at > lockAt)).map(x => { const ids = x.order.split(' | '); return { ids, chosen: ids.indexOf(x.choice), alts: ids.map((id, i) => ({ id, row: Math.floor(i / cols) + 1, col: i % cols + 1 })) }; }).filter(p => p.chosen >= 0); }
function storeCompareB(R, predBrief, predBase) { const pages = sfPagesB(Object.values(R.store || {}), R.lock?.at); if (pages.length < 20) return null; const P = S.val.products, idx = Object.fromEntries(P.map((p, i) => [p.name, i]));
  const nRows = Math.max(...pages.flatMap(p => p.alts.map(a => a.row))), cols = +S.tasks.cols || 5, pv = [...Array.from({ length: nRows - 1 }, (_, r) => 'row_' + (r + 1)), ...Array.from({ length: cols - 1 }, (_, c) => 'col_' + (c + 1))];
  const px = a => pv.map(v => v.startsWith('row_') ? +(a.row === +v.slice(4)) : +(a.col === +v.slice(4)));
  const one = pred => { const m = clogitFit(pages.map(p => ({ chosen: p.chosen, x: p.alts.map(a => [pred[idx[a.id]], ...px(a)]) })), ['Utility', ...pv]); if (m.error) return m;
    const hit = pages.filter(p => { const s = p.alts.map(a => [pred[idx[a.id]], ...px(a)].reduce((t, v, j) => t + v * m.b[j], 0)); return s.indexOf(Math.max(...s)) === p.chosen; }).length / pages.length; return { ...m, hit }; };
  return { n: pages.length, brief: one(predBrief), base: one(predBase) }; }

// ---------- the whole brief analysis ----------
let BRIEF_CACHE = null, BRIEF_FOR = null;
function briefAnalysis() { if (BRIEF_FOR === S.fits && BRIEF_CACHE) return BRIEF_CACHE; const out = [], P = S.val.products, attrs = S.study.attrs, feats = E.features(attrs);
  S.models.filter(m => m.provider !== 'import').forEach(m => { const U = units().filter(u => u.m === m), briefs = U.filter(u => hasBrief(u.c)); if (!briefs.length) return;
    const base = U.find(u => !hasBrief(u.c));
    briefs.forEach(t => { const e = { model: m.label, modelKey: mkey(m), brief: t.c.label, text: String(t.c.brief).trim(), type: t.c.briefType || 'multi', targets: briefTargets(t.c), storefront: !!t.c.briefStore, baseLabel: base?.c.label };
      if (!base) { out.push({ ...e, error: 'Add a condition with no brief on page 4: it is the baseline every brief is compared with.' }); return; }
      const A = S.fits[base.key], B = S.fits[t.key]; if (!A?.fit || !B?.fit) { out.push({ ...e, error: `${!A?.fit ? 'The baseline' : 'This brief'} has no conjoint fit yet (run it, then Analyse).` }); return; }
      // Q1: relative importance and raw weights
      const imp = attrs.map(a => { const b0 = A.fit.importance.find(x => x.attr === a.name)?.pct ?? 0, b1 = B.fit.importance.find(x => x.attr === a.name)?.pct ?? 0; return { attr: a.name, targeted: e.targets.includes(a.name), base: b0, brief: b1, change: b1 - b0 }; });
      const terms = feats.map((f, j) => { const c0 = A.fit.coefs[j + 1], c1 = B.fit.coefs[j + 1], z = (c1.B - c0.B) / Math.sqrt(c0.SE ** 2 + c1.SE ** 2); return { term: c0.term, attr: f.attr, targeted: e.targets.includes(f.attr), Bbase: c0.B, SEbase: c0.SE, Bbrief: c1.B, SEbrief: c1.SE, ratio: c0.B ? c1.B / c0.B : null, z, p: 2 * (1 - normCdfV5(Math.abs(z))) }; });
      // Q2: proportional or reshuffled
      const nt = imp.filter(x => !x.targeted), s0 = nt.reduce((s, x) => s + x.base, 0), s1 = nt.reduce((s, x) => s + x.brief, 0);
      nt.forEach(x => { x.shareBase = s0 ? 100 * x.base / s0 : 0; x.shareBrief = s1 ? 100 * x.brief / s1 : 0; x.gap = x.shareBrief - x.shareBase; });
      const reshuffle = nt.length > 1 ? nt.reduce((s, x) => s + Math.abs(x.gap), 0) / 2 : null, tgtIdx = feats.map((f, j) => e.targets.includes(f.attr) ? j : -1).filter(j => j >= 0);
      const prop = proportionalTest(conjXY(base), conjXY(t), A.fit, B.fit, tgtIdx);
      // Q3: does the brief's conjoint predict what it recommends under the brief?
      const R = S.results[t.key] || {}, rk = Object.values(R.ranking || {}).filter(x => x.valid && x.ranking); let rank = null;
      if (rk.length && A.pred && B.pred) { const rows = rk.map(x => { const pos = P.map(p => -(x.ranking.indexOf(p.name) + 1)); return { brief: E.spearman(B.pred, pos), base: E.spearman(A.pred, pos) }; });
        const mean = k => rows.reduce((s, r) => s + r[k], 0) / rows.length; rank = { n: rows.length, rhoBrief: mean('brief'), rhoBase: mean('base'), test: wilcoxonB(rows.map(r => r.brief - r.base)), rows,
          moved: A.avgRank && B.avgRank ? E.spearman(A.avgRank, B.avgRank) : null }; }
      const store = R.store && Object.keys(R.store).length && A.pred && B.pred ? storeCompareB(R, B.pred, A.pred) : null;
      out.push({ ...e, imp, terms, nt, reshuffle, prop, rank, store, nBase: A.fit.n, nBrief: B.fit.n }); }); });
  BRIEF_FOR = S.fits; return BRIEF_CACHE = out; }

// ---------- words and tables ----------
const ptsB = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' pts';
function briefSentences(b) { if (b.error) return `<p class="hint">${esc(b.error)}</p>`; const L = [];
  const tg = b.imp.filter(x => x.targeted), tgTerms = b.terms.filter(t => t.targeted);
  if (tg.length) L.push(`<li><b>Targeted:</b> ${tg.map(x => { const ts = tgTerms.filter(t => t.attr === x.attr), sig = ts.filter(t => t.p < SIG).length;
    return `${esc(x.attr)} ${x.base.toFixed(1)}% → ${x.brief.toFixed(1)}% (${ptsB(x.change)}${ts.length === 1 && ts[0].ratio != null ? `, weight ×${ts[0].ratio.toFixed(2)}` : ''}; ${sig ? `weight change clear in ${sig} of ${ts.length} term${ts.length > 1 ? 's' : ''}` : 'weight change not clear'})`; }).join('; ')}</li>`);
  else L.push(`<li><b>Targeted:</b> none of the study's attributes (${b.type === 'offlist' ? 'the brief asks for something outside the study' : 'no attributes ticked'}), so every attribute is treated as not mentioned.</li>`);
  const big = b.imp.slice().sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0];
  if (big && !big.targeted) L.push(`<li>Largest change: <b>${esc(big.attr)}</b> ${big.base.toFixed(1)}% → ${big.brief.toFixed(1)}% (${ptsB(big.change)}), which the brief did not mention.</li>`);
  if (b.reshuffle != null) { const movers = b.nt.filter(x => Math.abs(x.gap) >= 2).sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 3);
    const propWord = b.prop ? (b.prop.p < SIG ? `<span class="verdict mid">Reshuffled</span>` : `<span class="verdict ok">In proportion</span>`) : '';
    L.push(`<li><b>The other attributes:</b> ${propWord} reshuffle index ${b.reshuffle.toFixed(1)} of 100 (0 = all shrank or grew in proportion)${b.prop ? `; proportional-scaling test χ²(${b.prop.df}) = ${b.prop.LR.toFixed(2)}, ${pTxt(b.prop.p)}; common factor ×${b.prop.lambda.toFixed(2)}` : ''}.${movers.length ? ` Off the proportional line: ${movers.map(x => `${esc(x.attr)} ${ptsB(x.gap)}`).join(', ')} (share of the attributes not mentioned).` : ''}</li>`); }
  if (b.rank) { const t = b.rank.test, better = t.p != null && t.p < SIG && b.rank.rhoBrief > b.rank.rhoBase;
    L.push(`<li><b>Predicts its recommendations?</b> ${better ? '<span class="verdict ok">Yes, better than the baseline</span>' : t.p != null && t.p < SIG ? '<span class="verdict no">The baseline predicts better</span>' : '<span class="verdict mid">No clear difference</span>'} Across ${b.rank.n} rankings made with the brief, the brief's conjoint matched at mean ρ = ${b.rank.rhoBrief.toFixed(2)} and the baseline conjoint at ρ = ${b.rank.rhoBase.toFixed(2)}${t.p != null ? ` (Wilcoxon z = ${t.z.toFixed(2)}, ${pTxt(t.p)})` : ' (too few differing rankings to test)'}.${b.rank.moved != null ? ` Mean ranks with vs without the brief: ρ = ${b.rank.moved.toFixed(2)}.` : ''}</li>`); }
  else L.push('<li class="hint">No ranking task under this brief yet, so prediction is not tested.</li>');
  if (b.store && !b.store.brief.error && !b.store.base.error) L.push(`<li><b>Storefront with the brief</b> (${b.store.n} trials after the lock, page position controlled): brief conjoint picks the actual choice in ${(100 * b.store.brief.hit).toFixed(0)}% (pseudo-R² ${b.store.brief.r2.toFixed(2)}), baseline conjoint in ${(100 * b.store.base.hit).toFixed(0)}% (pseudo-R² ${b.store.base.r2.toFixed(2)}).</li>`);
  return `<ul class="sumlist">${L.join('')}</ul>`; }

function briefsHTML() { const BA = briefAnalysis(); if (!BA.length) return ''; const by = {}; BA.forEach(b => (by[b.model] = by[b.model] || []).push(b));
  const cards = Object.entries(by).map(([m, list]) => `<div class="sumcard wide"><h3>${esc(m)}</h3>${list.map(b => `<div class="sumq">${esc(b.brief)}: “${esc(b.text)}”</div>${briefSentences(b)}`).join('')}</div>`).join('');
  const tables = BA.filter(b => !b.error).map(b => `<h3>${esc(b.model)} · ${esc(b.brief)}</h3><p class="hint">“${esc(b.text)}” · baseline: ${esc(b.baseLabel)} · N = ${b.nBase} / ${b.nBrief} answered pairs</p>
    <table><tr><th>Attribute</th><th>Targeted</th><th class="num">Importance, baseline</th><th class="num">Importance, brief</th><th class="num">Change</th><th class="num">Share of not-mentioned, baseline</th><th class="num">…, brief</th><th class="num">Off proportional</th></tr>${b.imp.map(x => `<tr><td>${esc(x.attr)}</td><td>${x.targeted ? '✓' : ''}</td><td class="num">${x.base.toFixed(1)}%</td><td class="num">${x.brief.toFixed(1)}%</td><td class="num">${ptsB(x.change)}</td><td class="num">${x.targeted ? '' : x.shareBase.toFixed(1) + '%'}</td><td class="num">${x.targeted ? '' : x.shareBrief.toFixed(1) + '%'}</td><td class="num">${x.targeted ? '' : ptsB(x.gap)}</td></tr>`).join('')}</table>
    <table><tr><th>Term</th><th class="num">B baseline</th><th class="num">B brief</th><th class="num">× change</th><th class="num">z (difference)</th><th class="num">Sig.</th></tr>${b.terms.map(t => `<tr class="${t.p < .05 ? 'sig' : ''}"><td>${esc(t.term)}${t.targeted ? ' ✓' : ''}</td><td class="num">${fmt(t.Bbase)}</td><td class="num">${fmt(t.Bbrief)}</td><td class="num">${t.ratio == null ? '' : t.ratio.toFixed(2)}</td><td class="num">${fmt(t.z, 2)}</td><td class="num">${fmtP(t.p)}</td></tr>`).join('')}</table>`).join('');
  return `<div class="card summary"><h2>Shopper briefs: how each brief moves relative importance</h2><p class="hint">Each brief is compared with the same model's baseline (no brief) on the same conjoint pairs. ✓ = an attribute the researcher ticked as targeted. The z test compares the two separate fits, which equals the condition × attribute interaction in one pooled logistic regression. The proportional-scaling test asks whether all the weights the brief did not target were multiplied by one common factor (likelihood ratio, pooled model). Fixed rules, no AI.</p><div class="sumgrid">${cards}</div>${fullTables(tables, 'Show the brief tables (importance shift and weights)')}</div>`; }

// ---------- export parts ----------
function briefUnitsShown() { const keep = new Set(expUnits().map(u => mkey(u.m))); return briefAnalysis().filter(b => keep.has(b.modelKey)); }
function briefImpRows() { const o = []; briefUnitsShown().forEach(b => { if (b.error) { o.push({ Model: b.model, Brief: b.brief, Note: b.error }); return; } b.imp.forEach(x => o.push({ Model: b.model, Brief: b.brief, BriefText: b.text, BriefType: (BRIEF_TYPES.find(t => t[0] === b.type) || [, b.type])[1], Attribute: x.attr, Targeted: x.targeted ? 1 : 0, ImportanceBaselinePct: +x.base.toFixed(4), ImportanceBriefPct: +x.brief.toFixed(4), ChangePts: +x.change.toFixed(4), NotMentionedShareBaselinePct: x.targeted ? '' : +x.shareBase.toFixed(4), NotMentionedShareBriefPct: x.targeted ? '' : +x.shareBrief.toFixed(4), OffProportionalPts: x.targeted ? '' : +x.gap.toFixed(4) })); }); return o; }
function briefTermRows() { const o = []; briefUnitsShown().filter(b => !b.error).forEach(b => b.terms.forEach(t => o.push({ Model: b.model, Brief: b.brief, Term: t.term, Attribute: t.attr, Targeted: t.targeted ? 1 : 0, B_Baseline: t.Bbase, SE_Baseline: t.SEbase, B_Brief: t.Bbrief, SE_Brief: t.SEbrief, Ratio: t.ratio ?? '', z_Difference: t.z, p: t.p }))); return o; }
function briefSumRows() { return briefUnitsShown().map(b => b.error ? { Model: b.model, Brief: b.brief, Note: b.error } : { Model: b.model, Brief: b.brief, BriefText: b.text, BriefType: (BRIEF_TYPES.find(t => t[0] === b.type) || [, b.type])[1], Targets: b.targets.join(' | '), InStorefront: b.storefront ? 1 : 0, Baseline: b.baseLabel, PairsBaseline: b.nBase, PairsBrief: b.nBrief,
  ReshuffleIndex: b.reshuffle ?? '', ProportionalLambda: b.prop?.lambda ?? '', ProportionalLR: b.prop?.LR ?? '', ProportionalDF: b.prop?.df ?? '', ProportionalP: b.prop?.p ?? '',
  Rankings: b.rank?.n ?? '', MeanRhoBriefConjoint: b.rank?.rhoBrief ?? '', MeanRhoBaselineConjoint: b.rank?.rhoBase ?? '', WilcoxonZ: b.rank?.test?.z ?? '', WilcoxonP: b.rank?.test?.p ?? '', RankingMovedRho: b.rank?.moved ?? '',
  StoreTrials: b.store?.n ?? '', StoreHitBriefPct: b.store?.brief?.hit != null ? 100 * b.store.brief.hit : '', StoreHitBaselinePct: b.store?.base?.hit != null ? 100 * b.store.base.hit : '' }); }

// ---------- SPSS: the interaction model for every brief ----------
function briefSPSS(feats, U) { const BA = briefAnalysis().filter(b => !b.error); if (!BA.length) return ''; const L = ['', '* ---------------- STEP 10. Shopper briefs: does the brief change each weight? (condition x attribute interactions) ----------------.',
  '* One pooled logistic regression per brief: the baseline and the brief together. Brief = 1 for the brief condition. Each i_ term is the change in that weight under the brief;', '* its Wald test equals the z test in the tool (expected/brief_weights.csv). The proportional-scaling test (one common factor for the weights the brief did not target) is a', '* non-linear restriction that SPSS LOGISTIC REGRESSION cannot fit; its numbers are in expected/brief_summary.csv.'];
  BA.forEach(b => { const m = S.models.find(x => mkey(x) === b.modelKey), uB = units().find(u => u.m === m && u.c.label === b.baseLabel), uT = units().find(u => u.m === m && u.c.label === b.brief); if (!uB || !uT) return;
    L.push('', `* ${b.model}: ${b.brief} vs ${b.baseLabel}.`, BRIEF_GETDATA, `SELECT IF (RunID = '${runId(uB)}' OR RunID = '${runId(uT)}').`, `COMPUTE Brief = (RunID = '${runId(uT)}').`, ...feats.map(f => `COMPUTE i_${f.name.slice(2)} = ${f.name} * Brief.`), 'EXECUTE.',
      'LOGISTIC REGRESSION VARIABLES ChoseFirst', '  /METHOD=ENTER Brief ' + feats.map(f => f.name).join(' ') + ' ' + feats.map(f => 'i_' + f.name.slice(2)).join(' ') + '.'); });
  return L.join('\n') + '\n'; }
let BRIEF_GETDATA = '';

// ---------- page 4: brief editor ----------
function renderBriefEditor() { let el = $('briefEd'); if (!el) { el = document.createElement('div'); el.id = 'briefEd'; $('condTable').insertAdjacentElement('afterend', el); }
  const attrs = S.study.attrs.map(a => a.name), nB = S.conditions.filter(hasBrief).length, per = callsPerUnit().total, nm = S.models.filter(m => m.provider !== 'import').length;
  el.innerHTML = `<h3 style="margin-top:16px">Shopper briefs <span class="info" data-tip="A brief is how a shopper would ask, e.g. 'I want an e-reader with a long battery life'. It goes before every conjoint and ranking prompt for that condition (and the storefront instruction if ticked). A condition with no brief is the baseline. Results then show how much the brief moved each attribute's relative importance, whether the attributes it did not mention shrank in proportion or were reshuffled, and whether the brief's conjoint predicts what the model recommends.">i</span></h3>
    <p class="hint">Conditions with no brief are the baseline. Add as many briefs as you like: each one is a full extra run per model (${per} calls × ${nm} model(s)). The validation check never includes the brief.</p>
    ${S.conditions.map((c, i) => hasBrief(c) || c.briefOn ? `<div class="briefrow"><b>${esc(c.label)}</b><textarea data-bi="${i}" data-bf="brief" rows="2" placeholder="Type the brief exactly as a shopper would, e.g. I need an e-reader with a long battery life.">${esc(c.brief || '')}</textarea>
      <div class="briefopts"><label>Type <select data-bi="${i}" data-bf="briefType">${BRIEF_TYPES.map(([v, l]) => `<option value="${v}"${(c.briefType || 'multi') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <span>Targets: ${attrs.map(a => `<label class="chk"><input type="checkbox" data-bi="${i}" data-bt="${esc(a)}"${(c.briefTargets || []).includes(a) ? ' checked' : ''}> ${esc(a)}</label>`).join(' ')}</span>
      <label class="chk"><input type="checkbox" data-bi="${i}" data-bf="briefStore"${c.briefStore ? ' checked' : ''}> also in the storefront instruction</label></div></div>` : '').join('')}
    <div class="row"><button id="addBrief" class="ghost">+ Add a shopper brief</button> <button id="addBriefEx" class="ghost">+ Add the 8 e-reader example briefs</button> ${nB ? `<span class="hint">${nB} brief(s) set.</span>` : ''}</div>
    <style>.briefrow{border:1px solid var(--line,#ddd);border-radius:8px;padding:8px 10px;margin:8px 0}.briefrow textarea{width:100%;margin:4px 0}.briefopts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:.92em}.briefopts .chk{white-space:nowrap}</style>`;
  el.querySelectorAll('[data-bf]').forEach(inp => inp.onchange = () => { const c = S.conditions[+inp.dataset.bi]; c[inp.dataset.bf] = inp.type === 'checkbox' ? inp.checked : inp.value; save(); renderConds(); });
  el.querySelectorAll('[data-bt]').forEach(inp => inp.onchange = () => { const c = S.conditions[+inp.dataset.bi], t = new Set(c.briefTargets || []); inp.checked ? t.add(inp.dataset.bt) : t.delete(inp.dataset.bt); c.briefTargets = attrs.filter(a => t.has(a)); save(); });
  $('addBrief').onclick = () => { S.conditions.push({ id: 'c' + Date.now().toString(36), label: 'Brief ' + (S.conditions.filter(c => c.briefOn || hasBrief(c)).length + 1), temperature: '', brief: '', briefOn: true, briefType: 'multi', briefTargets: [], briefStore: false }); save(); renderConds(); };
  $('addBriefEx').onclick = () => { const have = new Set(S.conditions.map(c => String(c.brief || '').trim())); let n = 0; BRIEF_EXAMPLES.forEach((x, k) => { if (have.has(x.brief)) return; n++;
      S.conditions.push({ id: 'c' + Date.now().toString(36) + k, label: x.label, temperature: '', brief: x.brief, briefOn: true, briefType: x.type, briefTargets: x.targets.filter(t => attrs.includes(t)), briefStore: false }); });
    save(); renderConds(); if (typeof msg === 'function' && $('condMsg')) msg('condMsg', `Added ${n} brief(s).`); }; }

(function initBrief() {
  const _cr = callRetry; callRetry = function (u, prompt, image, simTask, ctl, o) { const b = briefFor(u, simTask); if (b) { prompt = b.text + '\n\n' + prompt; simTask = { ...simTask, briefTargets: b.targets }; } return _cr(u, prompt, image, simTask, ctl, o); };
  // Demo models only: a simulated shopper weights the attributes a brief targets 3x, so the demo shows a shift
  const _sa = Sim.answer; Sim.answer = function (m, task) { if (!task?.briefTargets?.length) return _sa.call(this, m, task); const t = this.truth(m), keep = t.beta.slice(), f = E.features(S.study.attrs);
    f.forEach((x, j) => { if (task.briefTargets.includes(x.attr)) t.beta[j] *= 3; }); try { return _sa.call(this, m, task); } finally { t.beta.splice(0, t.beta.length, ...keep); } };
  const _rc = renderConds; renderConds = function () { _rc(); renderBriefEditor(); }; renderBriefEditor();
  const _rp = renderPrompts; renderPrompts = function () { _rp(); const c = S.conditions.find(hasBrief); if (!c || !S.design || !S.tasks.conjoint) return;
    const box = document.createElement('div'); box.innerHTML = `<h3>Shopper brief · how “${esc(c.label)}” changes the conjoint prompt</h3><div class="preview">${esc(String(c.brief).trim() + '\n\n' + conjointTask(S.design[0], 'AB').prompt)}</div><p class="hint">The brief goes first in every conjoint and ranking prompt for that condition${c.briefStore ? ' and in the storefront instruction' : ''}. Conditions with no brief see the usual prompt.</p>`;
    $('pvAll')?.appendChild(box); };
  const _rr = renderResults; renderResults = function () { _rr(); if (!Object.keys(S.fits || {}).length) return; const h = briefsHTML(); if (h) $('resOut').insertAdjacentHTML('afterbegin', h); };
  const _sf = spssFull; spssFull = function (feats, U) { const s = _sf(feats, U), m = s.match(/GET DATA \/TYPE=TXT \/FILE='data\/conjoint_long\.csv'[\s\S]*?\.\n/); BRIEF_GETDATA = m ? m[0].trim() : ''; return s + (BRIEF_GETDATA ? briefSPSS(feats, U) : ''); };
  const _sp = spssPack; spssPack = function () { const f = _sp(); if (briefAnalysis().length) { f.splice(f.length - 1, 0, ['spss/expected/brief_importance.csv', fullCSV(briefImpRows())], ['spss/expected/brief_weights.csv', fullCSV(briefTermRows())], ['spss/expected/brief_summary.csv', fullCSV(briefSumRows())]); } return f; };
})();
