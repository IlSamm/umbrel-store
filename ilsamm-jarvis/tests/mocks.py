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
class Gem(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def do_POST(self):
        n=int(self.headers.get("Content-Length") or 0);b=json.loads(self.rfile.read(n));GEM.append([self.path,b])
        last=b["contents"][-1]["parts"][0]
        q=last.get("text","")
        if "functionResponse" in last:
            out={"candidates":[{"content":{"role":"model","parts":[{"text":"Fatto, Signore: la temperatura in soggiorno è di 21,4 gradi e ho annotato il compleanno."}]}}]}
        elif "temperatura" in q.lower():
            out={"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"casa_stato","args":{"cerca":"temperatura"}}},{"functionCall":{"name":"memorizza","args":{"tipo":"nota","titolo":"Compleanno di Vale il 30 novembre"}}}]}}]}
        else:
            out={"candidates":[{"content":{"role":"model","parts":[{"text":"Certamente, Signore. Una domanda eccellente."}]}}]}
        if "/models/gemini-flash-latest" in self.path and "modello404" in q: self.send_response(404);self.end_headers();return
        bb=json.dumps(out).encode();self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(bb)));self.end_headers();self.wfile.write(bb)
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
    for cls,port in ((HA,18123),(Gem,18124)):
        s=ThreadingHTTPServer(("127.0.0.1",port),cls);threading.Thread(target=s.serve_forever,daemon=True).start()
    threading.Thread(target=whisper_srv,args=(10300,),daemon=True).start()
    threading.Thread(target=piper_srv,args=(10200,),daemon=True).start()
