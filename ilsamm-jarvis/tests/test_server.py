"""Prove del server di Jarvis con Home Assistant, Gemini, Whisper e Piper finti. Uso: python tests/test_server.py"""
import os,sys,json,threading,time,urllib.request,urllib.error,io,wave,struct,math,shutil,tempfile
QUI=os.path.dirname(os.path.abspath(__file__))
D=tempfile.mkdtemp(prefix="jarvis-test-")
os.environ.update(JARVIS_DATA=D,PORT="18080",WHISPER_HOST="127.0.0.1:10300",PIPER_HOST="127.0.0.1:10200",GEMINI_BASE="http://127.0.0.1:18124/v1beta",EDGE_TTS_BIN="edge-tts-non-esiste",HA_CANDIDATES="http://127.0.0.1:1,http://127.0.0.1:18123",METEO_BASE="http://127.0.0.1:18125/v1",GEO_BASE="http://127.0.0.1:18125/v1",WIKI_BASE="http://127.0.0.1:18125")
sys.path.insert(0,QUI);sys.path.insert(0,os.path.join(QUI,"..","server"));import mocks;mocks.start()
import jarvis_server as J
srv=J.ThreadingHTTPServer(("127.0.0.1",18080),J.H);threading.Thread(target=srv.serve_forever,daemon=True).start();time.sleep(.3)
B="http://127.0.0.1:18080"
def req(p,data=None,method=None,raw=None,ctype="application/json"):
    body=raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    r=urllib.request.Request(B+p,data=body,method=method or ("POST" if body is not None else "GET"),headers={"Content-Type":ctype})
    with urllib.request.urlopen(r,timeout=30) as x:
        b=x.read();return (json.loads(b) if x.headers.get("Content-Type","").startswith("application/json") else (x.headers.get("Content-Type"),len(b)))
ERRORI=[]
def ok(c,m):
    print(("OK  " if c else "ERR ")+m)
    if not c:ERRORI.append(m)
s=req("/api/status");ok(not s["gemini"] and s["whisper"] and s["piper"],"stato iniziale "+json.dumps(s))
r=req("/api/ask",{"text":"accendi la luce del salotto"});ok("token" in r["reply"].lower() or "cervello" in r["reply"].lower() or r["via"]=="offline","senza config: "+r["reply"])
req("/api/config",{"ha_url":"http://127.0.0.1:18123","ha_token":"TOKEN","titolo":"Signore"})
c=req("/api/config");ok(c["ha_token_impostata"] and "ha_token" not in c,"config mascherata")
for q in ["accendi la luce del salotto","Jarvis spegni la presa della tv","chiudi la tapparella","spegni tutte le luci","accendi la luce della cucina al 40 per cento"]:
    r=req("/api/ask",{"text":q});print("   ",q,"->",r["reply"],r["via"],r["casa"])
ok(any(c[0]=="/api/services/light/turn_on" and c[1].get("entity_id")=="light.luce_salotto" for c in mocks.CALLS),"luce salotto accesa su HA")
ok(any(c[0]=="/api/services/cover/close_cover" for c in mocks.CALLS),"tapparella chiusa")
ok(any(c[0]=="/api/services/light/turn_on" and c[1].get("brightness_pct")==40 for c in mocks.CALLS),"luminosità 40%")
for q in ["ho speso 45 euro di benzina","oggi ho pagato 12,50 al bar","quanto ho speso questo mese?","ricorda che mia sorella si chiama Giulia","aggiungi latte, pane e uova alla lista della spesa","che ore sono"]:
    r=req("/api/ask",{"text":q});print("   ",q,"->",r["reply"],r["memorie"][:3])
