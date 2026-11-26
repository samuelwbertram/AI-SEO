"""Builds LLM Conjoint Lab v5 from the recovered v3 file: v3 kept as is (including its storefront), plus
Study 3 preset, conjoint -> locked prediction -> storefront order, pilot sizes, validation check,
spend cap, reasoning setting, and a storefront position model."""
import re, sys, json
from pathlib import Path

src = (Path(__file__).resolve().parent.parent / 'versions' / 'LLM_Conjoint_Lab_v3.html').read_text(encoding='utf-8')
out_path = Path(sys.argv[1])

def rep(s, old, new, count=1):
    n = s.count(old)
    if n < 1:
        raise SystemExit('NOT FOUND: ' + old[:120])
    if count == 1 and n != 1:
        raise SystemExit(f'NOT UNIQUE ({n}): ' + old[:120])
    return s.replace(old, new)

s = src

# ---------------------------------------------------------------- titles / version
s = s.replace('LLM Conjoint Lab v3 app', 'LLM Conjoint Lab v5 app')
from datetime import datetime
from zoneinfo import ZoneInfo
BUILD = datetime.now(ZoneInfo('Australia/Melbourne')).strftime('%d %b %Y %H:%M')   # shown in the header, so you can tell you have the newest version
s = rep(s, '<span class="sub">v3 · build a study', f'<span class="sub">v5.4 (updated {BUILD} Melbourne time) · build a study')
s = re.sub(r'<title>[^<]*</title>', '<title>LLM Conjoint Lab v5</title>', s, count=1)

# ---------------------------------------------------------------- engine: linked attributes in the conjoint wording
s = rep(s, "      if (disc.length) p += (scale.length ? 'It has ' : `The ${ord} ${product} has `) + list(disc.map(a => `a ${a.name} of ${P[a.name].display}`)) + '. ';",
        "      if (disc.length) p += (scale.length ? 'It has ' : `The ${ord} ${product} has `) + list(disc.flatMap(a => [`a ${a.name} of ${P[a.name].display}`, ...Object.entries(a.also || {}).map(([col, map]) => `a ${col} of ${map[P[a.name].display] ?? ''}`)])) + '. ';")

# ---------------------------------------------------------------- state defaults
s = rep(s, "  settings: { temperature: '', maxTokens: 2000, conc: 4, retries: 3, reask: true, assistModel: 'openai/gpt-4o-mini' },",
        "  settings: { temperature: '', maxTokens: 2000, conc: 4, retries: 3, reask: true, assistModel: 'openai/gpt-4o-mini', reasoning: 'low', runSize: 'pilot', pilotPairs: 30, pilotTrials: 20, pilotRanks: 3, spendCap: 30, validationTrials: 10, autoFull: false },")

# ---------------------------------------------------------------- presets: Study 3 built in
s = rep(s, "function renderPresets() { $('presetSel').innerHTML = ['Study 2 (speakers, built in)', ...Object.keys(presets)]",
        "function renderPresets() { $('presetSel').innerHTML = ['Study 3 (e-readers, OpenAI + Claude + Gemini, built in)', 'Study 2 (speakers, built in)', ...Object.keys(presets)]")
s = rep(s, "$('presetLoad').onclick = () => { const n = $('presetSel').value; if (n.startsWith('Study 2')) { loadStudy2(); return; }",
        "$('presetLoad').onclick = () => { const n = $('presetSel').value; if (n.startsWith('Study 3')) { loadStudy3(); return; } if (n.startsWith('Study 2')) { loadStudy2(); return; }")


# ---------------------------------------------------------------- headers shown: add linked columns (e.g. Resolution after Screen type)
s = rep(s, "function showHeaders() { return ['Name', ...S.study.attrs.map(a => a.name).filter(n => S.val.headers.includes(n))]; }",
        "function showHeaders() { return ['Name', ...S.study.attrs.flatMap(a => [a.name, ...Object.keys(a.also || {})]).filter(n => S.val.headers.includes(n))]; }")

