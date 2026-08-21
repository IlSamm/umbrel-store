import base64
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request

import websocket


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "feature-qa"
OUT.mkdir(parents=True, exist_ok=True)
SERVER_PORT = 8775
DEBUG_PORT = 9235
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def read_json(url):
    with urllib.request.urlopen(url, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


with tempfile.TemporaryDirectory(prefix="gestore-feature-qa-") as temp_root:
    temp_path = pathlib.Path(temp_root)
    env = os.environ.copy()
    env["GESTORE_DATA_DIR"] = str(temp_path / "data")
    server = subprocess.Popen(
        ["python", str(ROOT / "app" / "backend" / "server.py"), "--host", "127.0.0.1", "--port", str(SERVER_PORT)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    chrome = None
    try:
        for _ in range(60):
            try:
                read_json(f"http://127.0.0.1:{SERVER_PORT}/api/ping")
                break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("Server GestOre non disponibile")

        chrome = subprocess.Popen(
            [
                str(CHROME),
                "--headless=new",
                f"--remote-debugging-port={DEBUG_PORT}",
                "--remote-allow-origins=*",
                f"--user-data-dir={temp_path / 'chrome-profile'}",
                "--window-size=393,852",
                "--force-device-scale-factor=1",
                "--disable-gpu",
                "--disable-extensions",
                "--no-first-run",
                "--no-default-browser-check",
                "about:blank",
            ],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        targets = None
        for _ in range(60):
            try:
                targets = read_json(f"http://127.0.0.1:{DEBUG_PORT}/json/list")
                if targets:
                    break
            except Exception:
                time.sleep(0.1)
        if not targets:
            raise RuntimeError("Chrome DevTools non disponibile")

        target = next(item for item in targets if item.get("type") == "page")
        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=8)
        command_id = 0

        def call(method, params=None):
            nonlocal_holder = None
            del nonlocal_holder
            global command_id
            command_id += 1
            current_id = command_id
            ws.send(json.dumps({"id": current_id, "method": method, "params": params or {}}))
            while True:
                message = json.loads(ws.recv())
                if message.get("id") == current_id:
                    if "error" in message:
                        raise RuntimeError(f"{method}: {message['error']}")
                    return message.get("result", {})

        def evaluate(expression, await_promise=False):
            result = call(
                "Runtime.evaluate",
                {
                    "expression": expression,
                    "awaitPromise": await_promise,
                    "returnByValue": True,
                    "userGesture": True,
                },
            )
            remote = result.get("result", {})
            if remote.get("subtype") == "error":
                raise RuntimeError(remote.get("description") or remote.get("value"))
            return remote.get("value")

        def screenshot(name):
            data = call(
                "Page.captureScreenshot",
                {"format": "png", "captureBeyondViewport": True, "fromSurface": True},
            )["data"]
            (OUT / name).write_bytes(base64.b64decode(data))

        call("Page.enable")
        call("Runtime.enable")
        call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": 393,
                "height": 852,
                "deviceScaleFactor": 1,
                "mobile": True,
                "screenWidth": 393,
                "screenHeight": 852,
            },
        )
        call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=features"})

        for _ in range(80):
            if evaluate("!!document.querySelector('[data-account-form=register]')"):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("Registrazione non disponibile")

        evaluate(
            """(async function(){
              var form=document.querySelector('[data-account-form=register]');
              form.querySelector('[name=username]').value='featureqa';
              form.querySelector('[name=password]').value='password-qa-2026';
              form.querySelector('[name=confirmPassword]').value='password-qa-2026';
              await submitAccountRegistration(form);
              return true;
            })()"""
            , await_promise=True
        )
        for _ in range(100):
            try:
                authenticated = evaluate("typeof state!=='undefined' && state.account.authenticated && !document.querySelector('.account-gate')")
            except RuntimeError:
                authenticated = False
            if authenticated:
                break
            time.sleep(0.12)
        else:
            raise RuntimeError("Accesso QA non completato")
        for _ in range(80):
            splash_hidden = evaluate("!document.querySelector('.go-splash-screen:not(.hidden)')")
            if splash_hidden:
                break
            time.sleep(0.1)
        if not splash_hidden:
            raise RuntimeError("Splash QA ancora visibile")
        time.sleep(0.2)

        default_home = evaluate(
            """(function(){
              state.activeTab='home';
              state.settings.timerEnabled=false;
              state.settingsDraft.timerEnabled=false;
              render();
              return {
                standard:!!document.querySelector('.go-day-card-v2'),
                timer:!!document.querySelector('.shift-timer-home'),
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )

        evaluate("state.activeTab='settings';state.settingsSection='timer';render()")
        screenshot("01-timer-setting.png")
        timer_setting = evaluate(
            """({
              toggle:!!document.querySelector('[data-toggle-shift-timer]'),
              pressed:document.querySelector('[data-toggle-shift-timer]').getAttribute('aria-pressed'),
              overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
            })"""
        )
        evaluate("document.querySelector('[data-toggle-shift-timer]').click()")
        evaluate(
            """(function(){
              var key=toISODate(new Date());
              delete state.entries[key];
              state.activeTab='home';
              render();
            })()"""
        )
        screenshot("02-timer-ready.png")
        timer_ready = evaluate(
            """({
              enabled:state.settings.timerEnabled,
              timer:!!document.querySelector('.shift-timer-home.is-ready'),
              standard:!!document.querySelector('.go-day-card-v2'),
              start:!!document.querySelector('[data-timer-start]'),
              overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
            })"""
        )

        evaluate("document.querySelector('[data-timer-start]').click()")
        evaluate("state.shiftTimer.startedAt=Date.now()-(90*60*1000);persistShiftTimerState();updateShiftTimerDom()")
        screenshot("03-timer-running.png")
        timer_running = evaluate(
            """({
              active:state.shiftTimer.active,
              status:state.shiftTimer.status,
              elapsed:(document.querySelector('[data-shift-timer-elapsed]')||{}).textContent||'',
              controls:document.querySelectorAll('.shift-timer-control').length,
              overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
            })"""
        )
        evaluate("document.querySelector('[data-timer-toggle-pause]').click()")
        timer_paused = evaluate("({status:state.shiftTimer.status, stored:!!localStorage.getItem('gestore-shift-timer-v1')})")
        evaluate("document.querySelector('[data-timer-toggle-pause]').click()")
        evaluate("document.querySelector('[data-timer-finish]').click()")
        timer_saved = evaluate(
            """(function(){
              var entry=state.entries[toISODate(new Date())];
              return {
                timerActive:state.shiftTimer.active,
                type:entry && entry.type,
                hasStart:!!(entry && entry.start),
                hasEnd:!!(entry && entry.end),
                persisted:!!localStorage.getItem(STORAGE_PENDING_SYNC)
              };
            })()"""
        )

        evaluate("state.activeTab='home';render()")
        drag_start = evaluate(
            """(function(){
              var button=document.querySelector('.nav-btn-v2[data-tab=home]');
              var target=document.querySelector('.nav-btn-v2[data-tab=vacations]');
              var grid=document.querySelector('.nav-grid-v2');
              var a=button.getBoundingClientRect();
              var b=target.getBoundingClientRect();
              window.__qaDrag={grid:grid,pointerId:77,endX:b.left+b.width/2};
              button.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,pointerType:'touch',clientX:a.left+a.width/2,clientY:a.top+a.height/2,button:0,bubbles:true,isPrimary:true}));
              grid.dispatchEvent(new PointerEvent('pointermove',{pointerId:77,pointerType:'touch',clientX:b.left+b.width/2,clientY:b.top+b.height/2,button:0,bubbles:true,isPrimary:true}));
              return {tab:state.activeTab,dragging:grid.classList.contains('nav-dragging'),preview:(grid.querySelector('.nav-preview')||{}).dataset && grid.querySelector('.nav-preview').dataset.tab};
            })()"""
        )
        screenshot("04-nav-dragging.png")
        evaluate(
            """(function(){
              var drag=window.__qaDrag;
              drag.grid.dispatchEvent(new PointerEvent('pointerup',{pointerId:drag.pointerId,pointerType:'touch',clientX:drag.endX,clientY:800,button:0,bubbles:true,isPrimary:true}));
            })()"""
        )
        time.sleep(0.18)
        drag_end = evaluate("({tab:state.activeTab,dragging:!!document.querySelector('.nav-grid-v2.nav-dragging')})")

        evaluate("state.activeTab='profile';render();document.querySelector('[data-open-global-search]').click()")
        search_state = evaluate(
            """(function(){
              var input=document.getElementById('globalSearchInput');
              input.value='lavoro';
              input.dispatchEvent(new Event('input',{bubbles:true}));
              return {
                open:!!document.querySelector('.global-search-overlay'),
                results:document.querySelectorAll('.global-search-result').length,
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
                overlayLeft:Math.round(document.querySelector('.global-search-overlay').getBoundingClientRect().left),
                overlayWidth:Math.round(document.querySelector('.global-search-overlay').getBoundingClientRect().width),
                panelWidth:Math.round(document.querySelector('.global-search-panel').getBoundingClientRect().width)
              };
            })()"""
        )
        screenshot("05-global-search.png")
        evaluate("document.querySelector('[data-close-global-search]').click()")

        weekly_review = evaluate(
            """(function(){
              var saturday=new Date(2026,6,25,12,0,0);
              var monday=new Date(2026,6,27,12,0,0);
              var satDescriptor=getWeeklyReviewDescriptor(saturday);
              var monDescriptor=getWeeklyReviewDescriptor(monday);
              var opened=maybeOpenWeeklyReview(saturday,true);
              var dialog=document.querySelector('.weekly-review-dialog');
              return {
                opened:opened,
                visible:!!dialog,
                rows:document.querySelectorAll('.weekly-review-row').length,
                saturdayKey:satDescriptor && satDescriptor.key,
                mondayKey:monDescriptor && monDescriptor.key,
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
                dialogWidth:dialog ? Math.round(dialog.getBoundingClientRect().width) : 0
              };
            })()"""
        )
        screenshot("06-weekly-review.png")
        weekly_seen = evaluate(
            """(function(){
              document.querySelector('[data-dismiss-weekly-review]').click();
              var reopened=maybeOpenWeeklyReview(new Date(2026,6,27,12,0,0),false);
              return {
                closed:!document.querySelector('.weekly-review-overlay'),
                reopened:reopened,
                stored:Array.from({length:localStorage.length},function(_,index){return localStorage.key(index);}).some(function(key){return key.indexOf('gestore-weekly-review-v1:')===0 && localStorage.getItem(key)==='seen';})
              };
            })()"""
        )

        home_customization = evaluate(
            """(function(){
              state.activeTab='settings';
              state.settingsSection='home';
              render();
              var toggles=document.querySelectorAll('[data-toggle-home-section]');
              var salaryToggle=document.querySelector('[data-toggle-home-section=homeShowSalaryPreview]');
              if(salaryToggle && !state.settings.homeShowSalaryPreview) salaryToggle.click();
              state.activeTab='home';
              state.settingsSection='';
              render();
              var result={
                toggleCount:toggles.length,
                salaryEnabled:state.settings.homeShowSalaryPreview,
                salaryVisible:!!document.querySelector('.home-salary-preview'),
                completionVisible:!!document.querySelector('.home-completion-card'),
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
              state.settings.homeShowSalaryPreview=false;
              state.settingsDraft.homeShowSalaryPreview=false;
              saveSettings();
              return result;
            })()"""
        )

        calendar_export = evaluate(
            """(function(){
              var previousDownload=downloadTextFile;
              var captured={};
              state.entries['2026-08-03']={type:'lavoro',start:'08:00',end:'17:00',breakHours:1,notes:'Riga, importante'};
              state.entries['2026-08-04']={type:'ferie',notes:'Giornata intera'};
              state.entries['2025-08-04']={type:'ferie',notes:'Anno precedente'};
              downloadTextFile=function(name,content,type){captured={name:name,content:content,type:type};};
              var exportedCount=exportCalendarIcs({year:2026,types:['ferie']});
              downloadTextFile=previousDownload;
              return {
                fileName:captured.name||'',
                mime:captured.type||'',
                calendar:/BEGIN:VCALENDAR/.test(captured.content||''),
                workExcluded:!/DTSTART;TZID=Europe\\/Rome:20260803T080000/.test(captured.content||''),
                allDay:/DTSTART;VALUE=DATE:20260804/.test(captured.content||''),
                previousYearExcluded:!/20250804/.test(captured.content||''),
                exportedCount:exportedCount,
                events:((captured.content||'').match(/BEGIN:VEVENT/g)||[]).length
              };
            })()"""
        )

        backups_state = evaluate(
            """(async function(){
              await flushServerSyncNow();
              var created=await fetch('/api/backups',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json();});
              var listed=await fetch('/api/backups',{cache:'no-store'}).then(function(r){return r.json();});
              return {created:!!(created && created.backup),count:(listed.backups||[]).length,bytes:Number(listed.bytes)||0};
            })()""",
            await_promise=True,
        )

        qa = {
            "defaultHome": default_home,
            "timerSetting": timer_setting,
            "timerReady": timer_ready,
            "timerRunning": timer_running,
            "timerPaused": timer_paused,
            "timerSaved": timer_saved,
            "dragStart": drag_start,
            "dragEnd": drag_end,
            "search": search_state,
            "weeklyReview": weekly_review,
            "weeklySeen": weekly_seen,
            "homeCustomization": home_customization,
            "calendarExport": calendar_export,
            "backups": backups_state,
            "errors": evaluate("(document.getElementById('errorBox')||{}).textContent||''"),
        }
        (OUT / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(qa, ensure_ascii=True))
        ws.close()
    finally:
        if chrome:
            chrome.terminate()
            try:
                chrome.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome.kill()
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
