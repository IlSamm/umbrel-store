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
OUT = ROOT / "tmp" / "salary-estimate-qa"
OUT.mkdir(parents=True, exist_ok=True)
SERVER_PORT = 8794
DEBUG_PORT = 9254
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def read_json(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


with tempfile.TemporaryDirectory(prefix="gestore-payroll-calculator-qa-") as temp_root:
    temp_path = pathlib.Path(temp_root)
    env = os.environ.copy()
    env["GESTORE_DATA_DIR"] = str(temp_path / "data")
    server = subprocess.Popen(
        [
            "python",
            str(ROOT / "app" / "backend" / "server.py"),
            "--host",
            "127.0.0.1",
            "--port",
            str(SERVER_PORT),
        ],
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
                read_json(f"http://127.0.0.1:{SERVER_PORT}/api/auth/status")
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
        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=12)
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

        def wait_for(expression, label, count=140):
            for _ in range(count):
                if evaluate(expression):
                    return
                time.sleep(0.1)
            raise RuntimeError(f"Timeout: {label}")

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

        def screenshot(name, full=False):
            params = {"format": "png", "fromSurface": True, "captureBeyondViewport": full}
            encoded = call("Page.captureScreenshot", params)["data"]
            (OUT / name).write_bytes(base64.b64decode(encoded))

        call("Page.enable")
        call("Runtime.enable")
        set_viewport(393, 852)
        call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=payroll-calculator"})
        wait_for("!!document.querySelector('[data-account-form=register]')", "registrazione")
        time.sleep(2.5)
        wait_for("!!document.querySelector('[data-account-form=register]')", "registrazione stabile")
        evaluate(
            """(async function(){
              var form=document.querySelector('[data-account-form=register]');
              form.querySelector('[name=username]').value='payrollqa';
              form.querySelector('[name=password]').value='password-qa-2026';
              form.querySelector('[name=confirmPassword]').value='password-qa-2026';
              await submitAccountRegistration(form);
              return true;
            })()""",
            await_promise=True,
        )
        wait_for(
            "typeof state !== 'undefined' && state.account && state.account.authenticated && !document.querySelector('.account-gate')",
            "account",
        )
        wait_for("!document.getElementById('splashScreen')", "splash")
        evaluate(
            """(function(){
              var close=document.querySelector('[data-platform-recovery-close]');
              if(close) close.click();
              return true;
            })()"""
        )
        wait_for("!document.querySelector('[data-platform-recovery-close]')", "codice recupero")
        evaluate(
            """(function(){
              if(state.onboardingOpen && typeof closeOnboarding==='function'){
                closeOnboarding(true);
              }else{
                state.settings.onboardingCompleted=true;
                state.settingsDraft=Object.assign({},state.settings);
                if(typeof clearPendingAccountOnboarding==='function'){
                  clearPendingAccountOnboarding(state.account.user.id);
                }
                saveSettings();
                render();
              }
              state.settings.smartReminderWeeklyReview=false;
              state.weeklyReviewOpen=false;
              state.settingsDraft=Object.assign({},state.settings);
              saveSettings();
              return true;
            })()"""
        )
        wait_for("!document.querySelector('.onboarding-overlay')", "chiusura onboarding")

        seeded = evaluate(
            """(function(){
              var pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XSTVAAAAAElFTkSuQmCC';
              state.entries={
                '2026-07-01':{type:'lavoro',start:'08:00',end:'20:00',breakHours:1,overtimeManual:false},
                '2026-07-02':{type:'lavoro',start:'08:00',end:'17:00',breakHours:1,overtimeManual:false},
                '2026-07-03':{type:'ferie',quantityHours:8}
              };
              state.settings.payrollEstimateByMonth={
                '2026-07':{
                  baseMonthlyGross:1766,
                  salaryMonths:14,
                  overtimeHoursMonthly:20,
                  overtimeLimitEnabled:false,
                  overtimeHoursLimit:0,
                  overtimeHourlyRate:10.98,
                  monthsWithOvertime:12,
                  otherAnnualGross:0,
                  employeeContributionRate:9.19,
                  region:'Lombardia',
                  municipality:'',
                  taxYear:2026,
                  employmentDays:365,
                  employmentType:'permanent',
                  otherAnnualDeductions:0,
                  annualReimbursements:0,
                  privateReconciliationEnabled:false,
                  privateReconciliationHourlyRate:0
                }
              };
              state.settingsDraft=Object.assign({},state.settings);
              state.payslips=[{
                id:'qa-payslip',
                month:6,
                year:2026,
                netto:1500,
                lordo:1900,
                photos:[{id:'qa-photo',data:pixel,thumbnail:pixel,fileName:'qa.png'}],
                imageData:pixel,
                fileName:'qa.png',
                createdAt:Date.now()
              }];
              saveEntries();
              persistPayslipsLocally();
              state.activeTab='payslips';
              state.payslipEstimateOpen=false;
              state.payslipStatsOpen=false;
              state.payslipEditorOpen=false;
              render();
              return persistPayslipRecordToServer(state.payslips[0]).then(function(){
                return {
                  card:!!document.querySelector('[data-open-payslip-estimate]'),
                  preview:(document.querySelector('.salary-hub-estimate')||{}).textContent||'',
                  entries:Object.keys(state.entries).length,
                  payslips:state.payslips.length
                };
              });
            })()""",
            await_promise=True,
        )
        if not seeded or not seeded.get("card"):
            raise RuntimeError(f"Card stima non presente: {seeded!r}")
        screenshot("01-payslip-archive.png")

        evaluate(
            "document.querySelector('[data-open-payslip-estimate]').click();"
            "state.payslipEstimateYear=2026;state.payslipEstimateMonth=7;render();true"
        )
        wait_for("!!document.querySelector('[data-payroll-calculator-page]')", "calcolatore netto")
        initial = evaluate(
            """(function(){
              return {
                gross:(document.querySelector('[data-payroll-value=totalMonthlyGross]')||{}).textContent||'',
                overtime:(document.querySelector('[data-payroll-value=overtimeMonthlyGross]')||{}).textContent||'',
                annualGross:(document.querySelector('[data-payroll-value=totalAnnualGross]')||{}).textContent||'',
                net:(document.querySelector('[data-payroll-value=netMonth]')||{}).textContent||'',
                notice:(document.querySelector('[data-payroll-municipal-notice]')||{}).textContent||'',
                configButton:!!document.querySelector('[data-open-payroll-config]'),
                fieldsOnSummary:Array.from(document.querySelectorAll('[data-payroll-field]')).filter(function(field){
                  return field.offsetParent !== null;
                }).length,
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )
        dynamic_overtime = evaluate(
            """(function(){
              var before=getPayrollNetEstimateForMonth(2026,7);
              state.entries['2026-07-02'].end='19:00';
              var after=getPayrollNetEstimateForMonth(2026,7);
              state.entries['2026-07-02'].end='17:00';
              return {
                beforeHours:before.input.overtimeHoursMonthly,
                afterHours:after.input.overtimeHoursMonthly,
                beforeGross:before.overtimeMonthlyGross,
                afterGross:after.overtimeMonthlyGross
              };
            })()"""
        )
        screenshot("02-payroll-summary.png", full=True)

        evaluate("document.querySelector('[data-open-payroll-config]').click(); true")
        wait_for(
            "state.payslipEstimateConfigOpen && !!document.querySelector('[data-payroll-field]')",
            "schermata dati stima",
        )
        config_page = evaluate(
            """(function(){
              return {
                header:(document.querySelector('.payroll-estimate-top h1')||{}).textContent||'',
                fields:document.querySelectorAll('[data-payroll-field]').length,
                recorded:!!document.querySelector('[data-payroll-recorded-overtime]'),
                manualOvertime:!!document.querySelector('[data-payroll-field=overtimeHoursMonthly]'),
                limit:!!document.querySelector('[data-payroll-overtime-limit-toggle]'),
                back:!!document.querySelector('[data-close-payroll-config]'),
                advancedVisible:!!document.querySelector('[data-payroll-private-section]'),
                secretTriggerRemoved:!document.querySelector('[data-payroll-secret-trigger]')
              };
            })()"""
        )

        invalid = evaluate(
            """(function(){
              var field=document.querySelector('[data-payroll-field=employeeContributionRate]');
              field.value='nove';
              field.dispatchEvent(new Event('input',{bubbles:true}));
              var result={
                invalid:field.getAttribute('aria-invalid'),
                net:(document.querySelector('[data-payroll-value=netMonth]')||{}).textContent||''
              };
              field.value='9,19';
              field.dispatchEvent(new Event('input',{bubbles:true}));
              return result;
            })()"""
        )

        private_reconciliation = evaluate(
            """(function(){
              var section=document.querySelector('[data-payroll-private-section]');
              var secretTrigger=document.querySelector('[data-payroll-secret-trigger]');
              if(!section) return {visible:false,secretTriggerRemoved:!secretTrigger};
              section.querySelector('[data-payroll-private-toggle]').click();
              var savedImmediately=!!(
                state.settings.payrollEstimateByMonth &&
                state.settings.payrollEstimateByMonth['2026-07'] &&
                state.settings.payrollEstimateByMonth['2026-07'].privateReconciliationEnabled
              );
              var limitToggle=document.querySelector('[data-payroll-overtime-limit-toggle]');
              limitToggle.click();
              var included=document.querySelector('[data-payroll-field=overtimeHoursLimit]');
              var rate=document.querySelector('[data-payroll-field=privateReconciliationHourlyRate]');
              included.value='1';
              included.dispatchEvent(new Event('input',{bubbles:true}));
              rate.value='15';
              rate.dispatchEvent(new Event('input',{bubbles:true}));
              return {
                visible:true,
                secretTriggerRemoved:!secretTrigger,
                enabled:section.classList.contains('is-enabled'),
                savedImmediately:savedImmediately,
                hours:(document.querySelector('[data-payroll-private-hours]')||{}).textContent||'',
                amount:(document.querySelector('[data-payroll-private-amount]')||{}).textContent||'',
                officialNet:(document.querySelector('[data-payroll-value=netMonth]')||{}).textContent||''
              };
            })()"""
        )

        completed = evaluate(
            """(function(){
              var municipality=document.querySelector('[data-payroll-field=municipality]');
              municipality.focus();
              municipality.value='Sov';
              municipality.dispatchEvent(new Event('input',{bubbles:true}));
              var municipalityOption=document.querySelector('[data-payroll-municipality-option="Sovere"]');
              var optionFound=!!municipalityOption;
              if(municipalityOption) municipalityOption.click();
              var fieldStyle=getComputedStyle(municipality);
              return {
                net:(document.querySelector('[data-payroll-value=netMonth]')||{}).textContent||'',
                annual:(document.querySelector('[data-payroll-value=annualNet]')||{}).textContent||'',
                complete:(document.querySelector('[data-payroll-estimate-completeness]')||{}).classList.contains('is-complete'),
                municipal:(document.querySelector('[data-payroll-value=monthlyMunicipalTax]')||{}).textContent||'',
                feedback:(document.querySelector('[data-payroll-municipality-feedback]')||{}).textContent||'',
                municipalityOption:optionFound,
                municipalityValue:municipality.value,
                squareOutline:fieldStyle.outlineStyle!=='none' && parseFloat(fieldStyle.outlineWidth)>0
              };
            })()"""
        )
        screenshot("03-payroll-config.png", full=True)
        municipality_search = evaluate(
            """(function(){
              var section=document.querySelector('.payroll-calculator-tax-form');
              var input=document.querySelector('[data-payroll-field=municipality]');
              if(section) section.open=true;
              if(section) section.scrollIntoView({block:'start'});
              input.focus();
              input.value='Sov';
              input.dispatchEvent(new Event('input',{bubbles:true}));
              var list=document.querySelector('[data-payroll-municipality-results]');
              var option=document.querySelector('[data-payroll-municipality-option="Sovere"]');
              var rect=list ? list.getBoundingClientRect() : null;
              return {
                visible:!!list && !list.hidden,
                option:!!option,
                options:list ? list.querySelectorAll('[data-payroll-municipality-option]').length : 0,
                width:rect ? Math.round(rect.width) : 0,
                overflow:list ? Math.round(list.scrollWidth-list.clientWidth) : 0
              };
            })()"""
        )
        time.sleep(0.1)
        screenshot("04-municipality-search.png")
        evaluate(
            """(function(){
              var option=document.querySelector('[data-payroll-municipality-option="Sovere"]');
              if(option) option.click();
              return true;
            })()"""
        )
        evaluate("document.querySelector('.payroll-calculator-form').scrollIntoView({block:'start'}); true")
        time.sleep(0.15)
        screenshot("05-payroll-fields.png")

        evaluate("document.querySelector('[data-save-payslip-estimate]').click(); true")
        wait_for(
            "state.settings.payrollEstimateByMonth && state.settings.payrollEstimateByMonth['2026-07']",
            "salvataggio configurazione",
        )
        wait_for("!state.syncPending && state.lastSyncedAt > 0", "sincronizzazione configurazione")
        wait_for(
            "!state.payslipEstimateConfigOpen && !!document.querySelector('[data-open-payroll-config]')",
            "ritorno al riepilogo",
        )
        private_summary = evaluate(
            """(function(){
              var card=document.querySelector('.payroll-private-summary');
              return {visible:!!card,text:card ? card.textContent : ''};
            })()"""
        )
        screenshot("05-payroll-summary-saved.png", full=True)

        persisted = evaluate(
            """(function(){
              var request=new XMLHttpRequest();
              request.open('GET','/api/snapshot',false);
              request.send();
              var snapshot=JSON.parse(request.responseText||'{}');
              return {
                local:state.settings.payrollEstimateByMonth['2026-07'],
                remote:(snapshot.settings.payrollEstimateByMonth||{})['2026-07'],
                inherited:getPayrollEstimateConfig(2026,8),
                entriesLocal:Object.keys(state.entries||{}).length,
                entriesRemote:Object.keys(snapshot.entries||{}).length,
                payslipsLocal:(state.payslips||[]).length,
                payslipsRemote:(snapshot.payslips||[]).length
              };
            })()"""
        )

        responsive = {}
        evaluate("document.querySelector('[data-open-payroll-config]').click(); true")
        wait_for("state.payslipEstimateConfigOpen", "riapertura dati stima")
        private_after_reopen = evaluate(
            """(function(){
              var section=document.querySelector('[data-payroll-private-section]');
              var toggle=section && section.querySelector('[data-payroll-private-toggle]');
              return {
                visible:!!section,
                enabled:!!section && section.classList.contains('is-enabled'),
                checked:toggle ? toggle.getAttribute('aria-checked') : ''
              };
            })()"""
        )
        for width, height in ((320, 780), (393, 852), (430, 932)):
            set_viewport(width, height)
            time.sleep(0.15)
            responsive[str(width)] = evaluate(
                """(function(){
                  var page=document.querySelector('[data-payroll-calculator-page]');
                  var rect=page.getBoundingClientRect();
                  return {
                    documentOverflow:Math.round(document.documentElement.scrollWidth-document.documentElement.clientWidth),
                    pageOverflow:Math.round(page.scrollWidth-page.clientWidth),
                    left:Math.round(rect.left),
                    right:Math.round(innerWidth-rect.right),
                    fields:getComputedStyle(document.querySelector('.payroll-calculator-grid')).gridTemplateColumns
                  };
                })()"""
            )

        set_viewport(393, 852)
        evaluate("document.querySelector('[data-close-payroll-config]').click(); true")
        wait_for("!state.payslipEstimateConfigOpen", "ritorno dalla configurazione")
        evaluate("document.querySelector('[data-close-payslip-estimate]').click(); true")
        wait_for("!document.querySelector('[data-payroll-calculator-page]')", "ritorno archivio")
        archive_after = evaluate(
            """(function(){
              return {
                preview:(document.querySelector('.salary-hub-estimate')||{}).textContent||'',
                hint:(document.querySelector('.salary-hub-hero > p')||{}).textContent||''
              };
            })()"""
        )
        evaluate("document.querySelector('[data-open-payslip-archive]').click(); true")
        wait_for("state.payslipArchiveOpen && !!document.querySelector('.salary-archive-page')", "archivio cedolini")
        archive_screen = evaluate(
            """(function(){
              var page=document.querySelector('.salary-archive-page');
              return {
                visible:!!page,
                rows:document.querySelectorAll('.payroll-archive-row').length,
                latestRemoved:!document.querySelector('.salary-latest-section'),
                overflow:page ? Math.round(page.scrollWidth-page.clientWidth) : 999
              };
            })()"""
        )
        screenshot("06-payslip-archive.png", full=True)
        evaluate("document.querySelector('[data-close-payslip-archive]').click(); true")
        wait_for("!state.payslipArchiveOpen && !!document.querySelector('.salary-hub-page')", "ritorno a Stipendio")

        numbers_ok = (
            "1798,94" in initial["gross"].replace(".", "")
            and "32,94" in initial["overtime"]
            and "25119,28" in initial["annualGross"].replace(".", "")
            and "Inserisci il Comune" in initial["notice"]
            and initial["configButton"]
            and initial["fieldsOnSummary"] == 0
            and abs(dynamic_overtime["beforeHours"] - 3) < 0.001
            and abs(dynamic_overtime["afterHours"] - 5) < 0.001
            and dynamic_overtime["afterGross"] > dynamic_overtime["beforeGross"]
            and config_page["header"] == "Dati per la stima"
            and config_page["fields"] >= 12
            and config_page["recorded"]
            and not config_page["manualOvertime"]
            and config_page["limit"]
            and config_page["back"]
            and config_page["advancedVisible"]
            and config_page["secretTriggerRemoved"]
            and invalid["invalid"] == "true"
            and invalid["net"] == "--"
            and private_reconciliation["visible"]
            and private_reconciliation["secretTriggerRemoved"]
            and private_reconciliation["enabled"]
            and private_reconciliation["savedImmediately"]
            and "2 h" in private_reconciliation["hours"]
            and "30" in private_reconciliation["amount"]
            and private_reconciliation["officialNet"] not in ("", "--")
            and completed["complete"]
            and completed["net"] not in ("", "--")
            and completed["net"] != private_reconciliation["officialNet"]
            and completed["annual"] not in ("", "--")
            and completed["municipal"] != "Non calcolata"
            and "0,8%" in completed["feedback"]
            and completed["municipalityOption"]
            and completed["municipalityValue"] == "Sovere"
            and not completed["squareOutline"]
            and municipality_search["visible"]
            and municipality_search["option"]
            and 0 < municipality_search["options"] <= 8
            and municipality_search["width"] > 200
            and municipality_search["overflow"] <= 0
            and private_summary["visible"]
            and "REGOLARIZZARE" in private_summary["text"].upper()
            and private_after_reopen["visible"]
            and private_after_reopen["enabled"]
            and private_after_reopen["checked"] == "true"
        )
        persisted_ok = (
            abs(persisted["local"]["baseMonthlyGross"] - 1766) < 0.001
            and abs(persisted["remote"]["overtimeHourlyRate"] - 10.98) < 0.001
            and persisted["remote"]["salaryMonths"] == 14
            and persisted["remote"]["monthsWithOvertime"] == 12
            and persisted["remote"]["municipality"] == "Sovere"
            and persisted["remote"]["privateReconciliationEnabled"] is True
            and abs(persisted["remote"]["privateReconciliationHourlyRate"] - 15) < 0.001
            and persisted["inherited"]["inherited"] is True
            and persisted["entriesLocal"] == 3
            and persisted["entriesRemote"] == 3
            and persisted["payslipsLocal"] == 1
            and persisted["payslipsRemote"] == 1
        )
        responsive_ok = all(
            value["documentOverflow"] <= 0 and value["pageOverflow"] <= 0
            for value in responsive.values()
        )
        archive_ok = (
            archive_after["preview"] not in ("", "Configura stima")
            and archive_screen["visible"]
            and archive_screen["rows"] == 1
            and archive_screen["latestRemoved"]
            and archive_screen["overflow"] <= 0
        )
        result = {
            "ok": numbers_ok and persisted_ok and responsive_ok and archive_ok,
            "seeded": seeded,
            "initial": initial,
            "dynamicOvertime": dynamic_overtime,
            "configPage": config_page,
            "invalid": invalid,
            "privateReconciliation": private_reconciliation,
            "privateAfterReopen": private_after_reopen,
            "completed": completed,
            "municipalitySearch": municipality_search,
            "privateSummary": private_summary,
            "persisted": persisted,
            "responsive": responsive,
            "archiveAfter": archive_after,
            "archiveScreen": archive_screen,
        }
        if not result["ok"]:
            raise RuntimeError(json.dumps(result, ensure_ascii=False))
        (OUT / "qa.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(json.dumps(result, ensure_ascii=True))
    finally:
        if ws is not None:
            try:
                ws.close()
            except Exception:
                pass
        if chrome is not None:
            chrome.terminate()
            try:
                chrome.wait(timeout=4)
            except subprocess.TimeoutExpired:
                chrome.kill()
        server.terminate()
        try:
            server.wait(timeout=4)
        except subprocess.TimeoutExpired:
            server.kill()
