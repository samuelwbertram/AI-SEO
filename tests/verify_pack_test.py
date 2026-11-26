"""Verification-pack test for the LLM Conjoint Lab (no API keys, no cost).

Runs the one-click Demo (simulated models) in a headless browser, downloads the verification pack from page 9,
unzips it and runs the pack's own scripts/verify.py on it. Passes only if every check in the pack passes.

    pip install playwright pandas numpy scipy statsmodels
    python tests/verify_pack_test.py                 # demo run (quick)
    python tests/verify_pack_test.py --launch        # bigger run through the one-click Launch (slower)
    python tests/verify_pack_test.py --keep out.zip  # also keep the downloaded pack
"""
import asyncio, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / 'index.html').as_uri()
LAUNCH = '--launch' in sys.argv
KEEP = sys.argv[sys.argv.index('--keep') + 1] if '--keep' in sys.argv else None

def chrome():
    for c in ('google-chrome', 'chrome', 'chromium', 'chromium-browser'):
        if shutil.which(c): return shutil.which(c)
    return None  # falls back to Playwright's own Chromium (`playwright install chromium`)

async def make_pack(dest: Path):
    async with async_playwright() as p:
        exe = chrome(); b = await p.chromium.launch(**({'executable_path': exe} if exe else {}), args=['--no-sandbox'])
        ctx = await b.new_context(accept_downloads=True); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(HTML); await pg.wait_for_timeout(1200); await pg.evaluate("() => tourEnd()")
        if not LAUNCH:
            await pg.click('#gDemoBtn')
        else:
            await pg.evaluate("() => { S.models=[]; loadStudy3(); S.models=[]; document.getElementById('addSims').click(); S.tasks.storeTrials=300; S.settings.autoFull=true; save(); }")
            await pg.click('#launchHead'); await pg.wait_for_timeout(500); await pg.wait_for_function("() => !launching", timeout=900000)
        await pg.wait_for_function("() => Object.keys(S.fits||{}).length > 0", timeout=600000); await pg.wait_for_timeout(500)
        await pg.evaluate("() => showTab('verify')")
        async with pg.expect_download() as d: await pg.click('#verifyGo')
        await (await d.value).save_as(dest)
        print('Tool says:', await pg.evaluate("() => document.getElementById('verifyMsg').innerText"))
        await b.close(); return errs

def main():
    with tempfile.TemporaryDirectory() as tmp:
        zp = Path(tmp) / 'pack.zip'; errs = asyncio.run(make_pack(zp))
        if KEEP: shutil.copy(zp, KEEP)
        with zipfile.ZipFile(zp) as z: z.extractall(Path(tmp) / 'pack')
        scripts = list((Path(tmp) / 'pack').rglob('scripts/verify.py'))
        if not scripts: print('RESULT: FAIL (no scripts/verify.py in the pack)'); sys.exit(1)
        pack = scripts[0].parent.parent
        r = subprocess.run([sys.executable, '-I', str(scripts[0]), str(pack)], capture_output=True, text=True)
        tail = [l for l in r.stdout.splitlines() if l.startswith('SUMMARY')]
        print(tail[0] if tail else r.stdout[-2000:] + r.stderr[-2000:])
        print('Page errors:', errs or 'none')
        ok = r.returncode == 0 and not errs
        print('RESULT:', 'PASS' if ok else 'FAIL'); sys.exit(0 if ok else 1)

if __name__ == '__main__': main()
