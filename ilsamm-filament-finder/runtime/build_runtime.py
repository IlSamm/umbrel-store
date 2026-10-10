"""Build the deployable app from reviewed, plain-text sources (no runtime patches)."""
from pathlib import Path
import json
import shutil
import sys


def build(root, output):
    source = Path(root).resolve() / 'ilsamm-filament-finder' / 'src'
    output = Path(output).resolve()
    if output == source or output in source.parents or source in output.parents:
        raise ValueError('Output must be separate from the source tree')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Output directory must be empty')
    for filename in ('server.py', 'catalog_tools.py'):
        compile((source / filename).read_text(encoding='utf-8'), filename, 'exec')
    catalog = json.loads((source / 'web/catalog.json').read_text(encoding='utf-8'))
    if not catalog.get('materials') or not catalog.get('printers'):
        raise ValueError('Catalog is incomplete')
    for filename in ('index.html', 'app.mjs', 'domain.mjs', 'app.css', 'icon.svg', 'spool.svg'):
        if not (source / 'web' / filename).is_file():
            raise ValueError(f'Missing asset: {filename}')
    shutil.copytree(source, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'data'))
    print(f'Filament Finder assembled at {output}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: build_runtime.py <store-root> <empty-output-directory>')
    build(sys.argv[1], sys.argv[2])