# ---------------------------------------------------------------- model call: system message, tools, image detail, reasoning effort
old_call_start = s.index('async function callModel(u, prompt, image, simTask) {')
old_call_end = s.index('async function callRetry(')
new_call = r'''async function callModel(u, prompt, image, simTask, o = {}) {
  const m = u.m, t0 = performance.now(), temp = o.temperature !== undefined ? o.temperature : tempFor(u), maxT = +(o.maxTokens || S.settings.maxTokens) || 2000; let text = '', inTok = null, outTok = null, cost = null, served = m.model, args = null;
  if (m.provider === 'sim') { const a = Sim.answer(m, simTask); await new Promise(r => setTimeout(r, 5)); if (a && typeof a === 'object') return { text: a.text, args: a.args, ms: Math.round(performance.now() - t0), served: 'simulated' }; return { text: a, ms: Math.round(performance.now() - t0), served: 'simulated' }; }
  const key = keys[m.provider]; if (!key) throw new ApiError(`No ${m.provider} key (page 4).`, 0, false);
  if (m.provider === 'openrouter' || m.provider === 'openai') {
    const content = image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image, ...(o.detail ? { detail: o.detail } : {}) } }] : prompt;
    const messages = [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content }];
    const body = { model: m.model, messages }; if (m.provider === 'openai') { body.max_completion_tokens = maxT; if (S.settings.reasoning && /^(gpt-5|gpt-6|o\d)/.test(m.model)) body.reasoning_effort = S.settings.reasoning; } else { body.max_tokens = maxT; body.usage = { include: true }; if (S.settings.reasoning) body.reasoning = { effort: S.settings.reasoning }; } if (temp != null) body.temperature = temp;
    if (o.tool) { body.tools = [{ type: 'function', function: o.tool }]; body.tool_choice = 'auto'; body.parallel_tool_calls = false; }
    const j = await httpJSON(PROV[m.provider] + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...(m.provider === 'openrouter' ? { 'X-Title': 'LLM Conjoint Lab' } : {}) }, body: JSON.stringify(body) });
    const mc = j.choices?.[0]?.message; text = typeof mc?.content === 'string' ? mc.content : Array.isArray(mc?.content) ? mc.content.map(p => p.text || '').join('') : ''; inTok = j.usage?.prompt_tokens ?? null; outTok = j.usage?.completion_tokens ?? null; cost = j.usage?.cost ?? null; served = j.model || m.model;
    const calls = (mc?.tool_calls || []).filter(c => c.function?.name === (o.tool?.name || '')); if (calls.length === 1) { try { args = JSON.parse(calls[0].function.arguments || '{}'); } catch (e) { args = { _bad: true }; } } else if (calls.length > 1) args = { _multiple: true };
  } else if (m.provider === 'anthropic') {
    const content = image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.split(',')[1] } }, { type: 'text', text: prompt }] : prompt;
    const body = { model: m.model, max_tokens: maxT, messages: [{ role: 'user', content }] }; if (o.system) body.system = o.system; if (temp != null) body.temperature = Math.min(1, temp);
    if (o.tool) body.tools = [{ name: o.tool.name, description: o.tool.description, input_schema: o.tool.parameters }];
    const j = await httpJSON(PROV.anthropic + '/messages', { method: 'POST', headers: anthHeaders(), body: JSON.stringify(body) }); text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''); inTok = j.usage?.input_tokens ?? null; outTok = j.usage?.output_tokens ?? null; served = j.model || m.model;
    const tu = (j.content || []).filter(b => b.type === 'tool_use'); if (tu.length === 1) args = tu[0].input; else if (tu.length > 1) args = { _multiple: true };
  } else if (m.provider === 'google') {
    const parts = [{ text: prompt }]; if (image) parts.push({ inline_data: { mime_type: 'image/png', data: image.split(',')[1] } });
    const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxT } }; if (temp != null) body.generationConfig.temperature = temp; if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
    const strip = x => Array.isArray(x) ? x.map(strip) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'additionalProperties' && k !== 'strict').map(([k, v]) => [k, strip(v)])) : x;
    if (o.tool) body.tools = [{ functionDeclarations: [{ name: o.tool.name, description: o.tool.description, parameters: strip(o.tool.parameters) }] }];
    const j = await httpJSON(`${PROV.google}/models/${encodeURIComponent(m.model.replace(/^models\//, ''))}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ps = j.candidates?.[0]?.content?.parts || []; text = ps.filter(p => !p.thought && p.text).map(p => p.text).join(''); inTok = j.usageMetadata?.promptTokenCount ?? null; outTok = j.usageMetadata?.candidatesTokenCount ?? null; served = j.modelVersion || m.model;
    const fc = ps.filter(p => p.functionCall); if (fc.length === 1) args = fc[0].functionCall.args; else if (fc.length > 1) args = { _multiple: true }; }
  if (cost == null) cost = costFromTokens(m, inTok, outTok);
  return { text, args, inTok, outTok, cost, served, ms: Math.round(performance.now() - t0) };
}
'''
s = s[:old_call_start] + new_call + s[old_call_end:]
s = rep(s, "async function callRetry(u, prompt, image, simTask, ctl) { for (let a = 0; ; a++) { try { return await callModel(u, prompt, image, simTask); }",
        "async function callRetry(u, prompt, image, simTask, ctl, o) { for (let a = 0; ; a++) { try { return await callModel(u, prompt, image, simTask, o); }")



