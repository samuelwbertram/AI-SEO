"""Consistency test for the LLM Conjoint Lab: same input -> same output (no API keys, no cost).

Checks, in a headless browser:
  1. Design: the same seed gives exactly the same conjoint pairs (generated twice, and in two separate page loads).
  2. Storefront pages: the same seed gives the same shuffled page for every trial.
  3. Analysis: analysing the same saved data twice gives every number identical (all fits, all models).
  4. Summary: the plain-English summary on Results is word-for-word identical both times.
  5. Fresh load: a new page that loads the same saved data and analyses it gives the same numbers and words again.

    pip install playwright
    python tests/consistency_test.py
"""
import asyncio, json, shutil, sys
from pathlib import Path
from playwright.async_api import async_playwright

HTML = (Path(__file__).resolve().parent.parent / 'index.html').as_uri()
GRAB = """() => { document.getElementById('analyseAll').click(); showTab('results'); renderResults();
  return { fits: JSON.stringify(S.fits), summary: document.querySelector('#resOut .summary')?.innerText || '' }; }"""

def chrome():
    for c in ('google-chrome', 'chrome', 'chromium', 'chromium-browser'):
        if shutil.which(c): return shutil.which(c)
    return None

async def page(b):
    pg = await (await b.new_context()).new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(HTML); await pg.wait_for_timeout(1200); await pg.evaluate("() => tourEnd()"); return pg, errs

async def main():
    results = []
    def check(ok, what): results.append(ok); print(('PASS  ' if ok else 'FAIL  ') + what)
    async with async_playwright() as p:
        exe = chrome(); b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--no-sandbox'])
        pg, errs = await page(b)
        d = await pg.evaluate("""() => { loadStudy3(); const a = JSON.stringify(E.pairDesign(S.study.attrs, 500, 20261124));
          const b = JSON.stringify(E.pairDesign(S.study.attrs, 500, 20261124)); const c = JSON.stringify(E.pairDesign(S.study.attrs, 500, 20261125));
          const pages = s => Array.from({length: 50}, (_, t) => E.shuffle(S.val.products, E.rng(s * 100003 + t)).map(p => p.name).join('|')).join('\\n');
          return { a, b, c, p1: pages(20261124), p2: pages(20261124) }; }""")
        check(d['a'] == d['b'], 'Design: same seed gives identical pairs (500 pairs)')
        check(d['a'] != d['c'], 'Design: a different seed gives different pairs (the seed is really used)')
        check(d['p1'] == d['p2'], 'Storefront: same seed gives the same shuffled page for 50 trials')
        await pg.click('#gDemoBtn'); await pg.wait_for_function("() => Object.keys(S.fits||{}).length > 0", timeout=600000); await pg.wait_for_timeout(500)
        r1 = await pg.evaluate(GRAB); r2 = await pg.evaluate(GRAB)
        check(len(r1['summary']) > 200, f"Summary is shown on Results ({len(r1['summary'])} characters)")
        check(r1['fits'] == r2['fits'], f"Analysis: every number identical when analysed twice ({len(r1['fits'])} characters of results)")
        check(r1['summary'] == r2['summary'], 'Summary: word-for-word identical when analysed twice')
        saved = await pg.evaluate("() => JSON.stringify({ study: S.study, val: S.val, models: S.models, conditions: S.conditions, tasks: S.tasks, results: S.results, design: S.design })")
        pg2, errs2 = await page(b)
        await pg2.evaluate("(t) => { Object.assign(S, JSON.parse(t)); syncAll(); }", saved)
        r3 = await pg2.evaluate(GRAB)
        check(r3['fits'] == r1['fits'], 'Fresh page: same saved data gives identical numbers')
        check(r3['summary'] == r1['summary'], 'Fresh page: same saved data gives a word-for-word identical summary')
        check(not errs and not errs2, 'No page errors' + ('' if not errs + errs2 else ': ' + '; '.join(errs + errs2)))
        if '--show' in sys.argv: print('\n--- summary text ---\n' + r1['summary'])
        await b.close()
    print('RESULT:', 'PASS' if all(results) else 'FAIL'); sys.exit(0 if all(results) else 1)

asyncio.run(main())
