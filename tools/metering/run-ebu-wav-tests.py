#!/usr/bin/env python3
"""EBU v5 original-file regression for Trace Meter. References: © EBU.

Private material is required, verified without modifications, and never copied
into release artifacts. All 68 supported files are mandatory. The two case-6
multichannel files are explicitly outside Trace's mono/stereo product scope.
"""
import argparse
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUSIONS = {'seq-3341-6-5channels-16bit.wav': 5,
              'seq-3341-6-6channels-WAVEEX-16bit.wav': 6}

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

def require(value, message):
    if not value:
        raise ValueError(message)

def numeric(label, metric, expected, below=.1, above=None):
    above = below if above is None else above
    actual = metric['value']
    return dict(label=label, actual=actual, expected=expected, below=below, above=above,
                passed=metric['status'] == 0 and actual is not None and math.isfinite(actual)
                and expected-below <= actual <= expected+above)

def maximum(readings, metric):
    values = [r[metric]['value'] for r in readings if r[metric]['status'] == 0]
    return dict(status=0 if values else 2, value=max(values) if values else None)

def checks_for(name, result):
    rate, final, readings = result['rate'], result['final'], result['readings']
    checks = []
    match = re.match(r'seq-3341-(?:2011-)?(\d+)(?:-|_)', name)
    case = int(match[1]) if match else None
    if case in (1, 2):
        for metric in ('M', 'S', 'I'):
            checks.append(numeric(metric, final[metric], -23 if case == 1 else -33))
    elif case in (3, 4, 5, 7, 8):
        checks.append(numeric('I', final['I'], -23))
        if case in (7, 8):
            checks.append(numeric('LRA', final['LRA'], 5 if case == 7 else 15, 1))
    elif case in (9, 12):
        metric, start = ('S', 3) if case == 9 else ('M', 1)
        values = [r[metric] for r in readings if r['frame'] >= start*rate]
        checks.append(dict(label=f'{metric} every 10 ms reading after {start}s',
                           expected=-23, below=.1, above=.1,
                           actual_min=min(v['value'] for v in values),
                           actual_max=max(v['value'] for v in values),
                           passed=bool(values) and all(numeric(metric, v, -23)['passed'] for v in values)))
    elif case in (10, 13):
        metric = 'S' if case == 10 else 'M'
        checks.append(numeric('Max '+metric, maximum(readings, metric), -23))
    elif case in (11, 14):
        metric, seconds = ('S', 6) if case == 11 else ('M', .8)
        for i in range(20):
            segment = [r for r in readings if round(i*seconds*rate) < r['frame'] <= round((i+1)*seconds*rate)]
            checks.append(numeric(f'Max {metric} segment {i+1}', maximum(segment, metric), -38+i))
    elif case and 15 <= case <= 23:
        checks.append(numeric('Max TP', final['TP'], -6 if case <= 18 else 3 if case == 19 else 0, .4, .2))
    elif name.startswith('seq-3342-'):
        checks.append(numeric('LRA', final['LRA'], [10, 5, 20, 15][int(name.split('-')[2])-1], 1))
    elif name.startswith('1kHz Sine'):
        checks.append(numeric('I auxiliary sine', final['I'], int(re.search(r'(-\d+) LUFS', name)[1])))
    elif name.startswith('EBU-reference'):
        checks.append(numeric('I reference listening noise', final['I'], -23))
    else:
        raise ValueError('Unclassified mandatory fixture: '+name)
    return checks

