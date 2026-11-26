"""Run-flow test with a mocked Gemini model (no keys): validation runs first on Start / resume, pilot banner and alert,
prices re-cost past calls, validation history, every export part per model, and code names for found products."""
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']); ctx=await b.new_context(viewport={'width':1300,'height':900}); pg=await ctx.new_page(); errs=[]; dl=[]
        pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: (dl.append(d.message[:80]), asyncio.ensure_future(d.accept())))
        n=[0]
        async def g(route):
            body=json.loads(route.request.post_data); n[0]+=1
            txt=body['contents'][0]['parts'][0]['text']
            if 'Rank the following' in txt: out='RANKING: E01 | E02\nJSON: ["E01","E02"]\nREASONING: x'
            elif 'compare' in txt.lower() or 'prefer' in txt.lower(): out='ANSWER: first REASON: x'
            else: out='{"choice":"E01","cards":[]}'
            await route.fulfill(status=200,content_type='application/json',body=json.dumps({'candidates':[{'content':{'parts':[{'text':out}]},'finishReason':'STOP'}],'usageMetadata':{'promptTokenCount':1000,'candidatesTokenCount':100}}))
        await pg.route('https://generativelanguage.googleapis.com/**',g)
        await pg.goto((__import__('pathlib').Path(__file__).resolve().parent.parent / 'index.html').as_uri()); await pg.wait_for_timeout(1200); await pg.evaluate("()=>tourEnd()")
        await pg.evaluate("""()=>{ keys={google:'y'}; loadStudy3(); S.models=[{provider:'google',model:'gemini-2.5-flash-lite',label:'Gemini 2.5 Flash-Lite'}]; S.settings.validationTrials=3; S.settings.pilotPairs=5; S.settings.pilotRanks=2; S.settings.pilotTrials=4; S.settings.runSize='pilot'; save(); syncAll(); showTab('models'); }""")
        
        print('rank prompt:', (await pg.evaluate("()=>E.rankingPrompt(S.val.products, showHeaders())")).splitlines()[0])
        await pg.evaluate("()=>showTab('run')")
        await pg.click('#startAll'); await pg.wait_for_timeout(500)
        await pg.wait_for_function("()=>!run.active && document.getElementById('runBanner').innerText.length>0", timeout=60000); await pg.wait_for_timeout(400)
        print('dialogs', dl); print('banner:', await pg.evaluate("()=>document.getElementById('runBanner').innerText.replace(/\\s+/g,' ')"))
        print('title:', await pg.title()); print('spend:', await pg.evaluate("()=>spent()"))
        
        # set a price later -> recost
        await pg.evaluate("()=>showTab('models')"); await pg.fill('[data-pin="0"]','0.1'); await pg.press('[data-pin="0"]','Tab'); await pg.fill('[data-pout="0"]','0.4'); await pg.press('[data-pout="0"]','Tab')
        print('spend after price:', await pg.evaluate("()=>spent().toFixed(5)"))
        # second validation -> history
        await pg.evaluate("()=>showTab('run')"); await pg.click('#runValidation'); await pg.wait_for_function("()=>!run.active", timeout=60000)
        await pg.evaluate("()=>{ document.getElementById('analyseAll').click(); showTab('data'); }"); await pg.wait_for_timeout(300)
        parts=await pg.evaluate("()=>PARTS.map(p=>p[0])"); 
        print('model select:', await pg.evaluate("()=>[...document.querySelectorAll('#expModel option')].map(o=>o.text)"))
        print({k: await pg.evaluate(f"()=>partRows('{k}').length") for k in parts if k!='spss'})
        print('valsummary:', await pg.evaluate("()=>validationSummaryRows()"))
        # code names
        print('codes:', await pg.evaluate("()=>{ const c=codeNames([{name:'Kobo Clara BW',display:{Price:'$129'},source:'http://x'}]); addProducts(c); const p=S.val.products.at(-1); return [p.name,p.display['Brand and model'],p.source, showHeaders().includes('Brand and model')] }"))
        print('errors', errs); await b.close()
asyncio.run(main())