# ---------------------------------------------------------------- runner: conjoint first, then lock, then storefront
old_bt_start = s.index('function buildTasks(u) {')
old_bt_end = s.index('async function doTask(u, t) {')
new_bt = r'''function sizes() { const pilot = S.settings.runSize === 'pilot', perPair = S.study.counterbalance ? 2 : 1;
  return { pairs: S.design ? (pilot ? S.design.slice(0, Math.max(1, +S.settings.pilotPairs || 20)) : S.design) : [], ranks: pilot ? Math.min(+S.tasks.rankRuns, +S.settings.pilotRanks || 3) : +S.tasks.rankRuns, trials: pilot ? Math.min(+S.tasks.storeTrials, +S.settings.pilotTrials || 20) : +S.tasks.storeTrials, perPair }; }
function buildTasks(u, phase) { const R = resOf(u), T = [], z = sizes();
  if (phase !== 'store') { if (S.tasks.conjoint && S.design) z.pairs.forEach(p => (S.study.counterbalance ? ['AB', 'BA'] : ['AB']).forEach(o => { const id = p.pair + ':' + o; if (!R.conjoint[id]) T.push({ kind: 'conjoint', id, pair: p, order: o }); }));
    if (S.tasks.ranking && S.val.products.length) for (let i = 1; i <= z.ranks; i++) if (!R.ranking[i]) T.push({ kind: 'ranking', id: i }); }
  if (phase !== 'first' && S.tasks.store && S.val.products.length) for (let i = 1; i <= z.trials; i++) if (!R.store[i]) T.push({ kind: 'store', id: i });
  return T; }
'''
s = s[:old_bt_start] + new_bt + s[old_bt_end:]


old_ru_start = s.index('async function runUnit(u) {')
old_ru_end = s.index("$('startAll').onclick")
new_ru = r'''function spent() { let c = 0; Object.values(S.results).forEach(R => { ['conjoint', 'ranking', 'store'].forEach(k => Object.values(R[k] || {}).forEach(x => { c += x.cost || 0; })); Object.values(R.validation?.trials || {}).forEach(x => { c += x.cost || 0; }); }); return c; }
let capWarned = false;
async function workPhase(u, tasks, st, ctl, fn) { let next = 0, errRun = 0;
  const worker = async () => { while (next < tasks.length && !ctl.stop && !globalStop) { while (run.paused && !globalStop) await new Promise(r => setTimeout(r, 250)); if (globalStop || ctl.stop) break;
    if (+S.settings.spendCap > 0 && spent() >= +S.settings.spendCap) { if (!capWarned) { capWarned = true; run.paused = true; $('pauseAll').textContent = 'Resume'; log(`■ Spend cap reached ($${spent().toFixed(2)} of $${(+S.settings.spendCap).toFixed(2)}). Paused: raise the cap on page 4 and press Resume to carry on.`); } continue; }
    const t = tasks[next++]; try { (await fn(t)) ? st.ok++ : st.bad++; errRun = 0; } catch (e) { st.err++; errRun++; log(`${u.label}: ✕ ${e.message.slice(0, 160)}`); if (!e.retry || errRun >= 5) { ctl.stop = true; st.status = 'stopped: ' + e.message.slice(0, 60); } }
    st.done++; if (st.done % 10 === 0) save(); } };
  await Promise.all(Array.from({ length: Math.max(1, +S.settings.conc || 1) }, worker)); }
async function runUnit(u) { const ctl = run.ctl[u.key] = { stop: false }, first = buildTasks(u, 'first'), st = run.stats[u.key] = { total: first.length + buildTasks(u, 'store').length, done: 0, ok: 0, bad: 0, err: 0, status: 'running' };
  log(`${u.label}: ${first.length} conjoint/ranking calls to go`);
  await workPhase(u, first, st, ctl, t => doTask(u, t)); save();
  if (S.tasks.conjoint && !S.tasks.store && S.val.products.length && !ctl.stop && !globalStop) await lockPrediction(u);   // conjoint-only run: lock now, so the fingerprint can be posted before the storefront
  if (S.tasks.store && !ctl.stop && !globalStop) {
    const locked = !S.tasks.conjoint || await lockPrediction(u);
    if (!locked) log(`${u.label}: ⚠ the conjoint can't be fitted yet (too few or one-sided answers), so no prediction is locked. The storefront runs anyway; run more pairs before trusting the comparison.`);
    const store = buildTasks(u, 'store'); log(`${u.label}: ${locked ? 'prediction locked · ' : ''}${store.length} storefront trials to go`); await workPhase(u, store, st, ctl, t => doTask(u, t)); }
  if (st.status === 'running') st.status = st.done >= st.total ? 'complete' : 'stopped'; save(); log(`${u.label}: ${st.status} (${st.ok} ok, ${st.bad} unclear/invalid, ${st.err} errors)`); }
'''
s = s[:old_ru_start] + new_ru + s[old_ru_end:]

