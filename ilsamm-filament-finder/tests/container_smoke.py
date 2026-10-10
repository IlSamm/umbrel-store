"""Verify the actual container before publishing an image."""
import json
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base=sys.argv[1]
def get(path):
    with urlopen(base+path,timeout=3) as r:
        return r.read()
for attempt in range(30):
    try:
        health=json.loads(get('/api/health'))
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('Container did not become healthy')
assert health['version']=='11.0.0',health
assert b'app.mjs' in get('/')
assert len(json.loads(get('/catalog.json'))['materials'])==67
for path in ('/server.py','/data/alerts.json'):
    try:
        get(path)
        raise AssertionError(f'Private file exposed: {path}')
    except HTTPError as error:
        assert error.code==404
if '--verify-persistence' in sys.argv:
    assert any(a['signature']=='smoke|pla' for a in json.loads(get('/api/alerts'))['alerts'])
else:
    body={'alert':{'signature':'smoke|pla','label':'Container persistence test','material':'PLA','quantity':1,'enabled':False,'config':{}}}
    with urlopen(Request(base+'/api/alerts',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=3) as r:
        assert json.load(r)['ok']
print('CONTAINER_SMOKE_OK')
