"""Explicit live release check, separate from deterministic regression tests."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import server

with tempfile.TemporaryDirectory(prefix='ff-live-') as folder:
    server.DATA_DIR=folder
    server.ALERTS_FILE=str(Path(folder)/'alerts.json')
    server.HISTORY_FILE=str(Path(folder)/'history.json')
    server.EVENTS_FILE=str(Path(folder)/'events.json')
    for material in ('PLA Basic','PLA Matte','PETG HF'):
        data=server.live_catalog(material,force=True,source_filter='bambu')
        assert [s['id'] for s in data['sources']]==['bambu']
        offers=data['offers']
        assert offers,material
        assert all(o['price']>0 and isinstance(o['available'],bool) for o in offers)
        # Stock is a merchant fact. Sold-out variants must remain explicitly sold out.
        assert any(any(word in (o.get('format') or '').lower() for word in ('ricarica','refill')) for o in offers),material
        assert any(('bobina' in (o.get('format') or '').lower() or 'spool' in (o.get('format') or '').lower()) for o in offers),material
        assert data['sources'][0]['results']==len(offers)
        print(material,len(offers),'variants OK;',sum(o['available'] for o in offers),'available')
