from pathlib import Path
import json, argparse, hashlib
from pypdf import PdfReader
import pdfplumber
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--version',choices=['28','31'],default='31')
args=parser.parse_args()
file=ROOT/f'output/pdf/LeoMoon-Trace-Quick-Start-preview.{args.version}-zh-CN.pdf'
reader=PdfReader(file)
assert len(reader.pages)==8
assert len(reader.outline)==8
required=['第一次录音','统一工作台','保存缓存','选区与循环','合适的视图','读懂响度','A/B','快捷键']
result={'status':'pass','version':'preview.'+args.version,'pdf':str(file.relative_to(ROOT)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'pages':8,'bytes':file.stat().st_size,'pageChecks':[]}
for i,page in enumerate(reader.pages):
    text=page.extract_text()
    assert required[i] in text,(i,required[i])
    assert len(text)>200 and '\ufffd' not in text and '\x00' not in text
    assert 'C:\\Users\\' not in text and 'PRIVATE' not in text and 'M4 Playback Test' not in text
    assert f'preview.{args.version}' in text
    embedded=[]
    for ref in page['/Resources']['/Font'].values():
        font=ref.get_object()
        if font.get('/Subtype')=='/TrueType':
            desc=font['/FontDescriptor'].get_object()
            assert '/FontFile2' in desc or '/FontFile3' in desc
            embedded.append(str(font['/BaseFont']))
    assert len(embedded)>=2
    result['pageChecks'].append({'page':i+1,'characters':len(text),'embeddedFonts':embedded})
links=reader.pages[0].get('/Annots',[])
assert len(links)==4
for ref in links:
    annotation=ref.get_object()
    assert annotation.get('/Subtype')=='/Link' and '/Dest' in annotation
with pdfplumber.open(file) as pdf:
    for i,page in enumerate(pdf.pages):
        for char in page.chars:
            assert -1<=char['x0']<page.width+1 and char['x1']<=page.width+1,(i,char)
            assert -1<=char['top']<page.height+1 and char['bottom']<=page.height+1,(i,char)
result['outlineEntries']=len(reader.outline)
result['internalLinks']=len(links)
result['allTextInsidePages']=True
if args.version=='31':
    all_text=''.join(''.join(page.extract_text().split()) for page in reader.pages)
    for phrase in ['云端模拟示例','选择仪表主题','包含估计静音','采集完整性未知']:
        assert phrase in all_text,phrase
(ROOT/'artifacts/manual-qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k!='pageChecks'},ensure_ascii=False))
