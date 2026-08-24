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
OUT = ROOT / "tmp" / "visual-qa"
OUT.mkdir(parents=True, exist_ok=True)
PORT = 9224
SERVER_PORT = 8791
CHROME = pathlib.Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")


def read_json(url):
    with urllib.request.urlopen(url, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


temp_root = tempfile.TemporaryDirectory(prefix="gestore-visual-qa-")
temp_path = pathlib.Path(temp_root.name)
server_env = dict(os.environ)
server_env["GESTORE_DATA_DIR"] = str(temp_path / "data")
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
    env=server_env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
for _ in range(80):
    try:
        read_json(f"http://127.0.0.1:{SERVER_PORT}/api/auth/status")
        break
    except Exception:
        time.sleep(.1)
else:
    server.terminate()
    temp_root.cleanup()
    raise RuntimeError("Server GestOre non disponibile")

profile_dir = temp_path / "chrome-profile"
chrome = subprocess.Popen(
    [
        str(CHROME),
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        "--remote-allow-origins=*",
        f"--user-data-dir={profile_dir}",
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

try:
    targets = None
    for _ in range(40):
        try:
            targets = read_json(f"http://127.0.0.1:{PORT}/json/list")
            if targets:
                break
        except Exception:
            time.sleep(0.15)
    if not targets:
        raise RuntimeError("Chrome DevTools non disponibile")

    page_target = next(item for item in targets if item.get("type") == "page")
    ws = websocket.create_connection(page_target["webSocketDebuggerUrl"], timeout=8)
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

    def screenshot(name, full_page=True):
        clip = None
        if full_page:
            metrics = call("Page.getLayoutMetrics")
            content = metrics.get("cssContentSize") or metrics.get("contentSize") or {}
            clip = {
                "x": 0,
                "y": 0,
                "width": 393,
                "height": min(2200, max(852, float(content.get("height", 852)))),
                "scale": 1,
            }
        params = {"format": "png", "captureBeyondViewport": True, "fromSurface": True}
        if clip:
            params["clip"] = clip
        data = call("Page.captureScreenshot", params)["data"]
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
    call("Page.navigate", {"url": f"http://127.0.0.1:{SERVER_PORT}/?qa=visual"})
    for _ in range(100):
        if evaluate("!!document.querySelector('[data-account-form=register]')"):
            break
        time.sleep(.1)
    else:
        raise RuntimeError("Registrazione visual QA non disponibile")
    evaluate(
        """(async function(){
          var form=document.querySelector('[data-account-form=register]');
          form.querySelector('[name=username]').value='visualqa';
          form.querySelector('[name=password]').value='password-qa-2026';
          form.querySelector('[name=confirmPassword]').value='password-qa-2026';
          await submitAccountRegistration(form);
          return true;
        })()""",
        await_promise=True,
    )
    for _ in range(140):
        ready = evaluate(
            "typeof state!=='undefined' && state.account && state.account.authenticated && state.account.dataReady && !document.querySelector('.account-gate')"
        )
        if ready:
            break
        time.sleep(.12)
    if not ready:
        raise RuntimeError("Account visual QA non disponibile")
    for _ in range(100):
        if evaluate("!document.querySelector('.go-splash-screen:not(.hidden)')"):
            break
        time.sleep(.1)

    seeded = evaluate(
        """(async function(){
          if(typeof closeOnboarding==='function') closeOnboarding(true);
          if(typeof platformState!=='undefined'){platformState.recoveryOpen=false;platformState.releaseOpen=false;}
          var photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
          state.entries={
            '2026-07-01':{type:'lavoro',start:'08:00',end:'17:00',breakHours:1,overtimeHours:0,overtimeManual:false,notes:''},
            '2026-07-02':{type:'lavoro',start:'08:00',end:'18:30',breakHours:1,overtimeHours:1.5,overtimeManual:true,notes:'Turno lungo'},
            '2026-07-03':{type:'ferie',quantityHours:8,notes:''},
            '2026-07-06':{type:'lavoro',start:'07:30',end:'16:30',breakHours:1,overtimeHours:0,overtimeManual:false,notes:''}
          };
          for(var day=7;day<=31;day+=1){
            var current=new Date(2026,6,day,12,0,0);
            var weekday=current.getDay();
            if(weekday===0||weekday===6) continue;
            var key='2026-07-'+String(day).padStart(2,'0');
            if(!state.entries[key]) state.entries[key]={type:'lavoro',start:'08:00',end:day%4===0?'18:00':'17:00',breakHours:1,overtimeHours:day%4===0?1:0,overtimeManual:true,notes:''};
          }
          state.entries['2026-07-15']={type:'malattia',quantityHours:8,notes:''};
          state.entries['2026-07-24']={type:'permesso',quantityHours:4,notes:'Permesso pomeridiano'};
          state.payslips=[
            normalizePayslipRecord({id:'qa-may',month:5,year:2026,netto:1480,hourlyRate:12.5,overtimeRate:18.75,notes:'Maggio',photos:[{id:'p1',data:photo,thumbnail:photo,fileName:'maggio.png',createdAt:Date.now()}],createdAt:Date.now()-2000}),
            normalizePayslipRecord({id:'qa-june',month:6,year:2026,netto:1525,hourlyRate:12.5,overtimeRate:18.75,notes:'Giugno',photos:[{id:'p2',data:photo,thumbnail:photo,fileName:'giugno.png',createdAt:Date.now()}],createdAt:Date.now()-1000}),
            normalizePayslipRecord({id:'qa-july',month:7,year:2026,netto:1795,hourlyRate:12.5,overtimeRate:18.75,notes:'Luglio',photos:[{id:'p3',data:photo,thumbnail:photo,fileName:'luglio.png',createdAt:Date.now()}],createdAt:Date.now()})
          ];
          persistPayslipsLocally();
          await Promise.all(state.payslips.map(function(item){return persistPayslipRecordToServer(item);}));
          saveEntries();
          state.settings.userName='Samuele';
          state.settingsDraft=Object.assign({},state.settings);
          state.currentMonth=new Date(2026,6,1);
          await loadPdfReportModules();
          render();
          return {payslips:state.payslips.length,pdf:!!window.GestOrePdfReports};
        })()""",
        await_promise=True,
    )
    if seeded.get("payslips") != 3 or not seeded.get("pdf"):
        raise RuntimeError(f"Dati visual QA incompleti: {seeded}")

    evaluate("state.activeTab='payslips'; state.payslipArchiveOpen=true; state.payslipDetailId=''; state.payslipEditorOpen=false; state.payslipViewer=null; render();")
    evaluate(
        """(function(){
          var button=document.querySelector('[data-dismiss-weekly-review]');
          if(button) button.click();
          return true;
        })()"""
    )
    time.sleep(0.25)
    screenshot("payslips-archive.png")

    evaluate("document.querySelector('.payroll-archive-row').click()")
    time.sleep(0.2)
    archive_click_state = evaluate("({detail:state.payslipDetailId, editor:state.payslipEditorOpen})")
    screenshot("payslips-detail.png")

    evaluate("document.querySelector('[data-view-payslip-photo]').click()")
    time.sleep(0.2)
    screenshot("payslips-viewer.png", full_page=False)
    evaluate("document.querySelector('[data-close-payslip-viewer]').click()")
    time.sleep(0.15)

    evaluate("document.querySelector('[data-edit-payslip]').click()")
    time.sleep(0.2)
    edit_click_state = evaluate("({detail:state.payslipDetailId, editor:state.payslipEditorOpen, draft:state.payslipDraft && state.payslipDraft.id})")
    screenshot("payslips-editor.png")
    evaluate("(function(){var screen=document.querySelector('.payslips-screen'); if(screen){screen.scrollTop=screen.scrollHeight;} return screen ? {top:screen.scrollTop,height:screen.scrollHeight} : null;})()")
    time.sleep(0.15)
    screenshot("payslips-editor-bottom.png")
    rate_switch_geometry = evaluate(
        """(function(){
          var track=document.querySelector('.payroll-rate-switch');
          var knob=track && track.querySelector('i');
          if(!track || !knob) return {present:false};
          var t=track.getBoundingClientRect(), k=knob.getBoundingClientRect();
          return {present:true,track:[t.width,t.height],knob:[k.width,k.height],left:k.left-t.left,right:t.right-k.right,
            inside:k.left>=t.left+1 && k.right<=t.right-1,centered:Math.abs((k.top+k.height/2)-(t.top+t.height/2))<0.75};
        })()"""
    )

    evaluate("""(function(){
      var netto=document.getElementById('payslipNetto');
      var lordo=document.getElementById('payslipLordo');
      var company=document.getElementById('payslipCompany');
      netto.value='1843,25'; netto.dispatchEvent(new Event('input',{bubbles:true}));
      lordo.value='2260,50'; lordo.dispatchEvent(new Event('input',{bubbles:true}));
      company.value='GestOre QA Srl'; company.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('[data-toggle-payslip-company-default]').click();
      document.querySelector('[data-save-payslip]').click();
    })()""")
    time.sleep(0.35)
    save_state = evaluate("""(function(){
      var item=state.payslips.find(function(candidate){return candidate.id===state.payslipDetailId;})||{};
      return {detail:state.payslipDetailId,editor:state.payslipEditorOpen,amount:item.netto,
        gross:item.lordo,company:item.company,defaultCompany:state.settings.defaultPayslipCompany};
    })()""")

    evaluate("state.payslipArchiveOpen=false;state.payslipDetailId=null;state.payslipEstimateOpen=true;state.payslipEstimateConfigOpen=true;state.payrollPrivateUnlocked=true;render();")
    time.sleep(0.25)
    private_switch_before = evaluate(
        """(function(){
          var track=document.querySelector('[data-payroll-private-toggle]');
          var knob=track && track.querySelector('i');
          if(!track || !knob) return {present:false};
          track.scrollIntoView({block:'center'});
          var t=track.getBoundingClientRect(), k=knob.getBoundingClientRect();
          return {present:true,checked:track.getAttribute('aria-checked'),track:[t.width,t.height],knob:[k.width,k.height],
            left:k.left-t.left,right:t.right-k.right,inside:k.left>=t.left+1 && k.right<=t.right-1,
            centered:Math.abs((k.top+k.height/2)-(t.top+t.height/2))<0.75};
        })()"""
    )
    screenshot("payroll-private-switch-off.png", full_page=False)
    evaluate("document.querySelector('[data-payroll-private-toggle]').click()")
    time.sleep(0.28)
    private_switch_after = evaluate(
        """(function(){
          var track=document.querySelector('[data-payroll-private-toggle]'),knob=track.querySelector('i');
          var t=track.getBoundingClientRect(),k=knob.getBoundingClientRect();
          return {checked:track.getAttribute('aria-checked'),left:k.left-t.left,right:t.right-k.right,
            inside:k.left>=t.left+1 && k.right<=t.right-1,centered:Math.abs((k.top+k.height/2)-(t.top+t.height/2))<0.75};
        })()"""
    )
    screenshot("payroll-private-switch-on.png", full_page=False)

    pdf_script = """
      (async function () {
        function encode(bytes) {
          var binary = '';
          for (var offset = 0; offset < bytes.length; offset += 32768) {
            binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(bytes.length, offset + 32768)));
          }
          return btoa(binary);
        }
        var monthly = window.GestOrePdfReports.monthly(new Date(2026, 6, 1));
        var yearly = window.GestOrePdfReports.yearly(new Date(2026, 0, 1));
        return {
          monthly: encode(new Uint8Array(await monthly.arrayBuffer())),
          yearly: encode(new Uint8Array(await yearly.arrayBuffer()))
        };
      })()
    """
    pdfs = evaluate(pdf_script, await_promise=True)
    (OUT / "GestOre_Report_2026-07_Luglio.pdf").write_bytes(base64.b64decode(pdfs["monthly"]))
    (OUT / "GestOre_Report_Anno_2026.pdf").write_bytes(base64.b64decode(pdfs["yearly"]))

    qa = {
        "archiveClick": archive_click_state,
        "editClick": edit_click_state,
        "saveClick": save_state,
        "rateSwitch": rate_switch_geometry,
        "privateSwitch": {"before": private_switch_before, "after": private_switch_after},
        "inlineTests": evaluate("runInlineTests()"),
        "errorBox": evaluate("document.getElementById('errorBox') ? document.getElementById('errorBox').textContent : ''"),
        "payslips": evaluate("state.payslips.length"),
        "entries": evaluate("Object.keys(state.entries || {}).length"),
    }
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2), encoding="utf-8")
    print(json.dumps(qa))
    ws.close()
finally:
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
    temp_root.cleanup()
