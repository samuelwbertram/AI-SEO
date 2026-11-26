// ================= v5.4: validation shown as it runs, cut-off answers, product-finder progress, keys first =================

// ---------- Gemini thinking: thinking tokens count toward the answer limit, so keep them low and the limit high ----------
function geminiThinking(model) { const lvl = S.settings.reasoning; if (!lvl) return null; const m = model.replace(/^models\//, '');
  if (/^gemini-2\.5/.test(m)) return { thinkingBudget: { minimal: 0, low: 1024, medium: 4096, high: 8192 }[lvl] ?? 1024 };
  if (/^gemini-[3-9]/.test(m)) return { thinkingLevel: lvl };
  return null; }
async function googleGenerate(url, body) {
  try { return await httpJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { // a model that does not accept this thinking setting: ask again with the model's default
    if (e.status === 400 && body.generationConfig?.thinkingConfig) { delete body.generationConfig.thinkingConfig; return await httpJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    throw e; } }

// ---------- storefront answer: re-ask once when no choice can be read (e.g. the answer was cut off) ----------
async function storeAsk(u, prompt, image, simTask, ctl, names) {
  const res = await callRetry(u, prompt, image, simTask, ctl); let pc = E.parseChoiceName(res.text, names), raw2 = null, cut = !!res.truncated, cost = res.cost;
  if (!pc.choice && S.settings.reask && !ctl.stop) { const r2 = await callRetry(u, prompt, image, simTask, ctl); raw2 = r2.text; cut = cut || !!r2.truncated;
    if (r2.cost != null) cost = (cost || 0) + r2.cost; const p2 = E.parseChoiceName(r2.text, names); if (p2.choice) pc = p2; }
  return { res, pc, raw2, cut, cost }; }

// ---------- validation panel (Run page): the test page, and every answer as it comes in ----------
function valReason(t, dominant) {
  if (t.choice === dominant) return '';
  if (!t.choice && t.cut) return 'Answer cut off: it hit the length limit before giving a choice';
  if (!t.choice) return 'No readable choice in the answer';
  return `Picked ${t.choice} instead`; }
function valRows() { const out = [];
  units().filter(u => u.m.provider !== 'import').forEach(u => { const V = resOf(u).validation; if (!V) return;
    Object.entries(V.trials || {}).sort((a, b) => +a[0] - +b[0]).forEach(([id, t]) => { const order = (t.order || '').split(' | ');
      out.push({ Model: u.label, Trial: +id, BestProduct: V.dominant, BestProductPosition: order.indexOf(V.dominant) + 1 || '', Picked: t.choice ?? '', Correct: t.choice === V.dominant ? 1 : 0, Reason: valReason(t, V.dominant), CutOff: t.cut ? 1 : 0, MisreadCards: t.misreads ?? '', MisreadDetail: t.misread_detail || '', PageOrder: t.order || '', Answer: t.raw ?? '', ReAskAnswer: t.raw2 ?? '', Served: t.served ?? '', At: t.at || '' }); }); });
  return out; }
function renderValidation() { const el = $('valPanel'); if (!el) return;
  const { prods, dominant } = (S.val.products.length > 1 ? validationProducts() : {}); const U = units().filter(u => u.m.provider !== 'import'), anyRun = U.some(u => resOf(u).validation);
  let h = `<h2>Validation check</h2><p class="hint">Before the real run, each model shops a <b>test page</b> where one product is clearly best: <b>${esc(dominant || 'the first product')}</b> gets the best level of every attribute with a clear "better" direction and every other product gets the worst. Attributes with no clear direction are the same on every card. A model that reads the page and chooses sensibly picks ${esc(dominant || 'it')} every time. Your real products and design are not changed.</p>`;
  if (prods) { const heads = showHeaders().slice(1), same = heads.filter(hd => prods.every(p => String(p.display[hd]) === String(prods[0].display[hd])));
    h += `<div class="scroll" style="max-height:none"><table><tr><th>Test product</th>${heads.map(hd => `<th>${esc(hd)}</th>`).join('')}</tr>
      <tr><td><b>${esc(dominant)}</b> (best)</td>${heads.map(hd => `<td>${same.includes(hd) ? '<span class="hint">same on all</span> ' : ''}<b>${esc(prods[0].display[hd] ?? '')}</b></td>`).join('')}</tr>
      <tr><td>The other ${prods.length - 1} (all identical)</td>${heads.map(hd => `<td>${same.includes(hd) ? '<span class="hint">same on all</span> ' : ''}${esc(prods[1].display[hd] ?? '')}</td>`).join('')}</tr></table></div>
      <div class="row" style="margin-top:8px"><button class="b sec" id="valShowPage">${S.tasks.storeMode === 'image' ? 'Show the test page screenshot' : 'Show the test page'}</button>${anyRun ? '<button class="b sec" id="valCSV">Download validation answers (CSV)</button>' : ''}</div><div id="valPage"></div>`; }
  U.forEach(u => { const V = resOf(u).validation; if (!V) return; const T = Object.entries(V.trials || {}).sort((a, b) => +a[0] - +b[0]), n = T.length, hit = T.filter(([, t]) => t.choice === V.dominant).length, st = run.stats[u.key], live = st?.status === 'validation';
    const badge = live ? `<span class="pill">running · ${n}/${st.total}</span>` : n && hit === n ? '<span class="verdict ok">PASS</span>' : `<span class="verdict no">CHECK</span>`;
    h += `<details class="valmodel" ${live || hit !== n ? 'open' : ''}><summary><b>${esc(u.label)}</b>: picked ${esc(V.dominant)} in ${hit}/${n} trials ${badge}</summary>
      <table><tr><th class="num">Trial</th><th class="num">Where ${esc(V.dominant)} was</th><th>Picked</th><th>Result</th><th class="num">Misread cards</th><th>Answer</th></tr>${T.map(([id, t]) => { const pos = (t.order || '').split(' | ').indexOf(V.dominant) + 1;
        return `<tr><td class="num">${id}</td><td class="num">${pos ? 'position ' + pos : ''}</td><td>${esc(t.choice || '—')}</td><td>${t.choice === V.dominant ? '✓' : '✕ ' + esc(valReason(t, V.dominant))}</td><td class="num">${t.misreads ?? '—'}</td><td><details><summary>show</summary><pre class="valraw">${esc(String(t.raw ?? '').slice(0, 3000))}${t.raw2 != null ? '\n\n--- asked again ---\n' + esc(String(t.raw2).slice(0, 3000)) : ''}</pre></details></td></tr>`; }).join('')}</table></details>`; });
  if (!anyRun) h += '<p class="hint">Not run yet. It runs first in ▶ Launch study, or on its own with the Validation check button above.</p>';
  el.innerHTML = h;
  if ($('valShowPage')) $('valShowPage').onclick = () => { const P = E.shuffle(prods, E.rng(((+S.study.seed || 1) * 100003) + 1 + 99991));
    $('valPage').innerHTML = S.tasks.storeMode === 'image' ? `<p class="hint">One test page as the model sees it (the order is reshuffled each trial):</p><img src="${drawPage(P)}" style="max-width:100%;border:1px solid #ddd;border-radius:8px">` : `<div class="preview">${esc(E.storefrontTextPrompt(S.study.product, P, showHeaders()))}</div>`; };
  if ($('valCSV')) $('valCSV').onclick = () => download(`validation_${fn(S.projName)}_${stamp()}.csv`, E.toCSV(valRows()), 'text/csv'); }

// ---------- product finder: progress box with timer and Cancel ----------
let helperAbort = null;
runHelper = async function (btn, prompt, web, from) { const b = $(btn), old = b.textContent; b.disabled = true; b.textContent = 'Working…';
  const { model } = helperChoice(), t0 = Date.now(); helperAbort = new AbortController();
  $('findOut').innerHTML = `<div class="helperbusy"><span class="spin"></span><div><b>${web ? 'Searching the web' : 'Reading the text'} with ${esc(model || 'the helper model')}… <span id="hTimer">0:00</span></b><br><span class="hint">This usually takes 30 seconds to 2 minutes. The products it finds will appear here as a table: tick the ones you want and press Add. Nothing is added until you do.</span></div><button class="b sec" id="hCancel">Cancel</button></div>`;
  const tm = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); if ($('hTimer')) $('hTimer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  $('hCancel').onclick = () => helperAbort?.abort();
  try { if (!S.study.attrs.length) throw new Error('Set up the study attributes on page 1 first.');
    const list = parseFound(await helperCall(prompt, web)); const secs = Math.round((Date.now() - t0) / 1000);
    if (!list.length) throw new Error('The helper model found no products. Try different search hints or another helper model.');
    showFound(list, from); $('findOut').insertAdjacentHTML('afterbegin', `<div class="msg ok">Found ${list.length} product${list.length === 1 ? '' : 's'} in ${secs} s. Check each value against its source link, tick the ones you want, then press Add.</div>`); }
  catch (e) { msg('findOut', helperAbort?.signal.aborted ? 'Cancelled. Nothing was added.' : e.message, false); }
  finally { clearInterval(tm); helperAbort = null; b.disabled = false; b.textContent = old; } };

// ---------- API keys first: the keys box sits at the top of page 1, page 4 shows which keys are in ----------
function renderKeyStatus() { const el = $('keyStatus'); if (!el) return; const P = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['google', 'Google'], ['openrouter', 'OpenRouter']];
  el.innerHTML = `<b>API keys:</b> ${P.map(([k, l]) => `${l} ${(keys[k] || '').trim() ? '<span class="verdict ok">✓</span>' : '<span class="hint">—</span>'}`).join(' · ')} <button class="b sec" id="keysGo" style="margin-left:8px">Edit keys (page 1)</button>`;
  $('keysGo').onclick = () => { showTab('study'); document.querySelector('[data-key="openai"]')?.focus(); }; }
function keysFirst() { const card = document.querySelector('[data-key="openrouter"]')?.closest('.card'), study = $('study'); if (!card || !study) return;
  study.insertBefore(card, study.firstElementChild); const h2 = card.querySelector('h2'); if (h2 && !card.querySelector('.keyshint')) h2.insertAdjacentHTML('afterend', '<p class="hint keyshint">Start here: paste a key for each provider you will use (OpenAI, Anthropic, Google, or one OpenRouter key for all). Models without a key are skipped.</p>');
  const models = $('models'); if (models && !$('keyStatus')) models.insertAdjacentHTML('afterbegin', '<div class="card" id="keyStatus"></div>');
  document.querySelectorAll('[data-key]').forEach(inp => inp.addEventListener('input', renderKeyStatus)); renderKeyStatus(); }

function initV54() { keysFirst(); renderValidation(); }
(() => { const st = document.createElement('style'); st.textContent = `
  .helperbusy{display:flex;gap:14px;align-items:center;border:1px solid var(--line,#ddd);border-radius:10px;padding:12px 14px;background:#fafaf7}
  .spin{width:22px;height:22px;border:3px solid #d8d5ce;border-top-color:#2f5d4e;border-radius:50%;animation:spin 0.9s linear infinite;flex:none} @keyframes spin{to{transform:rotate(360deg)}}
  .valmodel{border:1px solid var(--line,#ddd);border-radius:10px;padding:8px 12px;margin-top:10px;background:#fff} .valmodel>summary{cursor:pointer}
  .valmodel table{margin-top:8px} pre.valraw{white-space:pre-wrap;max-width:560px;max-height:260px;overflow:auto;font-size:12px;background:#f6f5f1;padding:8px;border-radius:6px}`; document.head.appendChild(st); })();