s = rep(s, "  if (S.tasks.store && S.tasks.storeMode === 'image') log('Screenshot storefront: models that cannot read images will error and stop.');",
        "  if (S.tasks.store && S.tasks.storeMode === 'image') log('Screenshot storefront: models that cannot read images will error and stop.');\n  log(`Starting ${S.settings.runSize === 'pilot' ? 'PILOT' : 'FULL'} run.`); capWarned = false;")

# ---------------------------------------------------------------- analysis: locked prediction, read-back, position model
s = rep(s, "  if (out.avgRank && out.share) out.rhoRankStore = E.spearman(out.avgRank.map(v => -v), out.share);\n  return out; }",
        "  if (out.avgRank && out.share) out.rhoRankStore = E.spearman(out.avgRank.map(v => -v), out.share);\n  acesAnalyse(u, out, R, P);\n  return out; }")
s = rep(s, "    ${a.posShare ? `<h3>Storefront picks by page position</h3>",
        "    ${acesResultsHTML(a)}${a.posShare ? `<h3>Storefront picks by page position</h3>")

# ---------------------------------------------------------------- exports: storefront rows carry cost and token fields
s = rep(s, "  if (k === 'store') return U.flatMap(u => Object.entries(S.results[u.key]?.store || {}).map(([id, v]) => ({ Run: u.label, Trial: id, PageOrder: v.order, Choice: v.choice ?? '', Position: v.position ?? '', Misreads: v.misreads ?? '', MisreadDetail: v.misread_detail, Raw: v.raw, Served: v.served })));",
        "  if (k === 'store') return U.flatMap(u => Object.entries(S.results[u.key]?.store || {}).map(([id, v]) => ({ Run: u.label, Trial: id, PageOrder: v.order, Choice: v.choice ?? '', Position: v.position ?? '', Row: v.row ?? '', Col: v.col ?? '', Misreads: v.misreads ?? '', MisreadDetail: v.misread_detail, CartClickOK: v.cart_ok ?? '', Issues: v.issues ?? '', ReportedArgs: v.args ? JSON.stringify(v.args) : '', Raw: v.raw, Served: v.served, Cost: v.cost ?? '', InTokens: v.tin ?? '', OutTokens: v.tout ?? '' })));")

# ---------------------------------------------------------------- page markup: run size, spend cap, validation, reasoning
s = rep(s, """<button class="b sec" id="clearAll">Clear all results</button></div>""",
        """<button class="b sec" id="clearAll">Clear all results</button></div>
    <div class="row" style="margin-top:10px;align-items:flex-end">
      <label>Run size <span class="info" data-tip="Pilot uses the first pairs, rankings and storefront trials of the same fixed design, so a later Full run carries on where the pilot stopped. Use the pilot to check everything works and to see the real cost per call.">i</span> <select id="runSize"><option value="pilot">Pilot</option><option value="full">Full</option></select></label>
      <label>Pilot pairs <input id="pilotPairs" type="number" min="1" style="width:80px"></label>
      <label>Pilot rankings <input id="pilotRanks" type="number" min="1" style="width:80px"></label>
      <label>Pilot storefront trials <input id="pilotTrials" type="number" min="1" style="width:80px"></label>
      <label>Validation trials <span class="info" data-tip="Validation check: one product is made best on every attribute with a clear direction and the others worst. A model that reads the page and chooses logically should pick it every time.">i</span> <input id="validationTrials" type="number" min="1" style="width:70px"></label>
      <button class="b sec" id="runValidation">Validation check (storefront)</button>
    </div>
    <p class="hint" id="spendLine"></p>""")
s = rep(s, """      <label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" id="reask"> Re-ask once if unclear</label>""",
        """      <label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" id="reask"> Re-ask once if unclear</label>
      <label>Reasoning effort <span class="info" data-tip="For models that think before answering (OpenRouter models, OpenAI GPT-5/GPT-6/o-series models, and Gemini 2.5 and later, where thinking also counts toward the answer length limit). Low keeps cost down; blank sends nothing and uses each model's default.">i</span> <select id="reasoning"><option value="">model default</option><option value="minimal">minimal</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
      <label>Spend cap, US$ <span class="info" data-tip="The run pauses when total spend reaches this amount. Raise it and press Resume to carry on. 0 = no cap. OpenRouter reports cost per call; for direct OpenAI, Anthropic and Google calls the Lab counts tokens × each model's list price (set in the Study 3 lineup).">i</span> <input id="spendCap" type="number" min="0" step="1" style="width:90px"></label>""")

