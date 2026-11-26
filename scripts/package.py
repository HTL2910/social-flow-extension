from pathlib import Path
import json, zipfile, tempfile, re, sys
from PIL import Image
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'extension/manifest.json').read_text())
version = manifest['version']
out = Path(sys.argv[1]).resolve()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((root/'extension').rglob('*')):
        if f.is_file(): z.write(f,f.relative_to(root/'extension'))
    z.write(root/'README.md','HUONG-DAN.md')
    z.write(root/'TEST-REPORT.md','KIEM-THU.md')
    for f in sorted(root.rglob('*')):
        if f.is_file() and not any(x in f.relative_to(root).parts for x in ['.git','node_modules','test-output']):
            z.write(f,Path('development')/f.relative_to(root))
with tempfile.TemporaryDirectory() as td:
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        assert 'manifest.json' in z.namelist()
        assert not any('..' in Path(n).parts or n.startswith('/') for n in z.namelist())
        z.extractall(td)
    unpacked=Path(td)
    for f in [manifest['background']['service_worker'],manifest['action']['default_popup'],*manifest['icons'].values()]:
        assert (unpacked/f).is_file(),f
    for f in re.findall(r'(?:src|href)="([^"]+)"',(unpacked/'popup.html').read_text()):
        assert (unpacked/f).is_file(),f
    for size,f in manifest['icons'].items():
        with Image.open(unpacked/f) as im:
            assert im.size==(int(size),int(size));im.verify()
print(json.dumps({'archive':str(out),'version':version,'bytes':out.stat().st_size,'rootManifest':True,'fileReferences':'valid','crc':'valid'}))
