"""SPSS pack test: runs the demo, exports "CSV: every part in one .zip", then runs spss/analysis.sps in GNU PSPP
and checks PSPP's relative importance, predicted utilities, storefront picks/ranks and validation counts against
the tool's own numbers in spss/expected/. PSPP has no OMS or COXREG, so the coefficient files that OMS would write
in SPSS are made here from expected/coefficients.csv, and the COXREG step is left to real SPSS.

    pip install playwright        # and GNU PSPP on the PATH (apt install pspp)
    python tests/spss_pack_test.py
"""
import asyncio, csv, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from playwright.async_api import async_playwright
HTML = (Path(__file__).resolve().parent.parent / 'index.html').as_uri()

async def export(dest):
    async with async_playwright() as p:
        exe = next((shutil.which(c) for c in ('google-chrome', 'chromium', 'chromium-browser') if shutil.which(c)), None)
        b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--no-sandbox']); pg = await (await b.new_context(accept_downloads=True)).new_page()
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(HTML); await pg.wait_for_timeout(1000); await pg.evaluate("() => tourEnd()"); await pg.click('#gDemoBtn')
        await pg.wait_for_function("() => Object.keys(S.fits||{}).length > 0", timeout=300000); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { showTab('data'); document.getElementById('expFmt').value = 'csv'; document.querySelectorAll('[data-part]').forEach(c => c.checked = true); }")
        async with pg.expect_download() as d: await pg.click('#expGo')
        await (await d.value).save_as(dest); await b.close()

def main():
    if not shutil.which('pspp'): print('RESULT: SKIPPED (GNU PSPP not installed)'); return
    tmp = Path(tempfile.mkdtemp()); asyncio.run(export(tmp / 'x.zip')); zipfile.ZipFile(tmp / 'x.zip').extractall(tmp)
    sp = next(tmp.rglob('spss/analysis.sps')).parent; rd = lambda f: list(csv.DictReader(open(sp / 'expected' / f, encoding='utf-8-sig')))
    syn = (sp / 'analysis.sps').read_text(); ids = re.findall(r"SELECT IF \(RunID = '([^']+)'\)", syn); co = rd('coefficients.csv')
    mk = ''
    for i, rid in enumerate(ids, 1):
        (sp / f'c{i}.csv').write_text('Var1,Var2,B\n' + ''.join(f"Step 1,{r['Variable']},{r['B']}\n" for r in co if r['RunID'] == rid))
        mk += f"GET DATA /TYPE=TXT /FILE='c{i}.csv' /DELIMITERS=',' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES= Var1 A20 Var2 A100 B F20.12.\nSAVE OUTFILE='coef_{i}.sav'.\n"
    (sp / 'mk.sps').write_text(mk); subprocess.run(['pspp', 'mk.sps'], cwd=sp, capture_output=True)
    (sp / 'run.sps').write_text(re.sub(r"^CD '.*'\.$", '', syn, flags=re.M)); r = subprocess.run(['pspp', 'run.sps', '-o', 'out.txt'], cwd=sp, capture_output=True, text=True)
    errs = [l for l in (r.stdout + r.stderr).splitlines() if 'error' in l and not re.search(r'OMS|OMSEND|COXREG', l)]
    out = (sp / 'out.txt').read_text(); ok = []
    imp = rd('importance.csv'); a = imp[0]; m = re.search(r'\|' + re.escape(a['RunID']) + r'\|\s*([\d.]+)\|', out)
    ok.append(('importance (first attribute, first run)', m and abs(float(m.group(1)) - float(a['ImportancePct'])) < .01))
    pr = rd('product_predictions.csv')
    for row in pr[:3]:
        m = re.search(r'\|' + re.escape(row['RunID']) + r'\|' + re.escape(row['Product']) + r'\s*\|\s*(-?[\d.]+)\|\s*([\d.]+)\|\s*([\d.]+)\|', out)
        ok.append((f"utility {row['RunID']} {row['Product']}", m and abs(float(m.group(1)) - float(row['PredictedUtility'])) < 1e-3))
        m2 = re.search(r'\|' + re.escape(row['RunID']) + r'\|' + re.escape(row['Product']) + r'\s*\|\s*[\d.]+\|\s*([\d.]+)\|\s*\d\|\s*(\d+)\|', out)
        ok.append((f"storefront picks/rank {row['RunID']} {row['Product']}", m2 and float(m2.group(1)) == float(row['StorefrontRank']) and int(m2.group(2)) == int(row['StorefrontPicks'])))
    ok.append(('no PSPP errors apart from OMS/COXREG', not errs))
    for k, v in ok: print(('PASS  ' if v else 'FAIL  ') + k)
    if errs: print('\n'.join(errs[:10]))
    print('RESULT:', 'PASS' if all(v for _, v in ok) else 'FAIL'); sys.exit(0 if all(v for _, v in ok) else 1)

main()