# ---------------------------------------------------------------- storefront page: cards wide enough for their longest line
s = rep(s, "rows = Math.ceil(order.length / cols), W = 290, H = 80 + 28 * heads.length, pad = 16;",
        "rows = Math.ceil(order.length / cols), W = cardWidth(order, heads), H = 80 + 28 * heads.length, pad = 16;")

# ---------------------------------------------------------------- separate storage from v3, sync new settings
s = rep(s, "indexedDB.open('conjointLabV3', 1)", "indexedDB.open('conjointLabV5', 1)")
s = s.replace("conjointLabV3.keys", "conjointLabV5.keys")
s = rep(s, "function syncAll() { syncStudy(); syncSettings();", "function syncAll() { syncStudy(); syncSettings(); syncV5();")

# ---------------------------------------------------------------- new code: Study 3, lock, validation, analysis
new_code = (Path(__file__).parent / 'v5_additions.js').read_text(encoding='utf-8')
guide_code = (Path(__file__).parent / 'guide.js').read_text(encoding='utf-8')  # first-visit tour + one-click demo
guide_code += "\n" + (Path(__file__).parent / 'launch.js').read_text(encoding='utf-8')  # one-click launch
root = Path(__file__).resolve().parent.parent
guide_code += "\nconst VERIFY_PY = " + json.dumps((root / 'verify' / 'verify.py').read_text(encoding='utf-8')) + ";"
guide_code += "\nconst VERIFY_R = " + json.dumps((root / 'verify' / 'verify.R').read_text(encoding='utf-8')) + ";\n"
guide_code += (Path(__file__).parent / 'verify.js').read_text(encoding='utf-8')  # page 9: verification pack
guide_code += "\n" + (Path(__file__).parent / 'spss_full.js').read_text(encoding='utf-8')  # v5.4: full SPSS analysis in the CSV .zip
guide_code += "\n" + (Path(__file__).parent / 'v54_run.js').read_text(encoding='utf-8')  # v5.4: validation panel, cut-off answers, finder progress, keys first
guide_code += "\n" + (Path(__file__).parent / 'v54_more.js').read_text(encoding='utf-8')  # v5.4: exports per model, prices, alerts, pilot banner
guide_code += "\n" + (Path(__file__).parent / 'helper.js').read_text(encoding='utf-8')  # v5.4: helper model dropdown
guide_code += "\n" + (Path(__file__).parent / 'summary.js').read_text(encoding='utf-8')  # v5.4: plain-English results summary
marker = "(async () => { await IDB.open();"
s = rep(s, marker, new_code + "\n" + guide_code + "\n" + marker)
s = rep(s, "renderPresets(); syncAll(); })();", "renderPresets(); syncAll(); verifyInit(); guideInit(); launchInit(); })();")
# time-stamp every storefront trial and conjoint answer (lets the verification pack show the lock came first)
s = rep(s, "raw: res.text, served: res.served, cost: res.cost }; return !!pc.choice; }", "raw: res.text, served: res.served, cost: res.cost, at: new Date().toISOString() }; return !!pc.choice; }")
s = rep(s, "    R.conjoint[t.id] = { pair: t.pair.pair, order: t.order,", "    R.conjoint[t.id] = { at: new Date().toISOString(), pair: t.pair.pair, order: t.order,")
# models that failed the launch quick check are left out of that launch
s = rep(s, "function units() { const out = []; S.models.forEach(m => { if", "function units() { const out = []; S.models.filter(m => !m.skip).forEach(m => { if")

# ---------------------------------------------------------------- v5.4: plain-English summary on top of Results, full tables folded below
s = rep(s, "if (kind === 'one') { const a = S.fits[id]; $('resOut').innerHTML = a ? renderOne(a) : '<p class=\"hint\">No analysis yet.</p>'; return; }",
        "if (kind === 'one') { const a = S.fits[id]; $('resOut').innerHTML = a ? summaryHTML([a], 'Summary · ' + a.label) + fullTables(renderOne(a)) : '<p class=\"hint\">No analysis yet.</p>'; return; }")
s = rep(s, "$('resOut').innerHTML = renderCompare(list, 'Model comparison'); return; }",
        "$('resOut').innerHTML = summaryHTML(list, 'Summary') + fullTables(renderCompare(list, 'Model comparison')); return; }")
s = rep(s, "$('resOut').innerHTML = renderCompare(list, 'Within model · ' + (S.models.find(m => mkey(m) === id)?.label || '') + ' across conditions'); }",
        "$('resOut').innerHTML = summaryHTML(list, 'Summary across conditions') + fullTables(renderCompare(list, 'Within model · ' + (S.models.find(m => mkey(m) === id)?.label || '') + ' across conditions')); }")