def probe(executable, path, pattern):
    result = subprocess.run([str(executable), str(path), pattern], capture_output=True,
                            text=True, encoding='utf-8', timeout=240)
    require(result.returncode == 0, path.name+': '+result.stderr.strip())
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe', type=Path, required=True)
    parser.add_argument('--assets', type=Path, default=ROOT/'references/ebu-loudness-test-set-v5')
    parser.add_argument('--wav-dir', type=Path, help='Override the verified extraction directory')
    parser.add_argument('--report', type=Path, default=ROOT/'artifacts/ebu-meter/report.json')
    args = parser.parse_args()
    # Replace any earlier PASS before preparation/probing can fail.
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(dict(schemaVersion=1, status='running',
                                          checkedAt=datetime.now(timezone.utc).isoformat()))+'\n', encoding='utf-8')
    require(args.probe.is_file(), 'Build the EBU WAV probe first')
    require((args.assets/'prepare.py').is_file(), 'Private EBU assets missing; no numerical pass can be reported')
    if args.wav_dir is None:
        args.wav_dir = args.assets.resolve().parents[1]/'artifacts/ebu-loudness-v5'
    subprocess.run([sys.executable, str(args.assets/'prepare.py')], check=True)
    native_id = re.search(r'kMeasurementConfigId="([^"]+)"', (ROOT/'native/src/recorder/MeasurementConfig.h').read_text())[1]
    ts_id = re.search(r"measurementConfigId = '([^']+)'", (ROOT/'src/trace/analysisTypes.ts').read_text())[1]
    require(native_id == ts_id, 'Native and TypeScript measurement identity mismatch')
    manifest = json.loads((args.assets/'archive-manifest.json').read_text())
    with (args.assets/'WAV_inventory.csv').open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    require(len(rows) == 70 and len({r['filename'] for r in rows}) == 70, 'Expected 70 unique original fixtures')
    git = lambda *cmd: subprocess.check_output(['git', *cmd], cwd=ROOT, text=True).strip()
    report = dict(schemaVersion=1, checkedAt=datetime.now(timezone.utc).isoformat(),
                  commit=git('rev-parse', 'HEAD'), sourceDirty=bool(git('status', '--porcelain')),
                  platform=sys.platform, measurementConfigId=native_id, probeSha256=digest(args.probe),
                  scope='Actual Trace Meter; portable test PCM decoder or real Windows WavReader as recorded per file; no device/addon/UI/package validation',
                  references='© EBU; Tech 3341/3342 November 2023 Table 1; unchanged original tolerances',
                  archiveSha256=manifest['archive_sha256'],
                  sourceSha256={name: digest(ROOT/name) for name in [
                      'native/src/recorder/Meter.cpp', 'native/src/recorder/Meter.h',
                      'native/src/recorder/MeasurementConfig.h', 'native/src/recorder/FileAnalysis.cpp',
                      'native/vendor/libebur128/ebur128.c', 'test/native/ebu_wav_probe.cpp',
                      'tools/metering/run-ebu-wav-tests.py']}, files=[])
    for row in rows:
        name = row['filename']
        require(Path(name).name == name, 'Unsafe inventory path')
        path = args.wav_dir/name
        require(path.stat().st_size == int(row['file_bytes']) and digest(path) == row['sha256'], 'Original WAV integrity mismatch: '+name)
        item = dict(filename=name, sha256=row['sha256'], channels=int(row['channels']),
                    sampleRate=int(row['sample_rate_hz']))
        report['files'].append(item)
        if name in EXCLUSIONS:
            require(item['channels'] == EXCLUSIONS[name], 'Excluded fixture channel mismatch')
            item.update(status='excluded', reason='Trace supports mono/stereo; 5.0/5.1 not downmixed/truncated')
        else:
            require(item['channels'] in (1, 2), 'Unexpected unsupported fixture')
            a, b = (probe(args.probe, path, pattern) for pattern in ('regular', 'irregular'))
            require(a['configuration'] == native_id, 'Stale probe measurement configuration')
            require(a['rate'] == item['sampleRate'] and a['channels'] == item['channels'], 'Decoded fixture format mismatch')
            require(abs(a['sourceFrames']/a['rate']-float(row['duration_seconds'])) <= .000001, 'Decoded fixture duration mismatch')
            checks = checks_for(name, a)
            cadence = [min((i+1)*a['rate']//100, a['sourceFrames']) for i in range((a['sourceFrames']*100+a['rate']-1)//a['rate'])]
            invariants = [dict(label='all numerical readings identical across regular/irregular PCM input', passed=a == b),
                          dict(label='EOF source/processed/published frames identical', passed=a['sourceFrames'] == a['frames'] == a['final']['frame'] == a['final']['loudnessFrame']),
                          dict(label='each actual 10 ms endpoint and partial EOF published exactly once', passed=[r['frame'] for r in a['readings']] == cadence and all(r['frame'] == r['loudnessFrame'] for r in a['readings']))]
            item.update(status='passed' if all(c['passed'] for c in checks+invariants) else 'failed',
                        reader=a['reader'], frames=a['frames'], final=a['final'],
                        checks=checks, invariants=invariants)
        print(item['status'].upper(), name, flush=True)
        for check in item.get('checks', [])+item.get('invariants', []):
            if not check['passed']:
                print('  FAIL', json.dumps(check), flush=True)
    summary = {s: sum(f['status'] == s for f in report['files']) for s in ('passed', 'failed', 'excluded')}
    summary['supported'] = summary['passed']+summary['failed']
    require(summary['supported'] == 68 and summary['excluded'] == 2, 'Mandatory coverage mismatch')
    for key in ('checks', 'invariants'):
        all_checks = [c for f in report['files'] for c in f.get(key, [])]
        summary[key] = dict(total=len(all_checks), passed=sum(c['passed'] for c in all_checks),
                            failed=sum(not c['passed'] for c in all_checks))
    summary['supportedPassRate'] = summary['passed']/summary['supported']
    report.update(summary=summary, status='pass' if summary['failed'] == 0 else 'fail')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(summary), flush=True)
    return 0 if report['status'] == 'pass' else 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError, KeyError) as error:
        print('EBU regression failed:', error, file=sys.stderr)
        sys.exit(1)