ok(sum(1 for c in mocks.CALLS if c[0]=="/api/services/todo/add_item")==3,"lista della spesa: 3 cose")
r=req("/api/ask",{"text":"qual è la capitale della Francia?"});ok(r["via"]=="offline" and "Gemini" in r["reply"],"senza chiave Gemini: "+r["reply"][:70])
req("/api/config",{"gemini_key":"KEYX"})
r=req("/api/ask",{"text":"che temperatura c'è in soggiorno? e ricordati il compleanno di Vale"});ok(r["via"]=="gemini" and r["memorie"],"gemini con strumenti: "+r["reply"]+" casa="+str(r["casa"]))
g=mocks.GEM[-1][1];ok(any("functionResponse" in p for c in g["contents"] for p in c["parts"]),"risposta strumenti inviata a Gemini")
r=req("/api/ask",{"text":"raccontami una barzelletta"});ok(r["via"]=="gemini","gemini semplice: "+r["reply"])
m=req("/api/mem");ok(len(m["ricordi"])==4 and m["spese_mese"]==57.5,"memoria %d ricordi, spese %s"%(len(m["ricordi"]),m["spese_mese"]))
rid=m["ricordi"][0]["id"];ok(req("/api/mem/"+rid,method="DELETE")["ok"],"dimentica")
h=req("/api/home");ok(h["ok"] and len(h["dispositivi"])>=6,"casa: %d dispositivi"%len(h["dispositivi"]))
t=req("/api/tts?text=Buongiorno%20Signore");ok(t[0]=="audio/wav" and t[1]>40000,"tts (riserva Piper) "+str(t))
buf=io.BytesIO();w=wave.open(buf,"wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(44100);w.writeframes(b"".join(struct.pack("<h",int(3000*math.sin(i/7))) for i in range(44100)));w.close()
r=req("/api/stt",raw=buf.getvalue(),ctype="audio/wav");ok(r["text"]=="Accendi la luce del salotto" and mocks.WY["audio"]==32000,"stt whisper: %s (%d byte a 16kHz)"%(r["text"],mocks.WY["audio"]))
key=req("/api/config")["device_key"]
try:req("/api/device/voice",raw=buf.getvalue(),ctype="audio/wav");ok(False,"dispositivo senza chiave")
except urllib.error.HTTPError as e:ok(e.code==401,"dispositivo senza chiave rifiutato")
r=req("/api/device/voice?key="+key,raw=buf.getvalue(),ctype="audio/wav");ok(r["text"] and "audio" in r,"voce dispositivo: %s -> %s"%(r["text"],r["reply"]))
t=req(r["audio"]);ok(t[0]=="audio/wav","audio per il dispositivo "+str(t))
# internet: meteo, ricerca, modelli esauriti
r=req("/api/ask",{"text":"che tempo fa?"});ok("13 gradi" in r["reply"] and "coperto" in r["reply"] and r["reply"].startswith("Qui fuori"),"meteo di casa senza Gemini: "+r["reply"])
r=req("/api/ask",{"text":"pioverà domani a Roma?"});ok("Roma" in r["reply"] and "70%" in r["reply"],"previsioni per domani a Roma: "+r["reply"])
r=req("/api/ask",{"text":"che temperatura c'è in soggiorno?"});ok(r["via"]=="gemini","la temperatura del soggiorno non va al meteo")
mocks.GEMCFG["esauriti"]={"gemini-flash-lite-latest"}
r=req("/api/ask",{"text":"come è finito il derby?"});ok(r["via"]=="gemini" and "Inter" in r["reply"] and r["fonti"],"ricerca web con fonti: "+r["reply"])
usati=[g[0].split("/models/")[1].split(":")[0] for g in mocks.GEM[-4:]];ok("gemini-flash-lite-latest" in usati and "gemini-2.5-flash" in usati,"modello esaurito saltato: "+str(usati))
mocks.GEMCFG["esauriti"]={"gemini-flash-lite-latest","gemini-2.5-flash","gemini-flash-latest","gemini-2.5-flash-lite","gemini-3.8-flash"}
r=req("/api/ask",{"text":"raccontami una barzelletta"});ok(r["via"]=="gemini" and mocks.GEM[-1][0].split("/models/")[1].startswith("gemini-3.5-flash-lite"),"modello trovato nell'elenco di Google")
mocks.GEMCFG["esauriti"]={"gemini-flash-lite-latest","gemini-2.5-flash","gemini-flash-latest","gemini-2.5-flash-lite","gemini-3.8-flash","gemini-3.5-flash-lite"}
r=req("/api/ask",{"text":"raccontami una barzelletta"});ok(r["via"]=="offline" and "limite" in r["reply"],"tutti esauriti spiegato: "+r["reply"])
r=req("/api/ask",{"text":"chi è Leonardo da Vinci?"});ok(r["via"]=="internet" and "1452" in r["reply"],"senza Gemini risponde da Wikipedia: "+r["reply"])
mocks.GEMCFG["esauriti"]=set()
req("/api/config",{"gemini_key":"KEYBAD"})
r=req("/api/ask",{"text":"raccontami una barzelletta"});ok("chiave" in r["reply"],"chiave sbagliata spiegata: "+r["reply"])
req("/api/config",{"gemini_key":"KEYX"})
# indirizzo di Home Assistant sbagliato: lo ritrova da solo
req("/api/config",{"ha_url":"http://127.0.0.1:9"})
s=req("/api/status");ok(s["home_assistant"]["collegato"] and req("/api/config")["ha_url"]=="http://127.0.0.1:18123","Home Assistant ritrovato da solo")
req("/api/config",{"ha_token":"SBAGLIATO"})
s=req("/api/status");ok(not s["home_assistant"]["collegato"] and "token" in s["home_assistant"]["errore"],"token sbagliato spiegato: "+s["home_assistant"]["errore"])
r=req("/");ok(r[0].startswith("text/html"),"pagina servita")
r=req("/fonts/rajdhani-Medium.woff");ok(r[0]=="font/woff","carattere servito dall'app")
shutil.rmtree(D,ignore_errors=True)
print("fine:",("tutto OK" if not ERRORI else "%d errori"%len(ERRORI)))
sys.exit(1 if ERRORI else 0)
