"""Shopper brief module (v5.5): headless-browser test with a simulated model (no API calls, no cost).

The simulated model weights the attributes a brief targets 3x, so the tool should find: the targeted attribute's
importance rises; the not-mentioned attributes shrink in proportion (no reshuffle); the brief's conjoint predicts
the brief rankings better than the baseline conjoint. Also checks the brief reaches the prompt, never reaches the
validation check, and appears in Results, Export and SPSS.

    python tests/brief_test.py
"""
import asyncio, shutil, sys
from pathlib import Path
from playwright.async_api import async_playwright

HTML = (Path(__file__).resolve().parent.parent / 'index.html').as_uri()

def chrome():
    for c in ('google-chrome', 'chrome', 'chromium', 'chromium-browser'):
        if shutil.which(c): return shutil.which(c)
    return None

async def main():
    res = []
    def check(ok, what): res.append(bool(ok)); print(('PASS  ' if ok else 'FAIL  ') + what)
    async with async_playwright() as p:
        exe = chrome(); b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--no-sandbox'])
        pg = await (await b.new_context()).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(HTML); await pg.wait_for_timeout(1200); await pg.evaluate("() => tourEnd()")
        setup = await pg.evaluate("""() => { S.models = []; loadStudy3(); S.models = []; addModel('sim', 'sim-11', 'Simulated A');
          Object.assign(S.settings, { runSize: 'pilot', pilotPairs: 500, pilotRanks: 12, pilotTrials: 60, validationTrials: 4, spendCap: 0 });
          S.conditions = [{ id: 'c1', label: 'Default', temperature: '' }]; save(); syncAll(); showTab('models');
          document.getElementById('addBriefEx').click();
          const n = S.conditions.length; S.conditions = [S.conditions[0], S.conditions.find(c => c.label === 'Brief: storage and battery'), S.conditions.find(c => c.label === 'Brief: pink')];
          S.conditions[1].briefStore = true; save(); renderConds();
          return { added: n - 1, editor: !!document.getElementById('briefEd'), rows: document.querySelectorAll('.briefrow').length, labels: S.conditions.map(c => c.label) }; }""")
        print(setup)
        check(setup['added'] == 8 and setup['rows'] == 2, 'Page 4: example briefs added (8) and the brief editor shows the kept briefs')
        # capture prompts the model receives
        await pg.evaluate("""() => { window.__seen = []; const _cm = callModel; callModel = function (u, prompt, image, simTask, o) { window.__seen.push({ c: u.c.label, type: simTask?.type, st: run.stats?.[u.key]?.status, prompt, targets: simTask?.briefTargets || null }); return _cm(u, prompt, image, simTask, o); }; }""")
        await pg.evaluate("async () => { showTab('run'); await runValidation(); }")
        await pg.evaluate("async () => { $('startAll').click(); await new Promise(r => setTimeout(r, 300)); while (run.active) await new Promise(r => setTimeout(r, 300)); }")
        seen = await pg.evaluate("""() => { const B = 'Find me the best everyday e-reader with lots of storage and good battery life.';
          const s = window.__seen, of = (c, t) => s.filter(x => x.c === c && x.type === t);
          return { valBrief: s.filter(x => x.st === 'validation' && x.prompt.includes(B)).length, valN: s.filter(x => x.st === 'validation').length,
            conjBrief: of('Brief: storage and battery', 'conjoint').filter(x => x.prompt.startsWith(B)).length, conjN: of('Brief: storage and battery', 'conjoint').length,
            rankBrief: of('Brief: storage and battery', 'ranking').filter(x => x.prompt.startsWith(B)).length,
            storeBrief: of('Brief: storage and battery', 'store').filter(x => x.st !== 'validation' && x.prompt.startsWith(B)).length,
            pinkStore: of('Brief: pink', 'store').filter(x => x.st !== 'validation' && x.prompt.includes('pink')).length,
            baseClean: of('Default', 'conjoint').every(x => !x.prompt.includes('e-reader with lots of storage')), targets: of('Brief: storage and battery', 'conjoint')[0]?.targets }; }""")
        print(seen)
        check(seen['valN'] > 0 and seen['valBrief'] == 0, 'Validation check never includes the brief')
        check(seen['conjN'] > 0 and seen['conjBrief'] == seen['conjN'], 'Every conjoint prompt under the brief starts with the brief')
        check(seen['rankBrief'] > 0, 'Ranking prompts under the brief start with the brief')
        check(seen['storeBrief'] > 0 and seen['pinkStore'] == 0, 'Storefront gets the brief only when ticked')
        check(seen['baseClean'], 'Baseline prompts have no brief')
        r = await pg.evaluate("""() => { $('analyseAll').click(); showTab('results'); renderResults(); const BA = briefAnalysis(), sb = BA.find(b => b.brief === 'Brief: storage and battery'), pk = BA.find(b => b.brief === 'Brief: pink');
          const imp = a => sb.imp.find(x => x.attr === a);
          return { n: BA.length, err: BA.map(b => b.error || ''), stor: [imp('Storage').base, imp('Storage').brief], batt: [imp('Battery life').base, imp('Battery life').brief], resh: sb.reshuffle, prop: sb.prop, rank: sb.rank && { n: sb.rank.n, b: sb.rank.rhoBrief, a: sb.rank.rhoBase, p: sb.rank.test.p },
            store: sb.store && { n: sb.store.n, hb: sb.store.brief.hit, ha: sb.store.base.hit }, pinkProp: pk.prop, pinkTargets: pk.targets,
            html: document.getElementById('resOut').innerHTML.includes('Shopper briefs: how each brief moves relative importance'),
            ex: [partRows('briefs').length, partRows('briefw').length, partRows('briefsum').length], sps: spssPack().find(f => f[0] === 'spss/analysis.sps')[1], files: spssPack().map(f => f[0]),
            exportPrompt: partRows('conjoint').filter(o => o.Condition === 'Brief: storage and battery').every(o => String(o.Prompt).startsWith('Find me the best')) }; }""")
        print({k: v for k, v in r.items() if k != 'sps'})
        check(not any(r['err']), 'Both briefs analysed against the baseline')
        check(r['stor'][1] > r['stor'][0] + 5 and r['batt'][1] > r['batt'][0] + 5, f"Q1: targeted importance rose (storage {r['stor'][0]:.1f}→{r['stor'][1]:.1f}, battery {r['batt'][0]:.1f}→{r['batt'][1]:.1f})")
        check(r['prop'] and r['prop']['p'] > .01 and r['prop']['lambda'] > 0, f"Q2: simulated shift is proportional, so the test does not reject (p = {r['prop']['p']:.3f}, lambda {r['prop']['lambda']:.2f}, reshuffle {r['resh']:.1f})")
        check(r['pinkProp'] and r['pinkTargets'] == [] and r['pinkProp']['p'] > .01, 'Q2: off-list brief (pink) tests all attributes; no reshuffle in the simulation')
        check(r['rank'] and r['rank']['b'] >= r['rank']['a'], f"Q3: brief conjoint fits the brief rankings at least as well (rho {r['rank']['b']:.2f} vs {r['rank']['a']:.2f})")
        check(r['store'] and r['store']['n'] >= 20, 'Q3: storefront comparison computed for the brief with the storefront ticked')
        check(r['html'], 'Results page shows the Shopper briefs card')
        check(all(x > 0 for x in r['ex']), f"Export parts have rows {r['ex']}")
        check('STEP 10. Shopper briefs' in r['sps'] and 'i_Storage' in r['sps'], 'SPSS syntax has the brief interaction step')
        check('spss/expected/brief_summary.csv' in r['files'], 'SPSS pack has the expected brief numbers')
        check(r['exportPrompt'], 'Conjoint export Prompt column includes the brief')
        check(not errs, 'No page errors' + ('' if not errs else ': ' + '; '.join(errs)))
        await b.close()
    print('RESULT:', 'PASS' if all(res) else 'FAIL'); sys.exit(0 if all(res) else 1)

asyncio.run(main())
