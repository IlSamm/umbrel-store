"""Isolated real HTTP app for browser tests, without external background polling."""
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
with tempfile.TemporaryDirectory(prefix='filament-ui-tests-') as folder:
    os.environ['FILAMENT_FINDER_DATA_DIR']=folder
    import server
    class QuietHandler(server.Handler):
        def log_message(self, *args):
            pass
    server.ThreadingHTTPServer(('127.0.0.1',18766),QuietHandler).serve_forever()
