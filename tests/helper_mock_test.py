"""Product-finder helper test: dropdown follows the keys entered, and each provider (Anthropic, OpenAI, Google, OpenRouter)
is called with its own web-search tool. All API calls are intercepted and answered locally (no keys, no cost)."""
import asyncio, json
from playwright.async_api import async_playwright
calls=[]
REPLY='{"products":[{"name":"Kobo Clara BW","url":"https://kobo.com","attributes":{"Price":"$129"}}]}'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox']); pg=await (await b.new_context()).new_page(); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        async def handle(route):
            u=route.request.url; body=json.loads(route.request.post_data or '{}'); calls.append((u.split('?')[0],body))
            if 'anthropic' in u: resp={'content':[{'type':'text','text':REPLY}],'stop_reason':'end_turn'}
            elif 'openai.com/v1/responses' in u: resp={'output':[{'type':'web_search_call'},{'type':'message','content':[{'type':'output_text','text':REPLY}]}]}
            elif 'generativelanguage' in u: resp={'candidates':[{'content':{'parts':[{'text':REPLY}]}}]}
            else: resp={'choices':[{'message':{'content':REPLY}}]}
            await route.fulfill(status=200,content_type='application/json',body=json.dumps(resp))
        for host in ['https://api.anthropic.com/**','https://api.openai.com/**','https://generativelanguage.googleapis.com/**','https://openrouter.ai/**']: await pg.route(host,handle)
        await pg.goto((__import__('pathlib').Path(__file__).resolve().parent.parent / 'index.html').as_uri()); await pg.wait_for_timeout(1000); await pg.evaluate("()=>tourEnd()")
        opts=lambda: pg.evaluate("()=>[...document.querySelectorAll('#assistSel option')].map(o=>o.textContent)")
        print('no keys:', await opts(), '| search disabled:', await pg.evaluate("()=>document.getElementById('findGo').disabled"))
        await pg.evaluate("()=>showTab('models')")
        await pg.fill('[data-key=openai]','test-openai'); await pg.fill('[data-key=google]','test-google')
        print('openai+google:', await opts(), '| selected:', await pg.evaluate("()=>S.settings.assistModel"))
        await pg.evaluate("()=>{showTab('products'); document.getElementById('ptab-find').style.display='block'}")
        for val in ['openai|gpt-6.2-astra','google|gemini-3.7-flash']:
            await pg.select_option('#assistSel', val)
            out=await pg.evaluate("async()=>{ loadStudy3(); return parseFound(await helperCall('find', true)).map(p=>p.name) }")
            u,bd=calls[-1]; print(val,'->',u,'| tools:',bd.get('tools'),'| parsed:',out)
        await pg.evaluate("()=>showTab('models')"); await pg.fill('[data-key=anthropic]','test-ant')
        await pg.evaluate("()=>{showTab('products'); document.getElementById('ptab-find').style.display='block'}")
        print('+anthropic:', await opts())
        await pg.select_option('#assistSel','anthropic|claude-opus-5-5')
        out=await pg.evaluate("async()=>parseFound(await helperCall('find', true)).map(p=>p.name)"); print('anthropic ->',calls[-1][0],calls[-1][1]['model'],out)
        await pg.select_option('#assistSel','other|'); await pg.fill('#assistModel','gemini-3.5-flash-lite')
        out=await pg.evaluate("async()=>parseFound(await helperCall('find', false)).map(p=>p.name)"); print('other gemini ->',calls[-1][0].split('/models/')[-1],out)
        await pg.fill('#assistModel','openai/gpt-6.2-sol')
        r=await pg.evaluate("async()=>{try{await helperCall('x',false)}catch(e){return e.message}}"); print('openrouter id without key ->',r)
        await pg.reload(); await pg.wait_for_timeout(800); await pg.evaluate("()=>tourEnd()")
        print('after reload selected:', await pg.evaluate("()=>[document.getElementById('assistSel').value, document.getElementById('assistModel').value]"))
        print('errors',errs); await b.close()
asyncio.run(main())
