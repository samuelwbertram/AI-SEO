// ================= ONE-CLICK LAUNCH =================
// "▶ Launch study": quick check (1 call per model) → validation check → pilot → confirm cost → full run → analyse.
// Pressing it again carries on where it stopped; finished calls are never repeated or paid for twice.

function sleepL(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitRun() { await sleepL(300); while (run.active) await sleepL(300); }
let launching = false;

async function launchStudy() {
  if (launching || run.active) return log('A run is already going. Pause or stop it first.');
  showTab('run'); launching = true; globalStop = false; const btn = $('launchBtn'); if (btn) btn.disabled = true;
  try {
    S.models.forEach(m => delete m.skip);
    const U = units().filter(u => u.m.provider !== 'import');
    if (!U.length) return log('Launch: add models on page 4 first.');
    if (S.tasks.conjoint && !S.design) { S.design = E.pairDesign(S.study.attrs, +S.study.iterations || 500, +S.study.seed || 1); save(); log('Launch: design generated from the study settings.'); }
    if ((S.tasks.ranking || S.tasks.store) && !S.val.products.length) return log('Launch: add products on page 2, or switch off ranking and storefront on page 3.');

    // 1. Quick check: one call per model, to catch a missing key or a wrong model name before spending anything.
    log('▶ Launch 1/5 · Quick check: 1 call per model.');
    const probe = S.design?.[0] ? conjointTask(S.design[0], 'AB') : { type: 'conjoint', prompt: 'Reply with the word OK.' };
    const failed = [];
    await Promise.all(U.map(async u => { try { await callRetry(u, probe.prompt, null, probe, { stop: false }); log(`  ${u.label}: ✓ responding`); }
      catch (e) { failed.push(u); log(`  ${u.label}: ✕ ${String(e.message).slice(0, 140)}`); } }));
    if (failed.length) { failed.forEach(u => u.m.skip = true); save();
      if (failed.length === U.length) return log('■ Launch stopped: no model responded. Check the keys and model names on page 4.');
      log(`Launch: skipping ${failed.map(u => u.label).join(', ')} for this run. Fix them on page 4 and press Launch again to add them back.`); }
    if (globalStop) return log('■ Launch stopped.');

    // 2. Validation check (storefront): one product is best on everything, so each model should pick it every time.
    if (S.tasks.store) { const need = units().filter(u => u.m.provider !== 'import' && !(resOf(u).validation?.n && resOf(u).validation.hit === resOf(u).validation.n));
      if (need.length) { log('▶ Launch 2/5 · Validation check.'); await runValidation(); }
      else log('▶ Launch 2/5 · Validation already passed for every model.');
      if (globalStop) return log('■ Launch stopped.');
      const bad = units().filter(u => u.m.provider !== 'import').filter(u => { const v = resOf(u).validation; return !v || !v.n || v.hit !== v.n; });
      if (bad.length && !confirmV5(`${bad.map(u => `${u.label}: ${resOf(u).validation?.hit ?? 0}/${resOf(u).validation?.n ?? 0}`).join('\n')}\n\nThese models did not pick the best product every time in the validation check. Each answer, and why it missed, is in the Validation check panel on the Run page (Cancel to look first).\n\nCarry on with the run anyway?`))
        return log('■ Launch stopped after the validation check. See the log for each model.'); }

    // 3. Pilot.
    log('▶ Launch 3/5 · Pilot run.'); S.settings.runSize = 'pilot'; syncV5?.(); save(); $('startAll').click(); await waitRun();
    if (globalStop) return log('■ Launch stopped during the pilot.');

    // 4. Cost check before the full run.
    const pr = projectFull(), cap = +S.settings.spendCap || 0, spentNow = spent();
    const costLine = pr.tot > 0 ? `about US$${pr.tot.toFixed(2)} for the full run` : 'cost unknown for some models';
    log(`▶ Launch 4/5 · Pilot done. Spent so far US$${spentNow.toFixed(2)}; projected ${costLine}.`);
    const underCap = cap > 0 && pr.tot > 0 && !pr.missing.length && spentNow + pr.tot <= cap;
    if (!(S.settings.autoFull && underCap) && !confirmV5(`Pilot finished.\nSpent so far: US$${spentNow.toFixed(2)}\nFull run: ${costLine}${cap ? ` (spend cap US$${cap.toFixed(2)})` : ''}.\n\nStart the full run now?`))
      return log('Launch paused after the pilot. Press Launch again when you are ready for the full run.');

    // 5. Full run, then analyse.
    log('▶ Launch 5/5 · Full run.'); S.settings.runSize = 'full'; syncV5?.(); save(); $('startAll').click(); await waitRun();
    if (globalStop) return log('■ Launch stopped during the full run. Press Launch again to carry on.');
    $('analyseAll').click(); showTab('results'); log('■ Launch complete. Results are on page 7.');
  } finally { launching = false; if (btn) btn.disabled = false; S.models.forEach(m => delete m.skip); save(); }
}

function launchInit() {
  const start = $('startAll'); if (start && !$('launchBtn')) { const box = document.createElement('div'); box.className = 'row'; box.style.cssText = 'margin:4px 0 10px;align-items:center';
    box.innerHTML = `<button class="b" id="launchBtn" style="font-size:15px;padding:9px 18px">▶ Launch study</button>
      <label style="font-size:13px"><input type="checkbox" id="autoFull"> Go straight to the full run if the pilot says it fits under my spend cap</label>
      <span class="info" data-tip="One click runs everything in order: (1) a 1-call check per model, so a wrong key or model name is caught before you spend anything; (2) the validation check; (3) the pilot; (4) the cost of the full run, projected from the pilot, for you to confirm; (5) the full run, then the analysis. Press it again after a stop and it carries on where it left off.">i</span>`;
    start.parentElement.parentElement.insertBefore(box, start.parentElement); }
  $('launchBtn').onclick = launchStudy;
  $('autoFull').checked = !!S.settings.autoFull; $('autoFull').onchange = e => { S.settings.autoFull = e.target.checked; save(); };
  const h = $('gHead'); if (h && !$('launchHead')) { const b = document.createElement('button'); b.className = 'b'; b.id = 'launchHead'; b.textContent = '▶ Launch study'; b.onclick = launchStudy; h.appendChild(b); } }
