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
OUT = ROOT / "tmp" / "payslip-storage-qa"
OUT.mkdir(parents=True, exist_ok=True)
SERVER_PORT = 8772
DEBUG_PORT = 9232
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def read_json(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


with tempfile.TemporaryDirectory(prefix="gestore-payslip-storage-qa-") as temp_root:
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

        def screenshot(name):
            encoded = call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
            (OUT / name).write_bytes(base64.b64decode(encoded))

        def wait_for(expression, label, count=120):
            for _ in range(count):
                if evaluate(expression):
                    return
                time.sleep(0.1)
            debug = evaluate("(function(){return {account:typeof state==='undefined'?null:state.account,syncError:typeof serverSyncLastError==='undefined'?'':serverSyncLastError,errorBox:(document.getElementById('errorBox')||{}).textContent||'',body:(document.body||{}).innerText||''};})()")
            raise RuntimeError(f"Timeout: {label}: {json.dumps(debug, ensure_ascii=False)}")

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
        call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=payslip-storage"})
        wait_for("!!document.querySelector('[data-account-form=register]')", "registrazione")
        evaluate(
            """(async function(){
              var form=document.querySelector('[data-account-form=register]');
              form.querySelector('[name=username]').value='payslipqa';
              form.querySelector('[name=password]').value='password-qa-2026';
              form.querySelector('[name=confirmPassword]').value='password-qa-2026';
              await submitAccountRegistration(form);
              return true;
            })()"""
            ,await_promise=True
        )
        wait_for("typeof state !== 'undefined' && state.account && state.account.authenticated && !document.querySelector('.account-gate')", "account")
        wait_for("!document.querySelector('.go-splash-screen:not(.hidden)')", "splash")

        setup = evaluate(
            """(async function(){
              var photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
              state.payslips=[normalizePayslipRecord({
                id:'payslip-previous',month:6,year:2026,netto:1450,
                hourlyRate:12.5,overtimeRate:18.75,notes:'Tariffe base giugno',
                photos:[{id:'photo-previous',data:photo,fileName:'giugno.png',createdAt:Date.now()}],createdAt:Date.now()
              })];
              persistPayslipsLocally();
              var seedAck=await persistPayslipRecordToServer(state.payslips[0]);
              var seeded=Boolean(seedAck&&seedAck.ok);
              resetPayslipDraft();
              state.payslipDraft.month=7;
              state.payslipDraft.year=2026;
              state.payslipEditorOpen=true;
              state.payslipDetailId='';
              state.activeTab='payslips';
              render();
              return {seeded:seeded};
            })()""",
            await_promise=True,
        )
        if not setup["seeded"]:
            raise RuntimeError("Seed busta non confermato")

        evaluate("document.querySelector('[data-toggle-payslip-rate-reuse]').click(); true")
        reused = evaluate(
            """(function(){
              return {
                enabled:state.payslipDraft.reusePreviousRates,
                hourly:state.payslipDraft.hourlyRate,
                overtime:state.payslipDraft.overtimeRate,
                hourlyReadonly:document.getElementById('payslipHourlyRate').readOnly,
                overtimeReadonly:document.getElementById('payslipOvertimeRate').readOnly,
                help:(document.querySelector('.payroll-rate-reuse-copy small')||{}).textContent||'',
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )
        evaluate("document.querySelector('.payroll-rates-panel').scrollIntoView({block:'start'}); true")
        time.sleep(0.15)
        screenshot("01-payslip-editor-rates.png")

        saved = evaluate(
            """(async function(){
              var photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
              var nettoInput=document.getElementById('payslipNetto');
              var notesInput=document.getElementById('payslipNotes');
              nettoInput.value='1575,25';
              nettoInput.dispatchEvent(new Event('input',{bubbles:true}));
              notesInput.value='Bonifico ricevuto il 27 luglio';
              notesInput.dispatchEvent(new Event('input',{bubbles:true}));
              state.payslipDraft.photos=[{id:'photo-july',data:photo,fileName:'luglio.png',createdAt:Date.now()}];
              state.payslipDraft.imageData=photo;
              state.payslipDraft.fileName='luglio.png';
              var ok=await savePayslipDraft();
               var response=await fetch('/api/snapshot',{cache:'no-store'});
               var snapshot=await response.json();
               var remote=(snapshot.payslips||[]).find(function(item){return Number(item.month)===7&&Number(item.year)===2026;})||{};
               var detailResponse=remote.id?await fetch('/api/payslip?id='+encodeURIComponent(remote.id),{cache:'no-store'}):null;
               var hydrated=detailResponse&&detailResponse.ok?await detailResponse.json():{};
               return {
                ok:ok,
                editorClosed:!state.payslipEditorOpen,
                detailId:state.payslipDetailId,
                localCount:state.payslips.length,
                remoteFound:!!remote.id,
                remoteNetto:remote.netto,
                 remoteHourly:remote.hourlyRate,
                 remoteOvertime:remote.overtimeRate,
                 remoteNotes:remote.notes,
                 remotePhotoCount:Number(remote.photoCount)||0,
                 remotePhotosDeferred:remote.photosDeferred===true,
                 remoteHasEmbeddedPhotos:Array.isArray(remote.photos)&&remote.photos.length>0,
                 hydratedPhotos:((hydrated.payslip||{}).photos||[]).length
               };
            })()""",
            await_promise=True,
        )
        wait_for("!document.getElementById('operationLoader').classList.contains('open')", "chiusura caricamento busta")
        screenshot("02-payslip-detail.png")

        zoom = evaluate(
            """(function(){
              var open=document.querySelector('[data-view-payslip-photo]');
              if(!open) return {opened:false};
              open.click();
              var surface=document.querySelector('[data-payslip-zoom-surface]');
              var image=surface&&surface.querySelector('[data-payslip-zoom-image]');
              var label=surface&&surface.querySelector('[data-payslip-zoom-label]');
              var zoomIn=surface&&surface.querySelector('[data-payslip-zoom-in]');
              if(!surface||!image||!label||!zoomIn) return {opened:false};
              zoomIn.click();
              zoomIn.click();
              var afterButtons=label.textContent;
              var transformAfterButtons=image.style.transform;
              var rect=surface.getBoundingClientRect();
              surface.dispatchEvent(new MouseEvent('dblclick',{
                bubbles:true,
                cancelable:true,
                clientX:rect.left+rect.width/2,
                clientY:rect.top+rect.height/2
              }));
              var afterReset=label.textContent;
              surface.dispatchEvent(new MouseEvent('dblclick',{
                bubbles:true,
                cancelable:true,
                clientX:rect.left+rect.width/2,
                clientY:rect.top+rect.height/2
              }));
              var afterDoubleTap=label.textContent;
              surface.dispatchEvent(new MouseEvent('dblclick',{
                bubbles:true,
                cancelable:true,
                clientX:rect.left+rect.width/2,
                clientY:rect.top+rect.height/2
              }));
              function pointer(type,id,x,y){
                surface.dispatchEvent(new PointerEvent(type,{
                  bubbles:true,
                  cancelable:true,
                  pointerId:id,
                  pointerType:'touch',
                  clientX:x,
                  clientY:y,
                  isPrimary:id===11
                }));
              }
              var centerX=rect.left+rect.width/2;
              var centerY=rect.top+rect.height/2;
              pointer('pointerdown',11,centerX-20,centerY);
              pointer('pointerdown',12,centerX+20,centerY);
              pointer('pointermove',11,centerX-60,centerY);
              pointer('pointermove',12,centerX+60,centerY);
              var afterPinch=label.textContent;
              pointer('pointerup',11,centerX-60,centerY);
              pointer('pointerup',12,centerX+60,centerY);
              return {
                opened:true,
                afterButtons:afterButtons,
                transformAfterButtons:transformAfterButtons,
                afterReset:afterReset,
                afterDoubleTap:afterDoubleTap,
                afterPinch:afterPinch,
                zoomedClass:surface.classList.contains('is-zoomed')
              };
            })()"""
        )
        screenshot("02b-payslip-zoom.png")
        evaluate("var close=document.querySelector('[data-close-payslip-viewer]');if(close)close.click();true")

        failure = evaluate(
            """(async function(){
              var originalFetch=window.fetch;
              var photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
              resetPayslipDraft();
              state.payslipDraft.month=8;
              state.payslipDraft.year=2026;
              state.payslipDraft.netto=1600;
              state.payslipDraft.notes='Non deve andare perso';
              state.payslipDraft.photos=[{id:'photo-august',data:photo,fileName:'agosto.png',createdAt:Date.now()}];
              state.payslipDraft.imageData=photo;
              state.payslipEditorOpen=true;
              state.payslipDetailId='';
              render();
              window.fetch=function(url,options){
                if(String(url).indexOf('/api/payslip')!==-1 && options && options.method==='PUT') return Promise.reject(new Error('qa-offline'));
                return originalFetch.apply(this,arguments);
              };
              var ok=false;
              try { ok=await savePayslipDraft(); } finally { window.fetch=originalFetch; }
              return {
                ok:ok,
                editorOpen:state.payslipEditorOpen,
                draftPhotos:normalizePayslipPhotos(state.payslipDraft).length,
                draftNotes:state.payslipDraft.notes,
                archivedAugust:(state.payslips||[]).some(function(item){return Number(item.month)===8&&Number(item.year)===2026;}),
                status:state.payslipStatus
              };
            })()""",
            await_promise=True,
        )

        evaluate("state.activeTab='settings';state.settingsSection='data';render();true")
        wait_for("state.account.storage && state.account.storage.loaded", "spazio database")
        storage = evaluate(
            """(function(){
              var card=document.querySelector('.account-sync-health');
              return {
                visible:!!card,
                value:card ? (card.querySelector('.account-sync-health-grid strong:last-child')||{}).textContent : '',
                bytes:state.account.storage.bytes,
                entries:state.account.storage.entries,
                payslips:state.account.storage.payslips,
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )
        screenshot("03-account-storage.png")

        navigation = evaluate(
            """(function(){
              state.activeTab='profile';state.settingsSection='';render();
              var heroGear=!!document.querySelector('.profile-v2-identity > button:not(.profile-v2-avatar-button)');
              state.activeTab='settings';state.settingsSection='data';state.settingsReturnTarget='profile';render();
              var back=document.querySelector('[data-back-settings]');
              if(back) back.click();
              return {heroGear:heroGear,activeTab:state.activeTab,settingsSection:state.settingsSection};
            })()"""
        )

        editor_home = evaluate(
            """(function(){
              openEditor(new Date(2026,6,22));
              var header=document.querySelector('.day-editor-header');
              var left=document.querySelector('[data-adjust-editor-hours=breakHours][data-editor-delta="-0.5"]');
              var right=document.querySelector('[data-adjust-editor-hours=breakHours][data-editor-delta="0.5"]');
              var value=document.querySelector('.day-editor-step-value');
              var lr=left&&left.getBoundingClientRect(),rr=right&&right.getBoundingClientRect(),vr=value&&value.getBoundingClientRect();
              var stepDelta=lr&&rr&&vr ? Math.abs((vr.left+vr.width/2)-((lr.left+lr.width/2+rr.left+rr.width/2)/2)) : 999;
              var headerStyle=header&&getComputedStyle(header);
              var headerBackground=headerStyle ? headerStyle.backgroundImage : '';
              closeEditor();
              state.entries[toISODate(new Date())]={type:'malattia',start:'',end:'',breakHours:0,overtimeHours:0,overtimeManual:false,leaveHours:0,quantityHours:8,notes:''};
              state.activeTab='home';render();
              var facts=document.querySelector('.go-state-facts');
              return {
                autosaveChip:!!document.querySelector('[data-editor-autosave]'),
                headerBackground:headerBackground,
                stepCenterDelta:Math.round(stepDelta*10)/10,
                homeRegistrationText:document.querySelector('.go-day-card-v2').textContent.indexOf('Giornata registrata')!==-1,
                homeCoveredText:document.querySelector('.go-day-card-v2').textContent.indexOf('coperte')!==-1,
                homeFactsBorder:facts ? getComputedStyle(facts).borderTopWidth : '0px',
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )
        screenshot("04-home-state.png")

        call("Page.reload", {"ignoreCache": True})
        wait_for("typeof state !== 'undefined' && state.account && state.account.authenticated && !document.querySelector('.account-gate')", "reload account")
        wait_for("!document.querySelector('.go-splash-screen:not(.hidden)')", "reload splash")
        reloaded = evaluate(
            """(async function(){
              var july=(state.payslips||[]).find(function(item){return Number(item.month)===7&&Number(item.year)===2026;})||{};
              var deferred=Boolean(july.photosDeferred);
              if(july.id) july=await hydratePayslipRecord(july.id)||july;
              return {
                count:(state.payslips||[]).length,
                julyFound:!!july.id,
                julyDeferredBeforeOpen:deferred,
                julyNotes:july.notes,
                julyHourly:july.hourlyRate,
                julyPhotos:(july.photos||[]).length
              };
            })()""",
            await_promise=True,
        )

        lightweight = evaluate(
            """(function(){
              var stored=localStorage.getItem('gestore-payslips')||'';
              var safety=localStorage.getItem('gestore-safety-bundle-v1')||'';
              var compactRequest=(performance.getEntriesByType('resource')||[]).filter(function(item){return item.name.indexOf('/api/snapshot?compact=1')!==-1;}).pop();
              return {
                payslipCacheBytes:stored.length,
                safetyBytes:safety.length,
                cacheContainsPhoto:stored.indexOf('data:image')!==-1,
                safetyContainsPhoto:safety.indexOf('data:image')!==-1,
                compactTransfer:compactRequest?compactRequest.transferSize:0,
                dataReady:state.account.dataReady
              };
            })()"""
        )

        evaluate("state.activeTab='payslips';state.payslipEditorOpen=true;state.payslipDetailId='';resetPayslipDraft();render();document.getElementById('payslipNetto').focus();true")
        call(
            "Emulation.setDeviceMetricsOverride",
            {"width": 393, "height": 540, "deviceScaleFactor": 1, "mobile": True, "screenWidth": 393, "screenHeight": 852},
        )
        time.sleep(0.7)
        keyboard_open = evaluate(
            """(function(){
              var nav=document.querySelector('.bottom-nav');
              var input=document.getElementById('payslipNetto');
              return {
                bodyClass:document.body.classList.contains('keyboard-open'),
                bodyPosition:getComputedStyle(document.body).position,
                navVisibility:nav?getComputedStyle(nav).visibility:'missing',
                navOpacity:nav?getComputedStyle(nav).opacity:'',
                inputFont:input?parseFloat(getComputedStyle(input).fontSize):0,
                appHeight:getComputedStyle(document.getElementById('app')).height,
                windowScrollY:window.scrollY,
                screenScroll:Math.round((document.querySelector('.screen.active')||{}).scrollTop||0)
              };
            })()"""
        )
        evaluate("if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();true")
        call(
            "Emulation.setDeviceMetricsOverride",
            {"width": 393, "height": 852, "deviceScaleFactor": 1, "mobile": True, "screenWidth": 393, "screenHeight": 852},
        )
        time.sleep(0.7)
        keyboard_closed = evaluate(
            """(function(){
              var nav=document.querySelector('.bottom-nav');
              return {
                bodyClass:document.body.classList.contains('keyboard-open'),
                bodyPosition:getComputedStyle(document.body).position,
                navVisibility:nav?getComputedStyle(nav).visibility:'missing',
                navOpacity:nav?getComputedStyle(nav).opacity:'',
                appHeight:getComputedStyle(document.getElementById('app')).height,
                windowScrollY:window.scrollY
              };
            })()"""
        )

        checks = {
            "reuseRates": reused["enabled"] and reused["hourly"] == 12.5 and reused["overtime"] == 18.75 and reused["hourlyReadonly"],
            "saveConfirmed": saved.get("ok") and saved.get("editorClosed") and saved.get("remoteFound") and saved.get("remotePhotoCount") == 1 and saved.get("remotePhotosDeferred") and not saved.get("remoteHasEmbeddedPhotos") and saved.get("hydratedPhotos") == 1,
            "saveFields": saved.get("remoteHourly") == 12.5 and saved.get("remoteOvertime") == 18.75 and saved.get("remoteNotes") == "Bonifico ricevuto il 27 luglio",
            "photoZoom": zoom.get("opened") and zoom.get("afterButtons") == "200%" and "scale(2" in zoom.get("transformAfterButtons", "") and zoom.get("afterReset") == "100%" and zoom.get("afterDoubleTap") == "250%" and zoom.get("afterPinch") == "300%" and zoom.get("zoomedClass"),
            "failureKeepsDraft": (not failure["ok"]) and failure["editorOpen"] and failure["draftPhotos"] == 1 and not failure["archivedAugust"],
            "storageVisible": storage["visible"] and storage["bytes"] > 0 and storage["payslips"] == 2,
            "profileNavigation": (not navigation["heroGear"]) and navigation["activeTab"] == "profile" and navigation["settingsSection"] == "",
            "editorClean": (not editor_home["autosaveChip"]) and editor_home["headerBackground"] == "none" and editor_home["stepCenterDelta"] <= 1,
            "homeClean": (not editor_home["homeRegistrationText"]) and (not editor_home["homeCoveredText"]) and editor_home["homeFactsBorder"] == "0px",
            "reloadPersistent": reloaded["julyFound"] and reloaded["julyPhotos"] == 1 and reloaded["julyNotes"] == "Bonifico ricevuto il 27 luglio",
            "lightweightCache": lightweight["dataReady"] and not lightweight["cacheContainsPhoto"] and not lightweight["safetyContainsPhoto"] and lightweight["payslipCacheBytes"] < 10000,
            "keyboardStable": keyboard_open["bodyClass"] and keyboard_open["bodyPosition"] == "fixed" and keyboard_open["navVisibility"] == "hidden" and keyboard_open["inputFont"] >= 16 and keyboard_open["windowScrollY"] == 0 and (not keyboard_closed["bodyClass"]) and keyboard_closed["navVisibility"] == "visible" and keyboard_closed["windowScrollY"] == 0,
            "noOverflow": reused["overflow"] == 0 and storage["overflow"] == 0 and editor_home["overflow"] == 0,
        }
        qa = {
            "build": evaluate("document.querySelector('meta[name=gestore-build]').content"),
            "reused": reused,
            "saved": saved,
            "zoom": zoom,
            "failure": failure,
            "storage": storage,
            "navigation": navigation,
            "editorHome": editor_home,
            "reloaded": reloaded,
            "lightweight": lightweight,
            "keyboardOpen": keyboard_open,
            "keyboardClosed": keyboard_closed,
            "checks": checks,
            "errorBox": evaluate("(document.getElementById('errorBox')||{}).textContent||''"),
        }
        if not all(checks.values()):
            raise RuntimeError(json.dumps(qa, ensure_ascii=False, indent=2))
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
