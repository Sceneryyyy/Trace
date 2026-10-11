#!/usr/bin/env python3
"""Read-only I comparison against pinned pyloudnorm, never changes Trace tolerances.
Run after prepare.py and the official EBU gate have finished (not concurrently).
"""
import argparse, hashlib, json, pathlib, subprocess, sys
import numpy as np
import scipy
from scipy.io import wavfile
PIN='b8d67bfd3ce5deef872f688fcfa491a0ca69fddd'
p=argparse.ArgumentParser();p.add_argument('--pyloudnorm',required=True);p.add_argument('--probe',required=True);p.add_argument('--fixtures',required=True);p.add_argument('--report',required=True);a=p.parse_args()
root=pathlib.Path(a.pyloudnorm).resolve()
head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
if head!=PIN:raise SystemExit('pyloudnorm commit mismatch')
sys.path.insert(0,str(root));import pyloudnorm as pyln
cases=['1kHz Sine -20 LUFS-16bit.wav','1kHz Sine -26 LUFS-16bit.wav','1kHz Sine -40 LUFS-16bit.wav','EBU-reference_listening_signal_pinknoise_500Hz_2kHz_R128.wav','seq-3341-1-16bit.wav','seq-3341-2-16bit.wav','seq-3341-3-16bit-v02.wav','seq-3341-4-16bit-v02.wav']
results=[]
for name in cases:
 path=pathlib.Path(a.fixtures)/name
 rate,data=wavfile.read(path)
 if np.issubdtype(data.dtype,np.integer):data=data.astype(np.float64)/(2**(data.dtype.itemsize*8-1))
 else:data=data.astype(np.float64)
 reference=float(pyln.Meter(rate).integrated_loudness(data))
 measured=json.loads(subprocess.check_output([a.probe,str(path),'irregular'],text=True))['final']['I']
 if measured['status']!=0 or measured['value'] is None:raise SystemExit('Trace I not ready: '+name)
 delta=measured['value']-reference
 results.append(dict(file=name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),sampleRate=rate,traceI=measured['value'],pyloudnormI=reference,deltaLU=delta,passed=abs(delta)<=.1))
 print(name, 'delta LU',delta)
report=dict(scope='Independent integrated loudness only; original EBU fixtures; no LRA/TP certification',pyloudnormCommit=PIN,numpyVersion=np.__version__,scipyVersion=scipy.__version__,toleranceLU=.1,cases=results,passed=all(c['passed'] for c in results))
pathlib.Path(a.report).write_text(json.dumps(report,indent=2)+'\n')
if not report['passed']:raise SystemExit(1)
