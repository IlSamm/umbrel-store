import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket


ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER_PORT = 8798
DEBUG_PORT = 9258
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def read_json(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_http(url):
    for _ in range(80):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.1)
    raise RuntimeError("Bundle iOS locale non disponibile")


with tempfile.TemporaryDirectory(prefix="gestore-ios-local-qa-") as temp_root:
    temp_path = pathlib.Path(temp_root)
    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "http.server",
            str(SERVER_PORT),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(ROOT / "www"),
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    chrome = None
    ws = None
    try:
        wait_http(f"http://127.0.0.1:{SERVER_PORT}/index.html")
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

        def wait_for(expression, label, count=120):
            for _ in range(count):
                if evaluate(expression):
                    return
                time.sleep(0.1)
            raise RuntimeError(f"Timeout: {label}")

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
        call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=ios-local"})
        wait_for("window.GestOreRuntime && typeof state !== 'undefined' && state.account && state.account.dataReady", "avvio locale")
        wait_for("!document.body.classList.contains('app-booting')", "chiusura splash")
        wait_for("state.onboardingOpen === true", "onboarding automatico")

        initial = evaluate(
            """(function(){
              return {
                mode:window.GestOreRuntime.mode,
                localOnly:window.GestOreRuntime.localOnly,
                usesServer:window.GestOreRuntime.usesServer,
                accountAuthenticated:state.account.authenticated,
                accountGate:!!document.querySelector('.account-gate'),
                onboarding:state.onboardingOpen,
                overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
              };
            })()"""
        )

        saved = evaluate(
            """(async function(){
              closeOnboarding(true);
              state.entries['2026-08-25']={
                type:'lavoro',start:'08:00',end:'17:00',breakHours:1,
                overtimeHours:0,overtimeManual:false,leaveHours:0,quantityHours:0,notes:'QA locale'
              };
              state.payslips=[normalizePayslipRecord({
                id:'local-qa-payslip',month:8,year:2026,netto:1500,notes:'Solo dispositivo',createdAt:Date.now()
              })];
              saveEntries();
              savePayslips();
              var flushed=await flushServerSyncNow();
              return {
                flushed:flushed,
                entries:Object.keys(state.entries).length,
                payslips:state.payslips.length,
                syncMessage:getSyncStatusMessage(),
                pending:localStorage.getItem('gestore-pending-sync-v2')
              };
            })()""",
            await_promise=True,
        )

        api_requests = evaluate(
            """(performance.getEntriesByType('resource')||[])
              .map(function(item){return item.name;})
              .filter(function(name){return name.indexOf('/api/')!==-1;})"""
        )

        call("Page.reload", {"ignoreCache": True})
        wait_for("window.GestOreRuntime && typeof state !== 'undefined' && state.account && state.account.dataReady", "riavvio locale")
        wait_for("!document.body.classList.contains('app-booting')", "splash dopo riavvio")
        persisted = evaluate(
            """(function(){
              return {
                onboarding:state.onboardingOpen,
                entry:state.entries['2026-08-25'] && state.entries['2026-08-25'].notes,
                payslip:(state.payslips||[]).find(function(item){return item.id==='local-qa-payslip';})?.notes||'',
                accountGate:!!document.querySelector('.account-gate'),
                mode:window.GestOreRuntime.mode
              };
            })()"""
        )

        result = {
            "ok": (
                initial["mode"] == "local"
                and initial["localOnly"]
                and not initial["usesServer"]
                and not initial["accountAuthenticated"]
                and not initial["accountGate"]
                and initial["onboarding"]
                and initial["overflow"] <= 0
                and saved["flushed"]
                and saved["entries"] == 1
                and saved["payslips"] == 1
                and saved["pending"] is None
                and len(api_requests) == 0
                and not persisted["onboarding"]
                and persisted["entry"] == "QA locale"
                and persisted["payslip"] == "Solo dispositivo"
                and not persisted["accountGate"]
                and persisted["mode"] == "local"
            ),
            "initial": initial,
            "saved": saved,
            "apiRequests": api_requests,
            "persisted": persisted,
        }
        if not result["ok"]:
            raise RuntimeError(json.dumps(result, ensure_ascii=False, indent=2))
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
