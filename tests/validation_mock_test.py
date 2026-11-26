"""Validation-check test: a mocked Gemini model whose first answer is cut off (then answers correctly when asked again)
and a mocked GPT model that always picks the wrong product. Checks the live Validation panel, the reasons shown and the
CSV download. All API calls are answered locally (no keys, no cost)."""
import asyncio, json
from playwright.async_api import async_playwright
gcalls=[]; ocalls=[]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']); ctx=await b.new_context(viewport={'width':1300,'height':900},accept_downloads=True); pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('dialog',lambda d: asyncio.ensure_future(d.accept()))
        async def g(route):
            body=json.loads(route.request.post_data); gcalls.append(body); n=len(gcalls)
            if n%2==1: resp={'candidates':[{'content':{'parts':[{'text':'{"choice": "E0'}]},'finishReason':'MAX_TOKENS'}]}
            else: resp={'candidates':[{'content':{'parts':[{'text':'{"choice": "E01", "cards": []}'}]},'finishReason':'STOP'}]}
            await route.fulfill(status=200,content_type='application/json',body=json.dumps(resp))
        async def o(route):
            body=json.loads(route.request.post_data); ocalls.append(body)
            await route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':'{"choice":"E05","cards":[]}'},'finish_reason':'stop'}],'usage':{}}))
        await pg.route('https://generativelanguage.googleapis.com/**',g); await pg.route('https://api.openai.com/**',o)
        await pg.goto((__import__('pathlib').Path(__file__).resolve().parent.parent / 'index.html').as_uri()); await pg.wait_for_timeout(1200); await pg.evaluate("()=>tourEnd()")
        
        await pg.evaluate("""()=>{ keys={openai:'x',google:'y'}; loadStudy3(); S.models=[{provider:'google',model:'gemini-3.6-flash',label:'Gemini 3.6 Flash',pin:.3,pout:2.5},{provider:'openai',model:'gpt-4o',label:'GPT-4o',pin:2.5,pout:10}]; S.settings.validationTrials=4; save(); syncAll(); renderKeyStatus(); showTab('run'); renderValidation(); }""")
        await pg.click('#runValidation'); await pg.wait_for_timeout(300)
        
        await pg.wait_for_function("()=>!run.active", timeout=60000); await pg.wait_for_timeout(500)
        await pg.click('#valShowPage'); await pg.wait_for_timeout(400)
        
        async with pg.expect_download() as d: await pg.click('#valCSV')
        f=await (await d.value).path(); print(open(f,encoding='utf-8-sig').read()[:600])
        print('gemini calls', len(gcalls), '| thinkingConfig', gcalls[0]['generationConfig'], )
        print('log:', (await pg.evaluate("()=>document.getElementById('runLog').innerText")).splitlines()[-3:])
        await pg.evaluate("()=>showTab('models')"); 
        print('errors', errs); await b.close()
asyncio.run(main())
