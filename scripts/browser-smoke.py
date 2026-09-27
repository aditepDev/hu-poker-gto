"""UX acceptance, Chromium. CI runs HTTP at a Pages-style subpath.
INLINE_BROWSER=1 is a restricted-runtime fallback; it cannot test persistent storage.
Test-only dependency: playwright==1.57.0. No browser tooling is shipped.
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

def choose(page,ident,mode=None):
    page.locator('#open-settings').click()
    page.locator('#scenario').select_option(ident)
    if mode:page.locator('#mode').select_option(mode)
    page.locator('#load-scenario').click()
    page.wait_for_function('!document.querySelector("#settings-dialog").open')
    page.wait_for_function('document.body.dataset.turn === "hero"')

def change_mode(page,mode):
    page.locator('#open-settings').click();page.locator('#mode').select_option(mode)
    page.locator('#settings-dialog [data-close]').click()

def settle(page):
    for _ in range(100):
        page.wait_for_function("document.body.dataset.turn !== 'bot'")
        if page.locator('body').get_attribute('data-turn')=='complete':return
        page.locator('[data-kind="call"], [data-kind="check"]').first.click()
        page.locator('#confirm').click()
    raise AssertionError('Hand did not finish')

def inside(page,selector):
    return page.locator(selector).evaluate('''el=>{
      const r=el.getBoundingClientRect();
      if(r.width<=0||r.height<=0||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)return false;
      for(let p=el.parentElement;p;p=p.parentElement){
        if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){
          const b=p.getBoundingClientRect();if(r.top<b.top-1||r.bottom>b.bottom+1)return false;
        }
      }return true;
    }''')

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
        page.on('dialog',lambda d:d.accept())
        load(page)
        assert page.locator('.seat').count()==6
        assert page.locator('#hero-cards .playing-card').count()==2,'Hero must render two real card faces'
        assert page.locator('.seat.hero .playing-card').count()==2,'Hero seat must show two compact card faces'
        assert page.locator('.seat:not(.hero):not(.folded) .card-back').count()>=2,'Hidden opponents use card backs'
        assert page.locator('#settings-dialog').is_hidden()
        assert page.locator('#review-dialog').is_hidden()
        assert page.locator('#pot').inner_text()=='6.5 BB'
        assert page.locator('#call').inner_text()=='1.5 BB'
        assert 'HJ' in page.locator('#context-summary').inner_text() and 'BTN' in page.locator('#context-summary').inner_text()
        page.locator('[data-kind="call"]').click()
        assert page.locator('#pot').inner_text()=='6.5 BB','Preview must not commit'
        assert '97.5 BB' in page.locator('#planner').inner_text() and '8 BB' in page.locator('#planner').inner_text()
        # A quiz must actually remove the answer from the visible UI before asking.
        page.locator('#math-details summary').click()
        page.wait_for_function('document.querySelectorAll("#planner .plan-cell").length===0')
        assert page.locator('#advanced-plan').is_hidden()
        page.locator('#math-answer').fill('8');page.locator('#math-check').click()
        assert 'คำนวณถูก' in page.locator('#math-feedback').inner_text()
        assert page.locator('#math-check').is_disabled()
        assert page.locator('#planner .plan-cell').count()==3
        page.locator('#confirm').click()
        assert page.locator('#confirm').is_disabled()
        assert page.locator('#confirm').inner_text()=='เลือกการเล่นก่อน','No stale Call label on new street'
        assert page.locator('#street').inner_text()=='FLOP'
        # Both repeated confirmation and rapid next-street selection are ignored.
        count=page.locator('#decisions-count').text_content()
        page.locator('#confirm').dispatch_event('click',{'detail':2})
        page.locator('[data-kind="check"]').dispatch_event('click',{'detail':2})
        assert page.locator('#decisions-count').text_content()==count
        assert page.locator('#confirm').is_disabled()
        choose(page,'bb-open-call')
        page.locator('[data-kind="raise"]').click();page.locator('#raise-to').fill('10')
        assert page.locator('#choose-size').count()==0,'No redundant size submit'
        assert '15.5 BB' in page.locator('#planner').inner_text()
        assert '9 BB' in page.locator('#planner').inner_text()
        assert '10 BB' in page.locator('#confirm').inner_text()
        page.locator('#advanced-plan summary').click()
        assert '30.5 BB' in page.locator('#conditional').inner_text()
        page.locator('#callers').select_option('1');assert '23 BB' in page.locator('#conditional').inner_text()
        for bad in ['1','100.01','10.005','']:
            page.locator('#raise-to').fill(bad);assert page.locator('#confirm').is_disabled(),bad
            assert page.locator('#size-error').is_visible()
        page.locator('#all-in').click();assert '100 BB' in page.locator('#confirm').inner_text()
        assert page.locator('#pot').inner_text()=='6.5 BB','All-in also requires confirmation'
        choose(page,'flop-multi')
        assert 'BB' in page.locator('#waiting').inner_text()
        page.locator('[data-kind="raise"]').click()
        assert 'BB, CO' in page.locator('#waiting').inner_text(),'Waiting order must go clockwise from hero'
        choose(page,'bb-3bet','practice')
        page.locator('[data-kind="call"]').click();assert page.locator('#planner .plan-cell').count()==0
        page.locator('#reveal').click();assert page.locator('#planner .plan-cell').count()==3
        change_mode(page,'shadow');page.locator('#confirm').click()
        page.locator('#open-review').click()
        frozen=page.locator('#action-history .history-row').count();page.wait_for_timeout(500)
        assert page.locator('#action-history .history-row').count()==frozen,'Dialog must pause bots'
        assert 'จบมือ' in page.locator('#review').inner_text()
        assert page.locator('#brief-review').is_hidden()
        assert page.locator('#planner .plan-cell').count()==0
        assert page.locator('#recent').evaluate('el=>el.parentElement.hidden')
        page.keyboard.press('Escape');assert page.locator('#review-dialog').is_hidden()
        choose(page,'btn-unopened','learn');page.wait_for_timeout(500)
        assert page.locator('#action-history .history-row').count()==3,'Old bot must not mutate new scenario'
        # Speed animation only after testing the production double-tap guard.
        page.evaluate('window.originalTimeout=window.setTimeout;window.setTimeout=(f,t,...a)=>window.originalTimeout(f,Math.min(t,15),...a)')
        ids=page.locator('#scenario option').evaluate_all('(xs)=>xs.map(x=>x.value).filter(x=>x!=="mixed")')
        for ident in ids:
            choose(page,ident);settle(page)
            assert page.locator('#hand-result').is_visible()
            assert page.locator('#next').is_visible()
            assert page.locator('#error').is_hidden()
        choose(page,'flop-ip');cards=page.locator('#hero-cards').inner_text();board=page.locator('#board').inner_text()
        page.locator('#open-settings').click();page.locator('#settings-dialog details summary').click();page.locator('[data-replay]').click()
        assert page.locator('#hero-cards').inner_text()==cards and page.locator('#board').inner_text()==board
        # Normal phone: ten consecutive decisions without scrolling to find actions.
        page.set_viewport_size({'width':390,'height':844})
        for i in range(10):
            choose(page,'flop-ip' if i%2 else 'bb-open-call')
            passive=page.locator('[data-kind="call"], [data-kind="check"]').first
            assert inside(page,'#hero-cards') and inside(page,'#board')
            passive.click()
            assert inside(page,'#confirm'),'Confirm must be on screen without scrolling'
            page.locator('#confirm').click()
        # Responsive coverage, including narrow phones and shorter heights.
        for width,height in [(320,720),(390,844),(768,1000),(1366,1000)]:
            page.set_viewport_size({'width':width,'height':height});choose(page,'bb-open-call')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'overflow at {width}'
            assert inside(page,'#hero-cards')
            page.locator('[data-kind="raise"]').click();page.locator('#raise-to').fill('10')
            assert page.locator('#confirm').is_enabled()
            assert page.locator('[data-kind="call"]').evaluate('el=>el.getBoundingClientRect().height>=48')
            page.locator('#confirm').scroll_into_view_if_needed()
            assert inside(page,'#confirm'),f'cannot reach confirm at {width}'
        page.set_viewport_size({'width':390,'height':844});choose(page,'flop-ip')
        page.locator('[data-kind="raise"]').click();page.locator('#raise-to').fill('5')
        assert inside(page,'#board'),'Raise panel must not cover community cards on normal phone'
        if os.environ.get('SCREENSHOT_DIR'):
            out=Path(os.environ['SCREENSHOT_DIR']);out.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(out/'poker-mobile-v2.1.png'))
            page.set_viewport_size({'width':1366,'height':1000});page.screenshot(path=str(out/'poker-desktop-v2.1.png'),full_page=True)
        # Reduced viewport models keyboard space, not an actual iOS keyboard test.
        page.set_viewport_size({'width':390,'height':520})
        page.locator('#raise-to').fill('6');page.locator('#raise-to').scroll_into_view_if_needed()
        assert inside(page,'#raise-to')
        page.locator('#confirm').scroll_into_view_if_needed();assert inside(page,'#confirm')
        if not INLINE:
            count=page.locator('#hands-count').text_content();skips=page.locator('#skipped-count').text_content()
            change_mode(page,'practice');page.reload()
            assert page.locator('#hands-count').text_content()==count
            assert page.locator('#skipped-count').text_content()==skips
            assert page.locator('#mode').input_value()=='practice'
        load(page,legacy=True);page.locator('#deal').click()
        assert page.locator('#action-buttons button').count()>1,'Legacy HU remains playable'
        assert not errors,errors
        print(json.dumps({'status':'PASS','scenarios_completed':len(ids),'mobile_decisions_without_action_scroll':10,
            'viewports':[[320,720],[390,844],[768,1000],[1366,1000],[390,520]],
            'coverage':['hole-card faces/pips','BB arithmetic','live size preview','input validation','quiz answer privacy','shadow privacy','dialogs pause bots','double-tap guard','pending actor order','skip tracking','replay','HU regression'],
            'transport':'inline ESM + CSS; persistence not tested' if INLINE else 'HTTP Pages subpath + persistent storage',
            'page_errors':errors},ensure_ascii=False))
        browser.close()
finally:
    if server:server.terminate();server.wait(timeout=5)
