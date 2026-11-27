"""Position-controlled storefront test (v5.5): runs the one-click demo in a headless browser and checks the new output.

    python tests/poscontrol_test.py
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
    def check(ok, what): res.append(ok); print(('PASS  ' if ok else 'FAIL  ') + what)
    async with async_playwright() as p:
        exe = chrome(); b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--no-sandbox'])
        pg = await (await b.new_context()).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(HTML); await pg.wait_for_timeout(1200); await pg.evaluate("() => tourEnd()")
        await pg.click('#gDemoBtn'); await pg.wait_for_function("() => Object.keys(S.fits||{}).length > 0", timeout=600000); await pg.wait_for_timeout(500)
        r = await pg.evaluate("""() => { document.getElementById('analyseAll').click(); showTab('results'); renderResults();
          const A = Object.values(S.fits).filter(a => a.posctl), c = A[0]?.posctl;
          return { n: A.length, err: c?.error || '', utilB: c?.full?.terms?.[0]?.B, utilP: c?.full?.terms?.[0]?.p, hit: [c?.hitBase, c?.hitFull],
            summary: document.querySelector('#resOut .summary')?.innerText || '', full: (() => { const sel = $('viewSel'), o = [...sel.options].find(x => x.value.startsWith('one|')); sel.value = o.value; renderResults(); return document.getElementById('resOut').innerHTML; })(),
            rows: partRows('posctl').length, parts: PARTS.map(x => x[0]), sps: spssPack().find(f => f[0] === 'spss/analysis.sps')[1].includes('STEP 7b'),
            files: spssPack().map(f => f[0]) }; }""")
        print('models with the test:', r['n'], '| utility B', r['utilB'], 'p', r['utilP'], '| hit', r['hit'], r['err'])
        check(r['n'] > 0 and not r['err'], 'Position-controlled test computed for the demo models')
        check(r['utilB'] is not None and r['utilB'] > 0 and r['utilP'] < .05, 'Locked utility predicts choice with position held constant (simulated data)')
        check('controlled for' in r['summary'], 'Plain-English summary has the position-controlled line')
        check('Position-controlled test' in r['full'], 'Full results show the position-controlled table')
        check('posctl' in r['parts'] and r['rows'] > 0, f"Export part 'posctl' has {r['rows']} rows")
        check(r['sps'], 'SPSS syntax includes STEP 7b')
        check('spss/expected/storefront_position_controlled.csv' in r['files'], 'SPSS pack includes the expected position-controlled numbers')
        check(not errs, 'No page errors' + ('' if not errs else ': ' + '; '.join(errs)))
        await b.close()
    print('RESULT:', 'PASS' if all(res) else 'FAIL'); sys.exit(0 if all(res) else 1)

asyncio.run(main())
