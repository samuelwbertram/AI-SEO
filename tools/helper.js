// ================= v5.4: product-finder helper model, chosen from a dropdown of the providers you have keys for =================
// Optional, setup only: the helper finds real products and their attributes. It is never used for the conjoint,
// the storefront or the analysis. Model IDs checked against each provider's docs on 26 Nov 2026.
const HELPER_MODELS = [
  { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5 (Anthropic)' },
  { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Anthropic)' },
  { provider: 'openai', model: 'gpt-6.2-astra', label: 'GPT-6.2 Astra (OpenAI)' },
  { provider: 'openai', model: 'gpt-6.2-sol', label: 'GPT-6.2 Sol (OpenAI)' },
  { provider: 'google', model: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash (Google)' },
  { provider: 'google', model: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Google)' }];
const PROVIDER_NAME = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter' };
function guessProvider(model) { const m = (model || '').trim().toLowerCase();
  return m.includes('/') ? 'openrouter' : m.startsWith('claude') ? 'anthropic' : m.startsWith('gemini') ? 'google' : /^(gpt|o\d|chatgpt)/.test(m) ? 'openai' : ''; }
function helperChoice() { const st = S.settings, model = (st.assistModel || '').trim(); return { model, provider: st.assistProvider || guessProvider(model) }; }
function renderHelperSelect() { const sel = $('assistSel'); if (!sel) return;
  const have = p => !!(keys[p] || '').trim(), list = HELPER_MODELS.filter(h => have(h.provider)), cur = helperChoice();
  let opts = list.map(h => [`${h.provider}|${h.model}`, h.label]);
  if (!list.length && !have('openrouter')) { sel.innerHTML = '<option value="">Add an API key on page 1 first</option>'; sel.disabled = true; $('assistModel').style.display = 'none'; ['findGo', 'linkGo', 'textGo'].forEach(id => { if ($(id)) $(id).disabled = true; }); return; }
  sel.disabled = false; ['findGo', 'linkGo', 'textGo'].forEach(id => { if ($(id)) $(id).disabled = false; });
  opts.push(['other|', have('openrouter') ? 'Other model… (type its ID; OpenRouter IDs have a slash)' : 'Other model… (type its ID)']);
  sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  const known = list.find(h => h.model === cur.model && h.provider === cur.provider);
  if (S.settings.assistOther) sel.value = 'other|';   // researcher chose to type their own model ID
  else if (known) sel.value = `${known.provider}|${known.model}`;
  else if (cur.model && cur.provider && have(cur.provider)) sel.value = 'other|';
  else if (list.length) { sel.value = `${list[0].provider}|${list[0].model}`; S.settings.assistModel = list[0].model; S.settings.assistProvider = list[0].provider; save(); }
  else sel.value = 'other|';
  const other = sel.value === 'other|'; $('assistModel').style.display = other ? '' : 'none'; if (other) $('assistModel').value = cur.model; }
function initHelperSelect() { const sel = $('assistSel'); if (!sel) return;
  sel.onchange = () => { const [p, m] = sel.value.split('|'); S.settings.assistOther = p === 'other'; if (p !== 'other') { S.settings.assistModel = m; S.settings.assistProvider = p; } else { S.settings.assistModel = ''; S.settings.assistProvider = ''; } save(); renderHelperSelect(); };
  $('assistModel').oninput = e => { S.settings.assistModel = e.target.value.trim(); S.settings.assistProvider = guessProvider(S.settings.assistModel); save(); };
  document.querySelectorAll('[data-key]').forEach(inp => inp.addEventListener('input', renderHelperSelect));
  renderHelperSelect(); }

async function helperCallV54(prompt, web) {
  const { model, provider } = helperChoice();
  if (!model) throw new Error('Pick a helper model first.');
  if (!provider) throw new Error(`Can't tell which provider "${model}" belongs to. Pick a model from the list, or use an OpenRouter ID with a slash.`);
  const key = (keys[provider] || '').trim(); if (!key) throw new Error(`Add your ${PROVIDER_NAME[provider]} key on page 1 first (the product finder uses ${model}).`);
  if (provider === 'anthropic') {
    const messages = [{ role: 'user', content: prompt }], body = { model, max_tokens: 8000, messages };
    if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
    let text = '';
    for (let turn = 0; turn < 4; turn++) {   // web search can pause a long turn; send it back to carry on
      const j = await httpJSON(PROV.anthropic + '/messages', { method: 'POST', signal: helperAbort?.signal, headers: anthHeaders(), body: JSON.stringify(body) });
      text += (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      (j.content || []).filter(b => b.type === 'server_tool_use' && b.input?.query).forEach(b => helperQueries.push(b.input.query));
      if (j.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: j.content }); }
    return text; }
  if (provider === 'openai') {   // Responses API; web search is the built-in web_search tool
    const body = { model, input: prompt, max_output_tokens: 8000 }; if (web) body.tools = [{ type: 'web_search' }];
    const j = await httpJSON(PROV.openai + '/responses', { method: 'POST', signal: helperAbort?.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    (j.output || []).filter(o => o.type === 'web_search_call').forEach(o => { const q = o.action?.query || o.action?.queries; [].concat(q || []).forEach(x => helperQueries.push(x)); });
    if (typeof j.output_text === 'string' && j.output_text) return j.output_text;
    return (j.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text' || c.text).map(c => c.text || '').join(''); }
  if (provider === 'google') {   // generateContent; web search is Grounding with Google Search
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 8000 } }; if (web) body.tools = [{ google_search: {} }];
    const j = await httpJSON(`${PROV.google}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', signal: helperAbort?.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    (j.candidates?.[0]?.groundingMetadata?.webSearchQueries || []).forEach(x => helperQueries.push(x));
    return (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join(''); }
  // OpenRouter: any model ID with a slash
  const body = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 6000 };
  if (web) body.tools = [{ type: 'openrouter:web_search' }];
  const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'X-Title': 'LLM Conjoint Lab' };
  let j; try { j = await httpJSON(PROV.openrouter + '/chat/completions', { method: 'POST', signal: helperAbort?.signal, headers: h, body: JSON.stringify(body) }); }
  catch (e) { if (!web) throw e; delete body.tools; body.model = model + ':online'; j = await httpJSON(PROV.openrouter + '/chat/completions', { method: 'POST', signal: helperAbort?.signal, headers: h, body: JSON.stringify(body) }); }
  const m = j.choices?.[0]?.message; return typeof m?.content === 'string' ? m.content : (m?.content || []).map(p => p.text || '').join(''); }
