import base64
import datetime
import json
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.request

import websocket


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "responsive-matrix-qa"
OUT.mkdir(parents=True, exist_ok=True)
SERVER_PORT = 8781
DEBUG_PORT = 9241
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
TODAY = datetime.date.today()


def read_json(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


with tempfile.TemporaryDirectory(prefix="gestore-responsive-qa-") as temp_root:
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
    ws = None
    try:
        for _ in range(80):
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
                "--window-size=430,932",
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
        for _ in range(80):
            try:
                targets = read_json(f"http://127.0.0.1:{DEBUG_PORT}/json/list")
                if targets:
                    break
            except Exception:
                time.sleep(0.1)
        if not targets:
            raise RuntimeError("Chrome DevTools non disponibile")

        target = next(item for item in targets if item.get("type") == "page")
        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=10)
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

        def set_viewport(width, height):
            call(
                "Emulation.setDeviceMetricsOverride",
                {
                    "width": width,
                    "height": height,
                    "deviceScaleFactor": 1,
                    "mobile": True,
                    "screenWidth": width,
                    "screenHeight": height,
                },
            )

        def screenshot(name, width, height):
            encoded = call(
                "Page.captureScreenshot",
                {
                    "format": "png",
                    "fromSurface": True,
                    "captureBeyondViewport": False,
                    "clip": {"x": 0, "y": 0, "width": width, "height": height, "scale": 1},
                },
            )["data"]
            (OUT / name).write_bytes(base64.b64decode(encoded))

        def measure_screen(name):
            value = evaluate(
                """(function(){
                  var width=document.documentElement.clientWidth;
                  var visible=Array.from(document.querySelectorAll('button,input,textarea,[role=button]')).filter(function(el){
                    var style=getComputedStyle(el), rect=el.getBoundingClientRect();
                    return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0 &&
                      rect.bottom>0 && rect.top<innerHeight;
                  });
                  var undersized=visible.filter(function(el){
                    var rect=el.getBoundingClientRect();
                    return (rect.width<36 || rect.height<36) && !el.closest('.calendar-grid') &&
                      !el.matches('.toggle-btn,.day-editor-auto-toggle');
                  }).slice(0,8).map(function(el){
                    return {tag:el.tagName,label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,40),
                      width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)};
                  });
                  var unnamed=visible.filter(function(el){
                    var label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim();
                    if(el.tagName==='INPUT' || el.tagName==='TEXTAREA'){
                      label=label||el.getAttribute('placeholder')||el.getAttribute('name')||'';
                    }
                    return !label && el.getAttribute('aria-hidden')!=='true';
                  }).slice(0,8).map(function(el){
                    return {tag:el.tagName,className:String(el.className||'').slice(0,60)};
                  });
                  var outside=Array.from(document.querySelectorAll('.screen,main,section,.bottom-nav,.nav-grid-v2,.overlay.open')).filter(function(el){
                    var style=getComputedStyle(el), rect=el.getBoundingClientRect();
                    return style.display!=='none' && rect.width>0 && (rect.left < -1 || rect.right > width + 1);
                  }).slice(0,8).map(function(el){
                    var rect=el.getBoundingClientRect();
                    return {className:String(el.className||'').slice(0,80),left:Math.round(rect.left),right:Math.round(rect.right)};
                  });
                  return {
                    viewport:width,
                    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-width),
                    outside:outside,
                    undersized:undersized,
                    unnamed:unnamed,
                    error:(document.getElementById('errorBox')||{}).textContent||''
                  };
                })()"""
            )
            value["name"] = name
            return value

        call("Page.enable")
        call("Runtime.enable")
        set_viewport(393, 852)
        call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=responsive-platform"})

        for _ in range(120):
            if evaluate("!!document.querySelector('[data-account-form=register]')"):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("Registrazione non disponibile")

        time.sleep(2.5)
        if not evaluate("!!document.querySelector('[data-account-form=register]')"):
            raise RuntimeError("Registrazione non disponibile dopo l'aggiornamento del service worker")
        registration = evaluate(
            """(async function(){
              var response=await fetch('/api/auth/register',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                cache:'no-store',
                body:JSON.stringify({username:'responsiveqa',password:'password-qa-2026'})
              });
              return {status:response.status,body:await response.text()};
            })()""",
            await_promise=True,
        )
        if registration.get("status") != 201:
            raise RuntimeError("Registrazione QA fallita: " + json.dumps(registration, ensure_ascii=False))
        evaluate("location.reload();true")
        for _ in range(140):
            if evaluate("typeof state!=='undefined' && state.account && state.account.authenticated && !document.querySelector('.account-gate')"):
                break
            time.sleep(0.12)
        else:
            diagnostic = evaluate(
                """({
                  href:location.href,
                  ready:document.readyState,
                  account:typeof state!=='undefined' ? state.account : null,
                  gate:(document.querySelector('.account-gate')||{}).innerText||'',
                  error:(document.getElementById('errorBox')||{}).textContent||''
                })"""
            )
            raise RuntimeError("Registrazione non completata: " + json.dumps(diagnostic, ensure_ascii=False))
        for _ in range(120):
            if evaluate("!document.querySelector('.go-splash-screen:not(.hidden)')"):
                break
            time.sleep(0.1)

        today_js = f"new Date({TODAY.year},{TODAY.month - 1},{TODAY.day})"
        evaluate(
            f"""(function(){{
              if(typeof closeOnboarding==='function') closeOnboarding(true);
              if(typeof platformState!=='undefined'){{
                platformState.recoveryOpen=false;
                platformState.releaseOpen=false;
              }}
              var base={today_js};
              state.entries={{}};
              for(var i=-20;i<=2;i++){{
                var day=new Date(base); day.setDate(day.getDate()+i);
                if(day.getDay()===0) continue;
                state.entries[toISODate(day)]={{
                  type:i%9===0?'ferie':'lavoro',
                  start:i%9===0?'':'08:00',
                  end:i%9===0?'':'17:30',
                  breakHours:i%9===0?0:1,
                  overtimeHours:0.5,
                  overtimeManual:true,
                  leaveHours:0,
                  quantityHours:i%9===0?8:0,
                  notes:''
                }};
              }}
              var futureVacation=new Date(base);
              futureVacation.setDate(futureVacation.getDate()+10);
              state.entries[toISODate(futureVacation)]={{
                type:'ferie',start:'',end:'',breakHours:0,overtimeHours:0,
                overtimeManual:false,leaveHours:0,quantityHours:8,notes:''
              }};
              state.settings.vacationAllowanceByYear={{}};
              state.settings.vacationAllowanceByYear[String(base.getFullYear())]=26;
              state.settings.onboardingCompleted=true;
              state.settingsDraft=Object.assign({{}},state.settings);
              state.payslips=[{{
                id:'qa-cedolino',
                month:base.getMonth()+1,
                year:base.getFullYear(),
                netto:1548.25,
                hourlyRate:10.75,
                overtimeRate:13.5,
                notes:'Cedolino di prova',
                photos:[],
                createdAt:Date.now()
              }}];
              saveEntries(); saveSettings();
              state.activeTab='home'; state.settingsSection='';
              render();
              var weeklyDismiss=document.querySelector('[data-dismiss-weekly-review]');
              if(weeklyDismiss) weeklyDismiss.click();
              return true;
            }})()"""
        )
        time.sleep(0.4)

        results = []
        viewports = [(320, 780), (393, 852), (430, 932)]
        screens = [
            ("home", "home", ""),
            ("calendar", "calendar", ""),
            ("statistics", "stats", ""),
            ("vacations", "vacations", ""),
            ("salary", "payslips", ""),
            ("profile", "profile", ""),
            ("data", "settings", "data"),
            ("privacy", "settings", "privacy"),
        ]
        for width, height in viewports:
            set_viewport(width, height)
            for screen_name, active_tab, section in screens:
                evaluate(
                    f"state.editingDate=null;state.draft=null;document.body.classList.remove('editor-open');"
                    f"state.activeTab={json.dumps(active_tab)};state.settingsSection={json.dumps(section)};render();"
                )
                time.sleep(0.18)
                result = measure_screen(f"{screen_name}-{width}")
                results.append(result)
                if width == 393 and screen_name in {"home", "calendar", "statistics", "vacations", "salary", "profile", "data", "privacy"}:
                    screenshot(f"{screen_name}-{width}.png", width, height)

        set_viewport(393, 852)
        calendar_checks = evaluate(
            """(function(){
              state.activeTab='calendar';
              state.settingsSection='';
              state.calendarView='month';
              state.calendarFilter='all';
              state.calendarDetailOpen=false;
              state.calendarSelectionMode=false;
              state.editingDate=null;
              state.draft=null;
              document.body.classList.remove('editor-open');
              render();
              var legend=document.querySelector('.calendar-v2-legend-card');
              var initial={
                detailHidden:!document.querySelector('.calendar-day-focus'),
                manageAtTop:!!document.querySelector('.calendar-v2-top-actions .calendar-v2-manage[data-open-calendar-actions]'),
                oldBottomActionRemoved:!document.querySelector('.calendar-advanced-link'),
                legendClosed:!!legend && !legend.open
              };
              if(legend) legend.open=true;
              initial.legendOpens=!!legend && legend.open && !!legend.querySelector('.legend-grid');
              if(legend) legend.open=false;
              var cell=document.querySelector('.calendar-grid .cell.has-entry:not(.out)');
              var key=cell && cell.dataset.calendarPickDate;
              if(cell) cell.click();
              var monthSelection={
                key:key||'',
                selected:!!key && state.calendarSelectedDate===key,
                editorStayedClosed:!state.editingDate,
                focusVisible:!!document.querySelector('.calendar-day-focus'),
                focusMatches:!!document.querySelector('.calendar-day-focus [data-open-date="'+key+'"]')
              };
              var closeDetail=document.querySelector('[data-close-calendar-detail]');
              if(closeDetail) closeDetail.click();
              monthSelection.closesCleanly=!state.calendarDetailOpen && !document.querySelector('.calendar-day-focus');
              var selectedCell=document.querySelector('[data-calendar-pick-date="'+key+'"]');
              if(selectedCell) selectedCell.click();
              var edit=document.querySelector('.calendar-day-focus [data-open-date]');
              if(edit) edit.click();
              monthSelection.editorOpened=!!state.editingDate;
              state.editingDate=null;
              state.draft=null;
              document.body.classList.remove('editor-open');
              state.activeTab='calendar';
              state.calendarView='month';
              render();
              var agendaToggle=document.querySelector('[data-calendar-view="agenda"]');
              if(agendaToggle) agendaToggle.click();
              var agendaRows=document.querySelectorAll('.calendar-agenda-row');
              var firstAgenda=agendaRows[0];
              var agendaKey=firstAgenda && firstAgenda.dataset.calendarPickDate;
              if(firstAgenda) firstAgenda.click();
              var agenda={
                active:state.calendarView==='agenda',
                rows:agendaRows.length,
                selected:!!agendaKey && state.calendarSelectedDate===agendaKey,
                detailVisible:!!document.querySelector('.calendar-day-focus'),
                grouped:document.querySelectorAll('.calendar-agenda-week').length>=1,
                editorStayedClosed:!state.editingDate,
                overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)
              };
              var calendarScreen=document.querySelector('.calendar-screen');
              if(calendarScreen) calendarScreen.scrollTop=calendarScreen.scrollHeight;
              var agendaCard=document.querySelector('.calendar-agenda-card');
              var bottomNav=document.querySelector('.bottom-nav');
              agenda.bottomClearance=!!agendaCard && !!bottomNav && agendaCard.getBoundingClientRect().bottom<=bottomNav.getBoundingClientRect().top-4;
              var tools=document.querySelector('[data-open-calendar-actions]');
              if(tools) tools.click();
              var toolsCheck={
                opens:state.calendarActionsOpen && !!document.querySelector('.calendar-actions-dialog'),
                noDuplicateFilters:!document.querySelector('.calendar-dialog-filter'),
                actions:document.querySelectorAll('.calendar-actions-list > button').length===3
              };
              var closeTools=document.querySelector('[data-close-calendar-actions]');
              if(closeTools) closeTools.click();
              var filterButton=document.querySelector('.calendar-v2-filter-bar [data-calendar-filter="absence"]');
              var filterVisible=!!filterButton;
              if(filterButton) filterButton.click();
              var filters={
                visible:filterVisible,
                applied:state.calendarFilter==='absence',
                dialogClosed:!state.calendarActionsOpen,
                indicator:!!document.querySelector('.calendar-v2-filter-bar [data-calendar-filter="absence"].is-active')
              };
              state.calendarFilter='all';
              render();
              return {initial:initial,monthSelection:monthSelection,agenda:agenda,tools:toolsCheck,filters:filters};
            })()"""
        )
        evaluate("state.activeTab='calendar';state.calendarView='agenda';state.calendarFilter='all';state.calendarDetailOpen=false;render();")
        screenshot("calendar-agenda-393.png", 393, 852)

        platform_checks = evaluate(
            """(async function(){
              async function waitFor(bucket){
                for(var attempt=0;attempt<80;attempt++){
                  if(!bucket.loading && (bucket.loaded || bucket.error)) return;
                  await new Promise(function(resolve){setTimeout(resolve,50);});
                }
              }
              state.activeTab='settings';
              state.settingsSection='data';
              render();
              loadPlatformDiagnostics(true); loadPlatformHistory(true);
              await Promise.all([waitFor(platformState.diagnostics),waitFor(platformState.history)]);
              var data={
                diagnostics:platformState.diagnostics.loaded && !!platformState.diagnostics.value,
                diagnosticsError:platformState.diagnostics.error,
                history:platformState.history.loaded,
                historyRows:document.querySelectorAll('.platform-history-row').length
              };
              state.settingsSection='privacy';
              render();
              loadPlatformSessions(true); loadPlatformPushConfig(true);
              await Promise.all([waitFor(platformState.sessions),waitFor(platformState.push)]);
              data.sessions=platformState.sessions.loaded && platformState.sessions.items.length>=1;
              data.sessionRows=document.querySelectorAll('.platform-session-row').length;
              data.pushLoaded=platformState.push.loaded;
              state.settingsSection='accounts';
              render();
              loadPlatformAudit(true);
              await waitFor(platformState.audit);
              data.audit=platformState.audit.loaded && platformState.audit.items.length>=1;
              data.auditError=platformState.audit.error;
              data.auditRows=document.querySelectorAll('.platform-audit-row').length;
              return data;
            })()""",
            await_promise=True,
        )

        navigation_checks = evaluate(
            """(async function(){
              function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
              state.activeTab='home';
              state.settingsSection='';
              render();
              var avatar=document.querySelector('[data-open-profile]');
              if(avatar) avatar.click();
              await wait(30);
              var profileOpened=state.activeTab==='profile' &&
                !!document.querySelector('.profile-screen.active') &&
                !document.querySelector('.bottom-nav');
              var back=document.querySelector('[data-close-profile]');
              if(back) back.click();
              await wait(30);
              var profileClosed=state.activeTab==='home' && !!document.querySelector('.bottom-nav');
              var salary=document.querySelector('.nav-btn[data-tab="payslips"]');
              if(salary) salary.click();
              await wait(180);
              var salaryOpened=state.activeTab==='payslips' &&
                !!document.querySelector('.salary-hub-page') &&
                !!document.querySelector('.nav-btn[data-tab="payslips"].active');
              var archiveButton=document.querySelector('[data-open-payslip-archive]');
              var latestRemoved=!document.querySelector('.salary-latest-section');
              if(archiveButton) archiveButton.click();
              await wait(30);
              var archiveOpened=state.payslipArchiveOpen===true &&
                !!document.querySelector('.salary-archive-page') &&
                !document.querySelector('.salary-hub-page');
              var archiveBack=document.querySelector('[data-close-payslip-archive]');
              if(archiveBack) archiveBack.click();
              await wait(30);
              var salaryReturned=state.payslipArchiveOpen===false &&
                !!document.querySelector('.salary-hub-page');
              return {
                avatar:!!avatar,
                profileOpened:profileOpened,
                profileClosed:profileClosed,
                salaryOpened:salaryOpened,
                archiveButton:!!archiveButton,
                latestRemoved:latestRemoved,
                archiveOpened:archiveOpened,
                salaryReturned:salaryReturned
              };
            })()""",
            await_promise=True,
        )

        evaluate(
            "state.activeTab='payslips';state.payslipArchiveOpen=true;"
            "state.payslipDetailId=null;state.payslipEditorOpen=false;render();"
        )
        time.sleep(0.18)
        results.append(measure_screen("salary-archive-393"))
        screenshot("salary-archive-393.png", 393, 852)
        evaluate("state.payslipArchiveOpen=false;render();")

        salary_hub_checks = evaluate(
            """(function(){
              state.activeTab='payslips';
              state.payslipArchiveOpen=false;
              render();
              return {
                hero:!!document.querySelector('.salary-hub-hero'),
                status:!!document.querySelector('.salary-estimate-status'),
                breakdown:document.querySelectorAll('.salary-hub-breakdown > div').length===3,
                monthReview:!!document.querySelector('.salary-month-review'),
                actions:document.querySelectorAll('.salary-hub-actions > button').length===3,
                oldComparisonRemoved:!document.querySelector('.salary-comparison-card'),
                oldArchiveEntryRemoved:!document.querySelector('.salary-archive-entry')
              };
            })()"""
        )
        evaluate(
            "window.__qaSalaryPayslips=state.payslips;state.payslips=[];render();"
        )
        time.sleep(0.12)
        results.append(measure_screen("salary-empty-393"))
        screenshot("salary-empty-393.png", 393, 852)
        salary_hub_checks["empty"] = evaluate(
            "!!document.querySelector('.salary-month-review.is-empty[data-new-payslip]')"
        )
        salary_hub_checks["restored"] = evaluate(
            "state.payslips=window.__qaSalaryPayslips;delete window.__qaSalaryPayslips;render();"
            "state.payslips.length>0"
        )

        nav_drag_start = evaluate(
            """(function(){
              state.activeTab='home';
              render();
              var button=document.querySelector('.nav-btn-v2[data-tab="home"]');
              var target=document.querySelector('.nav-btn-v2[data-tab="vacations"]');
              var grid=document.querySelector('.nav-grid-v2');
              var from=button.getBoundingClientRect();
              var to=target.getBoundingClientRect();
              window.__responsiveQaDrag={grid:grid,pointerId:77,endX:to.left+to.width/2};
              button.dispatchEvent(new PointerEvent('pointerdown',{
                pointerId:77,pointerType:'touch',clientX:from.left+from.width/2,
                clientY:from.top+from.height/2,button:0,bubbles:true,isPrimary:true
              }));
              grid.dispatchEvent(new PointerEvent('pointermove',{
                pointerId:77,pointerType:'touch',clientX:to.left+to.width/2,
                clientY:to.top+to.height/2,button:0,bubbles:true,isPrimary:true
              }));
              return {
                dragging:grid.classList.contains('nav-dragging'),
                preview:(grid.querySelector('.nav-preview')||{}).dataset &&
                  grid.querySelector('.nav-preview').dataset.tab,
                activeColor:getComputedStyle(grid.querySelector('.nav-btn.active')).color,
                previewColor:getComputedStyle(grid.querySelector('.nav-preview')).color,
                labels:Array.from(grid.querySelectorAll('.nav-btn')).map(function(item){
                  var label=item.querySelector('.nav-label');
                  return {
                    tab:item.dataset.tab,
                    buttonWidth:Math.round(item.getBoundingClientRect().width),
                    labelWidth:Math.round(label.getBoundingClientRect().width),
                    labelScroll:label.scrollWidth
                  };
                })
              };
            })()"""
        )
        screenshot("nav-dragging-393.png", 393, 852)
        evaluate(
            """(function(){
              var drag=window.__responsiveQaDrag;
              drag.grid.dispatchEvent(new PointerEvent('pointerup',{
                pointerId:drag.pointerId,pointerType:'touch',clientX:drag.endX,
                clientY:800,button:0,bubbles:true,isPrimary:true
              }));
            })()"""
        )
        time.sleep(0.2)
        nav_drag_end = evaluate(
            "({tab:state.activeTab,dragging:!!document.querySelector('.nav-grid-v2.nav-dragging')})"
        )

        evaluate(
            f"""(function(){{
              state.entries[toISODate({today_js})]={{
                type:'lavoro',start:'08:00',end:'17:30',breakHours:1,
                overtimeHours:0.5,overtimeManual:true,leaveHours:0,quantityHours:0,notes:''
              }};
              openEditor({today_js});
              return true;
            }})()"""
        )
        time.sleep(0.2)
        editor_valid = measure_screen("editor-valid-393")
        screenshot("editor-valid-393.png", 393, 852)
        validation_valid = evaluate(
            "({issues:getDayDraftValidationIssues(state.draft).length,blocking:hasBlockingDayDraftIssues(getDayDraftValidationIssues(state.draft))})"
        )

        evaluate(
            """(function(){
              state.draft.end='';
              updateEditorSummaryUI();
              updateEditorValidationUI();
              return true;
            })()"""
        )
        time.sleep(0.1)
        editor_invalid = measure_screen("editor-invalid-393")
        validation_invalid = evaluate(
            """({
              panel:!!document.querySelector('.day-editor-validation.has-error'),
              blocking:hasBlockingDayDraftIssues(getDayDraftValidationIssues(state.draft)),
              highlighted:document.querySelectorAll('.has-validation-error').length
            })"""
        )
        screenshot("editor-invalid-393.png", 393, 852)
        evaluate("closeEditor({skipAutosave:true})")

        overnight = evaluate(
            """({
              worked:calcWorkedMinutes({type:'lavoro',start:'22:00',end:'06:00',breakHours:0.5}),
              issues:getDayDraftValidationIssues({type:'lavoro',start:'22:00',end:'06:00',breakHours:0.5,overtimeHours:0,overtimeManual:false}).length
            })"""
        )
        all_results = results + [editor_valid, editor_invalid]
        failures = [
            item
            for item in all_results
            if item["horizontalOverflow"] > 1 or item["outside"] or item["unnamed"] or item["error"]
        ]
        qa = {
            "ok": not failures
            and validation_valid == {"issues": 0, "blocking": False}
            and validation_invalid["panel"]
            and validation_invalid["blocking"]
            and validation_invalid["highlighted"] >= 1
            and overnight["worked"] == 450
            and platform_checks["diagnostics"]
            and platform_checks["history"]
            and platform_checks["historyRows"] >= 1
            and platform_checks["sessions"]
            and platform_checks["sessionRows"] >= 1
            and platform_checks["pushLoaded"]
            and platform_checks["audit"]
            and platform_checks["auditRows"] >= 1
            and all(calendar_checks["initial"].values())
            and all(calendar_checks["monthSelection"].values())
            and calendar_checks["agenda"]["active"]
            and calendar_checks["agenda"]["rows"] >= 1
            and calendar_checks["agenda"]["selected"]
            and calendar_checks["agenda"]["detailVisible"]
            and calendar_checks["agenda"]["grouped"]
            and calendar_checks["agenda"]["editorStayedClosed"]
            and calendar_checks["agenda"]["overflow"] == 0
            and calendar_checks["agenda"]["bottomClearance"]
            and all(calendar_checks["tools"].values())
            and all(calendar_checks["filters"].values())
            and all(navigation_checks.values())
            and all(salary_hub_checks.values())
            and nav_drag_start["dragging"]
            and nav_drag_start["preview"] == "vacations"
            and nav_drag_end == {"tab": "vacations", "dragging": False},
            "screens": len(results),
            "viewports": [item[0] for item in viewports],
            "failures": failures,
            "validationValid": validation_valid,
            "validationInvalid": validation_invalid,
            "overnight": overnight,
            "calendarV2": calendar_checks,
            "platform": platform_checks,
            "navigation": navigation_checks,
            "salaryHub": salary_hub_checks,
            "navDrag": {"start": nav_drag_start, "end": nav_drag_end},
            "inlineFailures": evaluate(
                "runInlineTests().filter(function(test){return !test.passed;}).map(function(test){return test.name;})"
            ),
        }
        if qa["inlineFailures"]:
            qa["ok"] = False
        (OUT / "qa.json").write_text(json.dumps(qa, indent=2), encoding="utf-8")
        print(json.dumps(qa))
        if not qa["ok"]:
            raise SystemExit(1)
    finally:
        if ws is not None:
            try:
                ws.close()
            except Exception:
                pass
        if chrome is not None:
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
