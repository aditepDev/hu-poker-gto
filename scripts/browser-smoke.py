"""Browser acceptance checks. CI uses HTTP; restricted local runs use INLINE_BROWSER=1.
Install test-only dependency: python -m pip install playwright==1.57.0
"""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
INLINE=os.environ.get('INLINE_BROWSER')=='1'
BASE='http://127.0.0.1:4184/hu-poker-gto/'
server=None
modules={}
def module(path):
    path=path.resolve()
    if path not in modules:
        js=re.sub(r"from (['\"])([^'\"]+)\1",lambda m:'from '+repr(module(path.parent/m[2])),path.read_text())
        modules[path]='data:text/javascript;base64,'+base64.b64encode(js.encode()).decode()
    return modules[path]

def load(page,legacy=False):
    if INLINE:
        page.goto('about:blank')
        html=(ROOT/('hu.html' if legacy else 'index.html')).read_text()
        html=re.sub(r'<script[\s\S]*?</script>|<link[^>]+>','',html)
        page.set_content(html)
        page.add_style_tag(content=(ROOT/('styles.css' if legacy else 'practice.css')).read_text())
        page.evaluate('(url)=>import(url)',module(ROOT/('src/app.js' if legacy else 'src/practice/app.js')))
    else:
        page.goto(BASE+('hu.html' if legacy else '?scenario=bb-open-call&seed=42'))
    if not legacy:page.wait_for_selector('body[data-turn="hero"]')

def settle(page):
    for _ in range(100):
        page.wait_for_function("document.body.dataset.turn !== 'bot'")
        if page.locator('body').get_attribute('data-turn')=='complete':return
        passive=page.locator('[data-kind="call"], [data-kind="check"]').first
        passive.click();page.locator('#confirm').click()
    raise AssertionError('Hand did not finish')

try:
    if not INLINE:
        server=subprocess.Popen(['node','scripts/server.mjs'],cwd=ROOT,env={**os.environ,'PORT':'4184','BASE_PATH':'/hu-poker-gto'},stdout=subprocess.DEVNULL)
        time.sleep(.7)
    with sync_playwright() as p:
        opts={'headless':True}
        if os.environ.get('CHROME_PATH'):opts['executable_path']=os.environ['CHROME_PATH']
        browser=p.chromium.launch(**opts)
        page=browser.new_page(viewport={'width':1366,'height':1000})
        page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        load(page)
        assert page.locator('.seat').count()==6
        assert page.locator('#pot').inner_text()=='6.5 BB'
        assert page.locator('#call').inner_text()=='1.5 BB'
        page.locator('[data-kind="call"]').click()
        assert page.locator('#pot').inner_text()=='6.5 BB','Selecting is not committing'
        assert '97.5 BB' in page.locator('#planner').inner_text()
        assert '8 BB' in page.locator('#planner').inner_text()
        page.locator('#math-details summary').click();page.locator('#math-answer').fill('8');page.locator('#math-check').click()
        assert 'คำนวณถูก' in page.locator('#math-feedback').inner_text()
        assert page.locator('#math-check').is_disabled()
        page.locator('#confirm').click()
        assert page.locator('#street').inner_text()=='FLOP'
        assert page.locator('body').get_attribute('data-turn')=='hero'
        assert page.locator('#confirm').is_disabled()
        page.locator('#scenario').select_option('bb-open-call')
        page.locator('[data-kind="raise"]').click();page.locator('#raise-to').fill('10')
        assert '15.5 BB' in page.locator('#planner').inner_text()
        assert '30.5 BB' in page.locator('#conditional').inner_text()
        page.locator('#callers').select_option('1');assert '23 BB' in page.locator('#conditional').inner_text()
        page.locator('#raise-to').fill('1');assert page.locator('#confirm').is_disabled()
        page.locator('#scenario').select_option('bb-3bet');page.locator('#mode').select_option('practice')
        page.locator('[data-kind="call"]').click();assert page.locator('#planner .plan-cell').count()==0
        page.locator('#reveal').click();assert page.locator('#planner .plan-cell').count()==3
        page.locator('#mode').select_option('shadow');page.locator('#pause').click();page.locator('#confirm').click()
        assert 'จบมือ' in page.locator('#review').inner_text()
        assert page.locator('#planner .plan-cell').count()==0
        assert not page.locator('#recent').is_visible()
        # Pending bot callback from the old hand must not mutate a new scenario.
        page.locator('#pause').click();page.locator('#scenario').select_option('btn-unopened')
        time.sleep(.6)
        assert page.locator('#action-history .history-row').count()==3
        assert page.locator('body').get_attribute('data-turn')=='hero'
        # Speed up bot animation only for test throughput, not game logic.
        page.evaluate("window.originalTimeout=window.setTimeout;window.setTimeout=(f,t,...a)=>window.originalTimeout(f,Math.min(t,10),...a)")
        ids=page.locator('#scenario option').evaluate_all('(xs)=>xs.map(x=>x.value).filter(x=>x!=="mixed")')
        page.locator('#mode').select_option('learn')
        for ident in ids:
            page.locator('#scenario').select_option(ident);settle(page)
            assert page.locator('#hand-result').is_visible()
            assert page.locator('#error').is_hidden()
        # Deterministic replay retains the same cards and original prefix.
        page.locator('#scenario').select_option('flop-ip')
        cards=page.locator('#hero-cards').inner_text();board=page.locator('#board').inner_text()
        page.locator('#replay').click()
        assert page.locator('#hero-cards').inner_text()==cards
        assert page.locator('#board').inner_text()==board
        for width in [320,390,768,1366]:
            page.set_viewport_size({'width':width,'height':900})
            assert not page.evaluate('document.documentElement.scrollWidth>window.innerWidth'),f'overflow at {width}'
            assert page.locator('[data-kind="check"]').is_visible()
        if not INLINE:
            count=page.locator('#hands-count').inner_text();page.reload()
            assert page.locator('#hands-count').inner_text()==count,'Progress survives reload'
        load(page,legacy=True);page.locator('#deal').click()
        assert page.locator('#action-buttons button').count()>1,'Legacy HU remains playable'
        assert not errors,errors
        print(json.dumps({'status':'PASS','scenarios_completed':len(ids),'viewports':[320,390,768,1366],
          'coverage':['call/raise math','minimum size validation','calculation exercise','hide/reveal aids','shadow privacy','timer reset','deterministic replay','HU regression'],
          'transport':'inline ESM + CSS (no network navigation)' if INLINE else 'HTTP subpath + persistent browser storage','page_errors':errors},ensure_ascii=False))
        browser.close()
finally:
    if server:server.terminate();server.wait(timeout=5)
