"""Build a Chinese quick-start PDF with actual preview.28 interface captures."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
ASSETS=ROOT/'docs/assets/quick-start-preview28'
OUT=ROOT/'output/pdf'
OUT.mkdir(parents=True,exist_ok=True)
PDF=OUT/'LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf'
pdfmetrics.registerFont(TTFont('CN','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('CNB','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
pdfmetrics.registerFontFamily('CN',normal='CN',bold='CNB')
W,H=A4
M=44
CW=W-2*M
DARK=colors.HexColor('#171D24')
INK=colors.HexColor('#23323B')
MUTED=colors.HexColor('#60727C')
LIME=colors.HexColor('#91E65C')
TEAL=colors.HexColor('#167B79')
PALE=colors.HexColor('#F0F7F3')
LINE=colors.HexColor('#D9E3E5')
c=canvas.Canvas(str(PDF),pagesize=A4,pageCompression=1)
c.setTitle('LeoMoon Trace 快速上手用户手册 - preview.28')
c.setAuthor('LeoMoon / Trace')
c.setSubject('Windows 桌面音频录音、分析与历史回看快速上手')
layout=[]
page_no=0

def p(text,x,y,width,size=10.3,leading=16.4,color=INK,bold=False,gap=6):
    style=ParagraphStyle('p',fontName='CNB' if bold else 'CN',fontSize=size,leading=leading,textColor=color,wordWrap='CJK')
    item=Paragraph(text,style)
    _,height=item.wrap(width,H)
    if y-height<51: raise ValueError(f'Page {page_no} overflow: {text[:45]} bottom={y-height}')
    item.drawOn(c,x,y-height)
    layout.append(dict(page=page_no,x=x,y=y-height,width=width,height=height,text=text))
    return y-height-gap

def footer():
    c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(M,38,W-M,38)
    c.setFont('CN',8);c.setFillColor(MUTED)
    c.drawString(M,24,'LeoMoon / Trace  |  快速上手  |  preview.28')
    c.drawRightString(W-M,24,f'{page_no:02d} / 08')

def new_page(title,subtitle):
    global page_no
    if page_no:footer();c.showPage()
    page_no+=1
    c.setFillColor(colors.white);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(TEAL);c.setFont('Helvetica-Bold',10);c.drawString(M,H-33,'LeoMoon  /  TRACE')
    c.setFont('CNB',24);c.setFillColor(INK);c.drawString(M,H-78,title)
    p(subtitle,M,H-92,CW,size=10,color=MUTED)
    c.bookmarkPage(f'p{page_no}');c.addOutlineEntry(title,f'p{page_no}',level=0)
    return H-129

def section(title,y):
    c.setFillColor(TEAL);c.roundRect(M,y-16,3,15,1,fill=1,stroke=0)
    return p(title,M+11,y,CW-11,size=13,bold=True,leading=19,gap=10)

def step(number,title,body,y,x=M,width=CW):
    c.setFillColor(PALE);c.circle(x+10,y-11,10,fill=1,stroke=0)
    c.setFillColor(TEAL);c.setFont('Helvetica-Bold',10);c.drawCentredString(x+10,y-14,str(number))
    y=p(title,x+30,y,width-30,bold=True,size=11,leading=17,gap=2)
    return p(body,x+30,y,width-30,gap=12)

def box(title,body,y,x=M,width=CW):
    s=ParagraphStyle('box',fontName='CN',fontSize=10,leading=16,textColor=INK,wordWrap='CJK')
    a=Paragraph(f'<b>{title}</b>',s);b=Paragraph(body,s)
    h1=a.wrap(width-24,H)[1];h2=b.wrap(width-24,H)[1];height=h1+h2+31
    if y-height<51:raise ValueError(f'Box overflow page {page_no}: {title}')
    c.setFillColor(PALE);c.roundRect(x,y-height,width,height,7,fill=1,stroke=0)
    a.drawOn(c,x+12,y-12-h1);b.drawOn(c,x+12,y-19-h1-h2)
    return y-height-12

def table(headers,rows,widths,y,x=M,size=9.7):
    s=ParagraphStyle('cell',fontName='CN',fontSize=size,leading=15,textColor=INK,wordWrap='CJK')
    hs=ParagraphStyle('head',parent=s,fontName='CNB',textColor=colors.white)
    cells=[[Paragraph(t,hs) for t in headers]]+[[Paragraph(str(t),s) for t in row] for row in rows]
    t=Table(cells,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),DARK),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F4F7F8')]),('LINEBELOW',(0,1),(-1,-1),.4,LINE)]))
    _,height=t.wrap(sum(widths),H)
    if y-height<51:raise ValueError(f'Table overflow page {page_no}: {y-height}')
    t.drawOn(c,x,y-height)
    return y-height-12

def picture(name,y,width=CW,x=M,max_height=None):
    path=ASSETS/(name+'.png')
    with Image.open(path) as im:iw,ih=im.size
    height=width*ih/iw
    if max_height and height>max_height:width*=max_height/height;height=max_height
    c.drawImage(str(path),x,y-height,width=width,height=height,mask='auto')
    return y-height-8,(x,y-height,width,height)

# 1. Functional cover.
page_no=1;c.bookmarkPage('p1');c.addOutlineEntry('开始使用','p1',level=0)
c.setFillColor(DARK);c.rect(0,H-210,W,210,fill=1,stroke=0)
c.drawImage(str(ROOT/'resources/trace/icon.png'),W-M-90,H-137,90,90,mask='auto')
c.setFillColor(colors.white);c.setFont('Helvetica-Bold',25);c.drawString(M,H-55,'LeoMoon')
c.setFillColor(LIME);c.setFont('Helvetica-Bold',36);c.drawString(M,H-102,'TRACE')
c.setFillColor(colors.white);c.setFont('CNB',24);c.drawString(M,H-146,'快速上手用户手册')
c.setFont('CN',10);c.setFillColor(colors.HexColor('#B8C7CF'));c.drawString(M,H-177,'Audio Recorder & Analyzer  |  Windows x64')
c.setStrokeColor(LIME);c.setLineWidth(3);c.line(M,H-210,W-M,H-210)
y=section('5 分钟：完成第一次录音',H-234)
for n,title,body in [
(1,'解压并启动','完整解压文件夹，运行 Trace.exe；升级前先退出旧版。'),
(2,'确认声音来源','选择系统输出设备；未监测时点击“开始监测”，确认电平随声音变化。'),
(3,'选择保存方式','点击顶部格式按钮，设置保存目录和 WAV / MP3 / AAC 参数。'),
(4,'开始并结束录音','点击圆形录音图标或按 R；结束时点击方块或按 Escape。'),
(5,'回看并交付','在“音频文件”中查看录音，按 Space 回听，确认范围后导出。')]:
    y=step(n,title,body,y)
y=box('先记住两件事','录音关闭时仍可监测，最近约 60 秒声音保留在内存中；要长期保留，请录音或显式“保存缓存”。<br/>拖动历史游标只查看数据，按播放才会发声。',y)
y=p('适用 0.1.0-preview.28；手册版本 1.0 / 2026-09-17。',M,y,CW,size=9,color=MUTED)
for text,target in [('界面与首次录音  02-03',2),('历史、布局与仪器  04-05',4),('计量、报告与素材  06-07',6),('快捷键与问题处理  08',8)]:
    yy=y;y=p(text,M,y,CW,size=9.6,color=TEAL,leading=16,gap=0)
    c.linkRect('',f'p{target}',(M,y,W-M,yy),relative=0,thickness=0)

# 2. Map of actual application.
y=new_page('认识统一工作台','实时监测、录音和文件历史共享同一个窗口。先确认来源，再操作时间轴。')
y,rect=picture('workbench',y)
x0,y0,ww,hh=rect
for n,sx,sy in [(1,24,55),(2,24,106),(3,949,105),(4,320,181),(5,1050,180),(6,24,768)]:
    xx=x0+ww*sx/1280;yy=y0+hh*(1-sy/800)
    c.setFillColor(TEAL);c.circle(xx,yy,9,fill=1,stroke=0)
    c.setFillColor(colors.white);c.setFont('Helvetica-Bold',9);c.drawCentredString(xx,yy-3,str(n))
y=p('实际 preview.28 界面；使用生成的演示信号，图中已打开文件历史。',M,y,CW,size=8.5,color=MUTED,leading=13,gap=12)
items=[('① 设备与录音设置','选择系统输出设备；旁边的格式按钮设置录音参数和保存目录。'),('② 当前来源','区分系统声音、录音或外部文件，并显示实际格式与当前位置。'),('③ 仪器与布局','选择仪器、切换布局预设，或点击“编辑布局”自由排列。'),('④ 波形与响度历史','点击定位、拖动查看历史；在时间刻度上拖动可建立选区。'),('⑤ 电平与响度','读数随当前来源和游标变化；先看统计范围，再比较数字。'),('⑥ 走带与文件操作','起点、终点、播放、录音、实时和监测；右侧有缓存、报告与文件。')]
col=(CW-18)/2
for i in range(0,6,2):
    a=box(*items[i],y,x=M,width=col);b=box(*items[i+1],y,x=M+col+18,width=col);y=min(a,b)

# 3. Recording.
y=new_page('录音、保存缓存与导出','首次使用建议先录一段短音频，确认文件位置和回听结果。')
y=section('一段新录音',y)
y=step(1,'设置来源和保存目录','选择系统输出设备；点击设备栏的格式按钮，例如“WAV · 24-bit”，设置目录和参数。',y)
y=step(2,'录制并结束','点击圆形录音图标或按 R。即使监测关闭，也能直接录音。结束时点击方块或按 Escape。',y)
y=step(3,'等待成品准备完成','需要压缩或重采样时，停止后会继续处理。完成提示可直接查看；也可进入“音频文件”。',y)
y=table(['格式','可用输出设置','使用建议'],[
['WAV','跟随来源，或选 44.1 / 48 / 88.2 / 96 kHz；16/24-bit PCM、32-bit float','保留处理空间。真实 96 kHz 采集仍待硬件专项验证。'],
['MP3','44.1 / 48 kHz；码率选项','通用、较小体积的回听文件。'],
['AAC','44.1 / 48 kHz；M4A 或 ADTS','通常优先 M4A；ADTS 在其他播放器中可能有首尾填充。']],[57,242,CW-299],y,size=9.2)
y=section('没按录音，也能保存刚才的声音',y)
y=p('监测开启时，最近约 60 秒声音保留在内存中。点击“保存缓存”；如需其中一段，先查看历史并建立选区，再保存。新文件按当前录音设置生成，并从自身起点重新分析。',M,y,CW)
y=section('导出整段或选区',y)
y=p('打开文件 → 需要时建立选区 → 点击“导出” → 核对来源、范围和时长 → 选择格式。需要交付到其他目录时，开启“同时另存到指定目录”。已有同名文件不会被覆盖。',M,y,CW)
y=box('声音回听与系统录音互斥','录音期间可以看历史，但不能发声回听。先结束录音再播放。文件回听会暂时暂停系统采集，暂停或结束后恢复原监测意图。',y)

# 4. Timeline.
y=new_page('历史定位、选区与循环','同一文件、同一时刻的历史读数可重复查看，不随回听次数重新累计。')
y,_=picture('waveform',y)
y=p('浅色范围是选区，两端可拖动调整。图中为演示信号。',M,y,CW,size=8.5,color=MUTED,leading=13,gap=12)
y=table(['想做什么','具体操作'],[
['查看某一时刻','在波形或历史图内点击、拖动。松开后保持该位置，操作本身不发声。'],
['建立选区','拖动时间刻度；或按住 Shift 在图内拖动；也可先切到“选区”模式。'],
['调整选区','拖动选区两端。选区 I / LRA / MAX TP 会独立分析。'],
['循环回听','先建立选区 → 开启循环图标 → 按播放或 Space。'],
['清除选区','时间轴右键选择“清除选区”，或 Ctrl + D；同时关闭循环。'],
['回到实时','点击底部“实时”，回到最新采集位置。'],
['浏览更长文件','Ctrl + 滚轮缩放时间；Shift + 滚轮横移；Page Up / Down 移动一屏。']],[112,CW-112],y)
y=box('三个时间轴图标','“波形复位”：恢复当前来源的完整时间范围。<br/>“跟随游标”：画面随播放位置移动。<br/>“循环”：重复播放已有选区；没有选区时不可开启。',y)
y=p('波形区普通滚轮调整显示倍率 ×1 至 ×4；时间窗通常为 5 至 60 秒，全长概览可超过 60 秒。录音中较早的概览不能替代精确历史，完整复核请结束录音后打开文件。',M,y,CW,size=9.5,color=MUTED,leading=15)

# 5. Layout and instruments.
y=new_page('安排仪器，选择合适的视图','优先使用任务预设，再按需要显示仪器。无需一次打开全部面板。')
y,_=picture('layout-toolbar',y,width=330)
y=step(1,'显示需要的仪器','点击“仪器”勾选面板；布局菜单提供录音回看、响度检查、频率与声像、时频检查、参考比较。',y)
y=step(2,'编辑位置与大小','点击“编辑布局”。拖动标题到其他面板边缘停靠；拖动分隔线调整尺寸。也可在仪器设置中选择“移动仪器”。',y)
y=step(3,'完成并保存预设','点击“完成布局”。当前排列自动保存；如需命名，打开布局下拉框右侧管理按钮，输入名称并“另存新布局”。',y)
y=table(['仪器','主要用途'],[
['电平 / 响度','声道 Peak、RMS、TP，以及 M / S / I、LRA 和 MAX TP。'],
['波形 / 响度历史','定位声音事件、建立选区，回看随时间变化的读数。'],
['频谱','比较各频率能量分布；可显示当前、平均和峰值保持。'],
['声场','示波、极坐标和能量视图；辅助观察左右平衡及相关度。'],
['声谱图 2D','横轴时间、纵轴频率、颜色表示 dBFS 幅度；与波形共轴。'],
['声谱图 3D','同一时频数据的立体展示。拖动旋转，滚轮缩放视角；高度不表示空间声源位置。'],
['参考比较','显示 A/B 独立统计与平均频谱；先确认范围和时间偏移。']],[110,CW-110],y,size=9.5)
y=box('显示改变，不等于声音改变','面板大小、波形倍率、3D 高度和监听音量不会修改导出音频或测量值。FFT、声道、平均时间等分析设置会影响分析结果，应在仪器设置中确认。',y)

# 6. Metering and reports.
y=new_page('读懂响度，再生成报告','先确认“哪个来源、哪个时间、哪个统计范围”，再判断是否达标。')
y=table(['读数','单位与含义','使用时注意'],[
['Peak / RMS','dBFS：采样峰值 / 均方根电平','不等同于响度 LUFS。'],
['TP / MAX TP','dBTP：真峰值 / 指定范围最大真峰值','不要与采样峰值混用。'],
['M','LUFS：400 ms 瞬时响度','观察短时响度变化。'],
['S','LUFS：3 s 短时响度','观察较平稳的片段。'],
['I','LUFS：指定范围的累计响度','文件大号 I 从文件起点累计到游标；另有整段 I。'],
['LRA','LU：响度范围','短于 60 秒仅作暂估，不用于目标或 A/B 差值判断。']],[84,225,CW-309],y,size=9.5)
y=box('整段、截至游标与选区是不同范围','文件 LRA / MAX TP 默认是整段统计。选区独立分析从选区起点重新累计 I。保存缓存得到的新文件，也从新文件起点累计；不必等于原监测周期的 I。',y)
y=section('生成并保存测量报告',y)
y=step(1,'设置比较目标','点击顶部“目标”，设置 I 目标/容差、TP 上限等；目标只做比较，不自动改音量。',y)
y=step(2,'选择正确范围','打开已保存文件，点击底部“报告”，选择整段或“选区独立分析”。临时缓存请先保存为文件。',y)
y=step(3,'定位问题并导出','报告事件可定位时间轴，定位不发声。“导出报告”保存 HTML 和 summary / history / events 三份 CSV。',y)
y=p('报告预览是临时文件，长期保留必须导出。目标更改后，旧报告仍采用生成时的设置；请重新生成。事件采用观察窗口，不代表样本级越界时刻。',M,y,CW,size=9.5,color=MUTED,leading=15)

# 7. Files and A/B.
y=new_page('外部素材、A/B 与文件管理','分析外部文件时保持原件只读；区分原件、缓存、成品和另存副本。')
y=section('导入并查看',y)
y=p('打开“音频文件”并点击“导入素材”，或将磁盘文件拖入主窗口。一次最多准备四项；录音中先排队，结束后准备。完成后点击“查看”。',M,y,CW)
y=p('支持单/双声道 WAV（16/24-bit PCM、32-bit float）、MP3、AAC-LC M4A/ADTS，导入采样率为 8 至 96 kHz。普通视频、多音轨、HE-AAC、多声道与 WAV32 integer 暂不支持。',M,y,CW,size=9.5,color=MUTED,leading=15)
y=section('做一次 A/B 比较',y)
y=step(1,'指定主素材和参考','正常打开的文件是 A。在文件库选择另一素材“设为参考”，或在参考面板把当前文件设为 B。选择“参考比较”布局。',y)
y=step(2,'对齐时间与范围','确认各自比较范围。游标联动关系为 B 时间 = A 时间 + 偏移；可点击“起点对齐”。超出范围会提示不可用。',y)
y=step(3,'比较后再回听','差值方向为 A - B；I/LRA 差值为 LU，TP 差值为 dB。A/B 按钮切换来源，各自记忆监听音量。重启后需重新选择配对。',y)
y=table(['操作','哪些内容保留 / 改变'],[
['清理缓存','保留原始音频与成品；下次查看时可重新分析或准备。'],
['移除导入引用','从列表归档移除；原文件和已生成成品继续保留。'],
['移除录音 / 成品','先确认具体范围，再移入回收站；不要与清理缓存混淆。'],
['文件被移动或修改','刷新列表；导入文件可“重新定位”或“更新素材”，再检查分析状态。'],
['删除另存副本','外部副本独立管理，不会同时删除 Trace 内的成品。']],[130,CW-130],y,size=9.4)

# 8. Desk reference.
y=new_page('快捷键与常见问题','先按界面状态处理问题；需要反馈时导出诊断，避免发送私人录音。')
y=table(['按键 / 手势','作用','按键 / 手势','作用'],[
['R','开始录音','Escape','结束录音 / 暂停回听'],
['Space','播放 / 暂停','Home / End','起点 / 终点'],
['Ctrl + D','清除选区与循环','Page Up / Down','前后移动一个时间窗'],
['滚轮（波形区）','波形显示倍率','Ctrl + 滚轮','波形区时间缩放'],
['Shift + 滚轮','平移文件/固定缓存','Shift + 图内拖动','建立选区']],[104,125,113,CW-342],y,size=9.1)
y=p('输入框、下拉框或对话框获得焦点时，全局走带快捷键不会抢占输入。频谱和声谱图有自己的滚轮语义，请看相应仪器设置。',M,y,CW,size=9.3,color=MUTED,leading=14.5,gap=12)
y=table(['现象','先这样处理'],[
['没有电平 / 听不到回放','确认系统有声音、输出设备选对、监测已开启。回放时检查当前文件、播放按钮和底部音量。'],
['数值是横线、-∞ 或暂估','横线表示未就绪/不可用；-∞ 表示静音；短片段 LRA 暂估。设备错误和缺口不等于静音。'],
['仪器太多 / 拖不动','先选合适布局；移动前点击“编辑布局”。面板四角图标可最大化。'],
['界面异常 / 上次未正常退出','按提示恢复界面，或查看音频文件中的恢复状态。不要把恢复提示理解为文件已完整。']],[142,CW-142],y,size=9.4)
y=section('反馈问题',y)
y=p('进入“显示与帮助 → 诊断与反馈”。“导出诊断”得到 diagnostics.json 与 feedback.txt；填写复现步骤和期望结果。“邮件反馈”打开草稿，检查后手动添加附件并发送。',M,y,CW)
y=p('<b>反馈邮箱：472841772@qq.com</b><br/>没有邮件客户端时，可用网页邮箱发送。诊断不含音频、文件名、个人路径或设备身份；软件不会自动发信。',M,y,CW,size=10,leading=16)
y=box('适用范围','Windows x64 开发预览，目前以单/双声道为范围。真实 96 kHz 采集、物理驱动变化、混合 DPI、干净 Windows 环境及官方 EBU 素材专项仍待验，不代表已获得测量认证。',y)
y=p('更多细节见随包 README-Trace.md；开发仓库 docs/28-USER-GUIDE.md 为持续维护的详细使用说明。',M,y,CW,size=9,color=MUTED,leading=14)
footer();c.save()
assert page_no==8
(ROOT/'artifacts/manual-layout.json').write_text(json.dumps({'pages':page_no,'pdf':str(PDF.relative_to(ROOT)),'paragraphs':len(layout),'minimumParagraphY':min(b['y'] for b in layout)},ensure_ascii=False,indent=2),encoding='utf8')
print('PDF_CREATED',PDF)
