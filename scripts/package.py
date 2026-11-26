from pathlib import Path
import argparse
import json
import re
import struct
import tempfile
import zipfile
import zlib


PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
EXCLUDED_PARTS = {'.git', 'node_modules', 'test-output', '__pycache__'}


def verify_png_dimensions(path: Path, expected_size: int) -> None:
    data = path.read_bytes()
    if len(data) < 33 or data[:8] != PNG_SIGNATURE:
        raise AssertionError(f'Invalid PNG signature: {path}')
    ihdr_len = struct.unpack('>I', data[8:12])[0]
    ihdr_type = data[12:16]
    if ihdr_len != 13 or ihdr_type != b'IHDR':
        raise AssertionError(f'Invalid PNG IHDR chunk: {path}')
    expected_crc = struct.unpack('>I', data[29:33])[0]
    actual_crc = zlib.crc32(data[12:29]) & 0xFFFFFFFF
    if actual_crc != expected_crc:
        raise AssertionError(f'PNG IHDR CRC mismatch: {path}')
    width, height = struct.unpack('>II', data[16:24])
    if (width, height) != (expected_size, expected_size):
        raise AssertionError(f'Icon {path.name} size {width}x{height} != {expected_size}x{expected_size}')
    if b'IEND' not in data[-16:]:
        raise AssertionError(f'PNG missing IEND chunk: {path}')


def parse_args(root: Path, version: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Package Social Flow Chrome extension archive.')
    parser.add_argument(
        'output',
        nargs='?',
        help='Output .zip path (defaults to test-output/Social-Flow-Chrome-v<version>[-store].zip)',
    )
    parser.add_argument(
        '--store-zip',
        action='store_true',
        help='Build runtime-only zip containing extension/ files only (for Chrome Web Store).',
    )
    args = parser.parse_args()
    if args.output:
        args.output_path = Path(args.output).resolve()
    else:
        suffix = '-store' if args.store_zip else ''
        args.output_path = (root / 'test-output' / f'Social-Flow-Chrome-v{version}{suffix}.zip').resolve()
    return args


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'extension' / 'manifest.json').read_text(encoding='utf-8'))
    pkg = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if version != pkg.get('version'):
        raise AssertionError(f"Version mismatch: manifest.json={version!r} vs package.json={pkg.get('version')!r}")

    args = parse_args(root, version)
    out = args.output_path
    out.parent.mkdir(parents=True, exist_ok=True)

    ext_dir = root / 'extension'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(ext_dir.rglob('*')):
            if f.is_file() and f.resolve() != out:
                z.write(f, f.relative_to(ext_dir).as_posix())
        if not args.store_zip:
            z.write(root / 'README.md', 'HUONG-DAN.md')
            z.write(root / 'TEST-REPORT.md', 'KIEM-THU.md')
            for f in sorted(root.rglob('*')):
                if not f.is_file() or f.resolve() == out:
                    continue
                rel = f.relative_to(root)
                if any(part in EXCLUDED_PARTS for part in rel.parts):
                    continue
                z.write(f, (Path('development') / rel).as_posix())

    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(out) as z:
            assert z.testzip() is None
            names = z.namelist()
            assert 'manifest.json' in names
            assert not any('..' in Path(n).parts or n.startswith('/') for n in names)
            if args.store_zip:
                assert not any(n.startswith('development/') for n in names)
                assert 'HUONG-DAN.md' not in names and 'KIEM-THU.md' not in names
            z.extractall(td)
        unpacked = Path(td)
        for ref in [manifest['background']['service_worker'], manifest['action']['default_popup'], *manifest['icons'].values()]:
            assert (unpacked / ref).is_file(), ref
        popup_html = (unpacked / 'popup.html').read_text(encoding='utf-8')
        for ref in re.findall(r'(?:src|href)="([^"]+)"', popup_html):
            assert (unpacked / ref).is_file(), ref
        for size, ref in manifest['icons'].items():
            verify_png_dimensions(unpacked / ref, int(size))

    print(json.dumps({
        'archive': str(out),
        'version': version,
        'mode': 'store' if args.store_zip else 'full',
        'bytes': out.stat().st_size,
        'rootManifest': True,
        'fileReferences': 'valid',
        'crc': 'valid',
        'versionParity': True,
    }))


if __name__ == '__main__':
    main()
