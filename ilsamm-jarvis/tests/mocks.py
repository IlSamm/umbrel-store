import json, threading, socket, struct, io, wave, math
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
CALLS=[]
STATES=[
 {"entity_id":"light.luce_salotto","state":"off","attributes":{"friendly_name":"Luce Salotto"}},
 {"entity_id":"light.luce_cucina","state":"on","attributes":{"friendly_name":"Luce Cucina"}},
 {"entity_id":"switch.presa_tv","state":"off","attributes":{"friendly_name":"Presa TV"}},
 {"entity_id":"cover.tapparella_camera","state":"open","attributes":{"friendly_name":"Tapparella Camera"}},
 {"entity_id":"sensor.temperatura_soggiorno","state":"21.4","attributes":{"friendly_name":"Temperatura Soggiorno","unit_of_measurement":"°C"}},
 {"entity_id":"todo.lista_della_spesa","state":"2","attributes":{"friendly_name":"Lista della spesa"}},
 {"entity_id":"calendar.casa","state":"off","attributes":{"friendly_name":"Casa"}},
]
class HA(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def _j(self,c,o):
        b=json.dumps(o).encode();self.send_response(c);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(b)));self.end_headers();self.wfile.write(b)
    def do_GET(self):
        if self.headers.get("Authorization")!="Bearer TOKEN":return self._j(401,{"message":"unauth"})
        if self.path=="/api/":return self._j(200,{"message":"API running."})
        if self.path=="/api/states":return self._j(200,STATES)
        if self.path=="/api/config":return self._j(200,{"latitude":45.46,"longitude":9.19,"location_name":"Casa"})
        if self.path.startswith("/api/calendars/calendar.casa"):return self._j(200,[{"summary":"Cena da Vale","start":{"dateTime":"2026-11-01T20:00:00+01:00"}}])
        self._j(404,{})
    def do_POST(self):
        if self.headers.get("Authorization")!="Bearer TOKEN":return self._j(401,{"message":"unauth"})
        n=int(self.headers.get("Content-Length") or 0);d=json.loads(self.rfile.read(n) or b"{}");CALLS.append([self.path,d])
        for s in STATES:
            ids=d.get("entity_id");ids=ids if isinstance(ids,list) else [ids]
            if s["entity_id"] in ids:
                if self.path.endswith("turn_on") or self.path.endswith("open_cover"):s["state"]="on" if not s["entity_id"].startswith("cover") else "open"
                if self.path.endswith("turn_off") or self.path.endswith("close_cover"):s["state"]="off" if not s["entity_id"].startswith("cover") else "closed"
        self._j(200,[])
GEM=[]
GEMCFG={"esauriti":set()}
class Gem(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def _j(self,c,o):
        bb=json.dumps(o).encode();self.send_response(c);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(bb)));self.end_headers();self.wfile.write(bb)
    def do_GET(self):
        if self.path.startswith("/v1beta/models?"):
            return self._j(200,{"models":[{"name":"models/"+n,"supportedGenerationMethods":["generateContent"]} for n in ("gemini-3.8-flash","gemini-3.5-flash-lite","gemini-2.5-flash-image","text-embedding-004")]})
        self._j(404,{})
    def do_POST(self):
        n=int(self.headers.get("Content-Length") or 0);b=json.loads(self.rfile.read(n));GEM.append([self.path,b])
        model=self.path.split("/models/")[1].split(":")[0]
        if model in GEMCFG["esauriti"]:return self._j(429,{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}})
        if "KEYBAD" in self.path:return self._j(400,{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}})
        last=b["contents"][-1]["parts"][0]
        q=last.get("text","")
        if any("google_search" in t for t in b.get("tools") or []):
            return self._j(200,{"candidates":[{"content":{"role":"model","parts":[{"text":"Ieri l'Inter ha battuto il Milan 2 a 1 a San Siro."}]},"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://example.org/derby","title":"gazzetta.it"}}]}}]})
        if "functionResponse" in last and last["functionResponse"]["name"]=="cerca_web":
            r=last["functionResponse"]["response"]["risultato"]
            out={"candidates":[{"content":{"role":"model","parts":[{"text":"Signore, "+r.get("risposta","niente")}]}}]}
        elif "functionResponse" in last:
            out={"candidates":[{"content":{"role":"model","parts":[{"text":"Fatto, Signore: la temperatura in soggiorno è di 21,4 gradi e ho annotato il compleanno."}]}}]}
        elif "derby" in q.lower():
            out={"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"cerca_web","args":{"domanda":"risultato derby Inter Milan"}}}]}}]}
        elif "temperatura" in q.lower():
            out={"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"casa_stato","args":{"cerca":"temperatura"}}},{"functionCall":{"name":"memorizza","args":{"tipo":"nota","titolo":"Compleanno di Vale il 30 novembre"}}}]}}]}
        else:
            out={"candidates":[{"content":{"role":"model","parts":[{"text":"Certamente, Signore. Una domanda eccellente."}]}}]}
        if "/models/gemini-flash-latest" in self.path and "modello404" in q: self.send_response(404);self.end_headers();return
        bb=json.dumps(out).encode();self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(bb)));self.end_headers();self.wfile.write(bb)