# ---------------------------------------------------------------- v5.4: product finder runs on Claude Opus 5.5 with the Anthropic key (OpenRouter kept as backup)
s = rep(s, "assistModel: 'openai/gpt-4o-mini', reasoning:", "assistModel: 'claude-opus-5-5', reasoning:")
s = rep(s, "<label>Helper model <input id=\"assistModel\" size=\"26\"></label>",
        "<label>Helper model <span class=\"info\" data-tip=\"Optional, uses AI. Only for finding products while you set up a study; never used for the conjoint, storefront or analysis. The list shows models from the providers you have entered a key for on page 4, each with its own web search. Check every value against its source link.\">i</span> <select id=\"assistSel\"></select> <input id=\"assistModel\" size=\"22\" placeholder=\"model ID\" style=\"display:none\"></label>")
old_helper = s[s.index("async function helperCall(prompt, web) {"):s.index("function parseFound(text)")]
new_helper = """async function helperCall(prompt, web) { return helperCallV54(prompt, web); }
"""
s = s.replace(old_helper, new_helper)
s = s.replace("Uses your OpenRouter key and the helper model below (web search adds a small cost per search).",
        "<b>Optional, uses AI:</b> pick the helper model below from the providers you have keys for (Claude, GPT or Gemini, each with web search; searches add a small cost). Only for setting up products; it is never used for the conjoint, storefront or analysis. Check every value against its source link before you run.")
# ---------------------------------------------------------------- v5.4: answers cut off by the length limit are detected and re-asked
s = rep(s, "let text = '', inTok = null, outTok = null, cost = null, served = m.model, args = null;", "let text = '', inTok = null, outTok = null, cost = null, served = m.model, args = null, truncated = false;")
s = rep(s, "body.max_completion_tokens = maxT;", "body.max_completion_tokens = /^(gpt-5|gpt-6|o\\d)/.test(m.model) ? Math.max(maxT, 8192) : maxT;")
s = rep(s, "    const mc = j.choices?.[0]?.message;", "    const mc = j.choices?.[0]?.message; truncated = j.choices?.[0]?.finish_reason === 'length';")
s = rep(s, "text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''); inTok = j.usage?.input_tokens ?? null;", "text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''); truncated = j.stop_reason === 'max_tokens'; inTok = j.usage?.input_tokens ?? null;")
s = rep(s, "const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxT } };", "const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: Math.max(maxT, 8192) } }; const tc = geminiThinking(m.model); if (tc) body.generationConfig.thinkingConfig = tc;")
s = rep(s, "const j = await httpJSON(`${PROV.google}/models/${encodeURIComponent(m.model.replace(/^models\\//, ''))}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });",
        "const j = await googleGenerate(`${PROV.google}/models/${encodeURIComponent(m.model.replace(/^models\\//, ''))}:generateContent?key=${encodeURIComponent(key)}`, body); truncated = j.candidates?.[0]?.finishReason === 'MAX_TOKENS';")
s = rep(s, "  return { text, args, inTok, outTok, cost, served, ms: Math.round(performance.now() - t0) };", "  return { text, args, inTok, outTok, cost, served, truncated, ms: Math.round(performance.now() - t0) };")
# main storefront trials: re-ask once when no choice can be read
s = rep(s, "  const res = await callRetry(u, image ? E.storefrontImagePrompt(S.study.product) : E.storefrontTextPrompt(S.study.product, page, showHeaders()), image ? drawPage(page) : null, { type: 'store', products: page, image }, ctl);\n  const pc = E.parseChoiceName(res.text, names); let mis = null, detail = '';",
        "  const { res, pc, raw2, cut, cost } = await storeAsk(u, image ? E.storefrontImagePrompt(S.study.product) : E.storefrontTextPrompt(S.study.product, page, showHeaders()), image ? drawPage(page) : null, { type: 'store', products: page, image }, ctl, names);\n  let mis = null, detail = '';")
s = rep(s, "misread_detail: detail, raw: res.text, served: res.served, cost: res.cost, at: new Date().toISOString() }; return !!pc.choice; }",
        "misread_detail: detail, raw: res.text, raw2, cut, served: res.served, cost, at: new Date().toISOString() }; return !!pc.choice; }")