class Web(BaseHTTPRequestHandler):
    """Open-Meteo, geocoding e Wikipedia finti."""
    def log_message(self,*a):pass
    def _j(self,o):
        bb=json.dumps(o).encode();self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(bb)));self.end_headers();self.wfile.write(bb)
    def do_GET(self):
        p=self.path
        if p.startswith("/v1/search"):
            nome="Roma" if "roma" in p.lower() else "Milano"
            return self._j({"results":[{"name":nome,"latitude":41.9 if nome=="Roma" else 45.46,"longitude":12.5 if nome=="Roma" else 9.19}]})
        if p.startswith("/v1/forecast"):
            WEB.append(p);roma="latitude=41.9" in p
            return self._j({"current":{"temperature_2m":19.6 if roma else 13.2,"apparent_temperature":12.0,"weather_code":3,"wind_speed_10m":8},
                            "daily":{"time":["2026-10-31","2026-11-01","2026-11-02"],"weather_code":[3,61,0],"temperature_2m_max":[16.4,14.0,17.2],"temperature_2m_min":[9.1,8.0,7.5],"precipitation_probability_max":[10,70,0]}})
        if p.startswith("/w/api.php"):
            return self._j({"query":{"search":[{"title":"Leonardo da Vinci"}]}})
        if p.startswith("/api/rest_v1/page/summary/"):
            return self._j({"extract":"Leonardo da Vinci è stato un inventore, artista e scienziato italiano. Nacque a Vinci nel 1452. Altro.","content_urls":{"desktop":{"page":"https://it.wikipedia.org/wiki/Leonardo_da_Vinci"}}})
        self.send_response(404);self.end_headers()
WEB=[]
def wy_read(f):
    line=f.readline()
    if not line:return None
    h=json.loads(line);d=h.get("data") or {}
    if h.get("data_length"):d.update(json.loads(f.read(h["data_length"])))
    p=f.read(h["payload_length"]) if h.get("payload_length") else b""
    return h["type"],d,p
def wy_send(s,t,d=None,p=b""):
    h={"type":t};db=b""
    if d is not None:db=json.dumps(d).encode();h["data_length"]=len(db)
    if p:h["payload_length"]=len(p)
    s.sendall(json.dumps(h).encode()+b"\n"+db+p)
WY={"audio":0}
def whisper_srv(port):
    ls=socket.socket();ls.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);ls.bind(("127.0.0.1",port));ls.listen(5)
    def h(c):
        f=c.makefile("rb")
        while True:
            ev=wy_read(f)
            if ev is None:break
            if ev[0]=="audio-chunk":WY["audio"]+=len(ev[2])
            if ev[0]=="audio-stop":wy_send(c,"transcript",{"text":" Accendi la luce del salotto"});break
        c.close()
    while True:
        c,_=ls.accept();threading.Thread(target=h,args=(c,),daemon=True).start()
def piper_srv(port):
    ls=socket.socket();ls.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);ls.bind(("127.0.0.1",port));ls.listen(5)
    def h(c):
        f=c.makefile("rb");ev=wy_read(f)
        pcm=b"".join(struct.pack("<h",int(8000*math.sin(i/10))) for i in range(22050))
        wy_send(c,"audio-start",{"rate":22050,"width":2,"channels":1});wy_send(c,"audio-chunk",{"rate":22050,"width":2,"channels":1},pcm);wy_send(c,"audio-stop",{});c.close()
    while True:
        c,_=ls.accept();threading.Thread(target=h,args=(c,),daemon=True).start()
def start():
    for cls,port in ((HA,18123),(Gem,18124),(Web,18125)):
        s=ThreadingHTTPServer(("127.0.0.1",port),cls);threading.Thread(target=s.serve_forever,daemon=True).start()
    threading.Thread(target=whisper_srv,args=(10300,),daemon=True).start()
    threading.Thread(target=piper_srv,args=(10200,),daemon=True).start()