s = rep(s, "Raw: v.raw, Served: v.served, Cost: v.cost ?? '',", "Raw: v.raw, ReAskAnswer: v.raw2 ?? '', CutOff: v.cut ? 1 : 0, Served: v.served, Cost: v.cost ?? '',")
# validation panel on the Run page, and in Export
s = rep(s, '<div class="log" id="runLog" style="margin-top:12px"></div>\n  </div>', '<div class="log" id="runLog" style="margin-top:12px"></div>\n  </div>\n  <div class="card" id="valPanel"></div>')
s = rep(s, "['spss', 'SPSS syntax'],", "['validation', 'Validation check (every answer)'], ['spss', 'SPSS syntax'],")
s = rep(s, "  if (k === 'study') return", "  if (k === 'validation') return valRows();\n  if (k === 'study') return")
s = rep(s, "throw new ApiError(`No ${m.provider} key (page 4).`, 0, false)", "throw new ApiError(`No ${m.provider} key (enter it on page 1).`, 0, false)")
# ---------------------------------------------------------------- v5.4 (b): exports per model and for every view; tokens on every call; ranking wording; labels; products
s = rep(s, "function partRows(k) { const U = units(), F = u => S.fits[u.key];", "function partRows(k) { const U = expUnits(), F = u => S.fits[u.key];")
s = rep(s, "  if (k === 'validation') return valRows();", "  if (k === 'validation') return valRows();\n  if (k === 'valsummary') return validationSummaryRows();\n  if (k === 'plain') return plainRows();\n  if (k === 'predcheck') return predCheckRows();\n  if (k === 'holds') return holdsRows();\n  if (k === 'similarity') return similarityRows();\n  if (k === 'positions') return positionRows();\n  if (k === 'clogit') return clogitRows();")
s = rep(s, "const PARTS = [['summary', 'Summary (fit and prediction per run)'],", "const PARTS = [['plain', 'Plain-English summary'], ['predcheck', 'Did the prediction work (predicted vs actual storefront rank)'], ['summary', 'Model comparison (fit and prediction per run)'], ['holds', 'Coefficients side by side with Holds in'], ['similarity', 'Do models share preferences (rho matrix)'], ['positions', 'Storefront picks by page position'], ['clogit', 'Storefront position model (conditional logit)'], ['valsummary', 'Validation check: results per model'],")
s = rep(s, "['validation', 'Validation check (every answer)']", "['validation', 'Validation check: every answer']")
s = rep(s, "['summary', 'coefs', 'importance', 'predictions'].includes(k) ? 'checked' : ''", "['plain', 'predcheck', 'summary', 'coefs', 'importance', 'predictions', 'valsummary'].includes(k) ? 'checked' : ''")
s = rep(s, "R.ranking[t.id] = { ranking: pr.ranking, valid: pr.valid, warnings: pr.warnings.join('; '), reasoning: pr.reasoning, raw: res.text, served: res.served, cost: res.cost };", "R.ranking[t.id] = { ranking: pr.ranking, valid: pr.valid, warnings: pr.warnings.join('; '), reasoning: pr.reasoning, raw: res.text, served: res.served, cost: res.cost, tin: res.inTok, tout: res.outTok };")
s = rep(s, "  const { res, pc, raw2, cut, cost } = await storeAsk(u, image ? E.storefrontImagePrompt(S.study.product) : E.storefrontTextPrompt(S.study.product, page, showHeaders()), image ? drawPage(page) : null, { type: 'store', products: page, image }, ctl, names);\n  let mis = null, detail = '';",
        "  const { res, pc, raw2, cut, cost, tin, tout } = await storeAsk(u, image ? E.storefrontImagePrompt(S.study.product) : E.storefrontTextPrompt(S.study.product, page, showHeaders()), image ? drawPage(page) : null, { type: 'store', products: page, image }, ctl, names);\n  let mis = null, detail = '';")
s = rep(s, "misread_detail: detail, raw: res.text, raw2, cut, served: res.served, cost, at: new Date().toISOString() }; return !!pc.choice; }", "misread_detail: detail, raw: res.text, raw2, cut, served: res.served, cost, tin, tout, at: new Date().toISOString() }; return !!pc.choice; }")
s = rep(s, "let p = 'Rank the following products from the best to the worst in terms of value for the money.\\n\\n';", "let p = (S.study.legacyRank ? 'Rank the following products from the best to the worst in terms of value for the money.' : 'Rank the following products from the best to the worst.') + '\\n\\n';")
s = rep(s, "REASONING: Product A has the best value; Product C is last due to lower quality.';", "REASONING: ' + (S.study.legacyRank ? 'Product A has the best value; Product C is last due to lower quality.' : 'Product A is best overall; Product C is last.');")
s = rep(s, "S.study = { product: st.product, attrs: st.attrs, iterations: 1000, seed: 1, counterbalance: false };", "S.study = { product: st.product, attrs: st.attrs, iterations: 1000, seed: 1, counterbalance: false, legacyRank: true };")
s = rep(s, "ranks them best to worst for value for money. Repeated N times", "ranks them from best to worst (the Study 2 preset keeps its original \"value for the money\" wording). Repeated N times")
s = rep(s, "Mean rank (${a.nRank} rankings)</th><th class=\"num\">#1 finishes</th>", "Mean rank in ranking task (${a.nRank} rankings)</th><th class=\"num\">Ranked #1 (of ${a.nRank} rankings)</th>")
s = rep(s, "Storefront share (${a.nStore})", "Storefront picks (share of ${a.nStore} trials)")
s = rep(s, "addProducts(pick);", "addProducts(codeNames(pick));")
s = rep(s, "source: p.source || ''", "source: ''")
# ---------------------------------------------------------------- v5.4 (c): product predictions use every storefront trial (pilot + full) for picks, rank and match
s = rep(s, "  if (k === 'predictions') return U.filter(F).flatMap(u => { const a = F(u); return S.val.products.map((p, i) => ({ Run: u.label, Product: p.name, PredictedUtility: a.pred?.[i] ?? '', PredictedRank: a.predRank?.[i] ?? '', MeanRank: a.avgRank?.[i] ?? '', FirstFinishes: a.firstCount?.[i] ?? '', StorefrontSharePct: a.share ? +(100 * a.share[i]).toFixed(2) : '' })); });",
        "  if (k === 'predictions') return U.filter(F).flatMap(u => productRows(u, F(u)));")
s = rep(s, "Storefront picks (share of ${a.nStore} trials)</th>", "Storefront picks (of all ${a.nStore} trials)</th><th class=\"num\">Storefront rank</th>")
s = rep(s, "a.share ? `<td class=\"num\">${(100 * a.share[i]).toFixed(1)}%</td>` : ''}</tr>`).join('')}</tab", "a.share ? `<td class=\"num\">${Math.round(a.share[i] * a.nStore)} (${(100 * a.share[i]).toFixed(1)}%)</td><td class=\"num\">${E.ranks(a.share, true)[i]}${a.predRank && E.ranks(a.share, true)[i] === a.predRank[i] ? ' ✓' : ''}</td>` : ''}</tr>`).join('')}</tab")
# ---------------------------------------------------------------- v5.4 (d): CSV export = one .zip with every part, plus the full SPSS analysis
s = rep(s, "    if (f === 'csv') { parts.forEach(p => { if (p === 'spss') download(`${base}_syntax.sps`, spssText(), 'text/plain'); else { const r = partRows(p); if (r.length) download(`${base}_${p}.csv`, E.toCSV(r), 'text/csv'); } }); msg('expMsg', 'Downloaded.'); }",
        "    if (f === 'csv') { const files = [], root = `${base}_${stamp()}/`; parts.forEach(p => { if (p === 'spss') files.push(...spssPack()); else { const r = partRows(p); if (r.length) files.push([`${fn(PARTS.find(x => x[0] === p)[1]).replace(/_+$/, '')}.csv`, '\\ufeff' + E.toCSV(r)]); } }); if (!files.length) throw new Error('Nothing to export for the ticked parts yet.'); download(`${base}_${stamp()}.zip`, makeZip(files.map(([n, t]) => [root + n, t]))); msg('expMsg', `Downloaded one .zip with ${files.length} files${parts.includes('spss') ? ' (open spss/READ_ME.txt for the SPSS steps)' : ''}.`); }")
s = rep(s, "['spss', 'SPSS syntax']", "['spss', 'SPSS: full analysis, start to finish (syntax + data files)']")
s = rep(s, '<option value="csv">CSV (one file per part)</option>', '<option value="csv">CSV: every part in one .zip (with the full SPSS analysis)</option>')
s = rep(s, "const spssText = () => E.spssPerModel(", "const spssText = () => '* For the full start-to-finish SPSS analysis, export as \"CSV: every part in one .zip\" and open spss/analysis.sps.\\n* The per-model syntax below runs on the Conjoint data sheet only.\\n\\n' + E.spssPerModel(")
s = rep(s, "['ranking', 'Ranking runs']", "['ranking', 'Ranking task answers (Rotman bot, separate from the storefront)']")
s = rep(s, "  if (k === 'conjoint') {", "  if (k === 'conjoint') return conjointExportRows();\n  if (k === 'conjoint_old') {")
# older saved projects still carry the old default helper; move them to the new one
s = rep(s, "renderPresets(); syncAll(); verifyInit();", "if (S.settings.assistModel === 'openai/gpt-4o-mini') S.settings.assistModel = 'claude-opus-5-5'; S.val.products.forEach(p => { if (p.source) p.source = ''; }); renderPresets(); syncAll(); initHelperSelect(); initV54(); initV54b(); verifyInit();")

out_path.write_text(s, encoding='utf-8')
print('written', out_path, len(s))
