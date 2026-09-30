// Theme screenshot matrix for docs/71 (TH-T0 baseline, TH-A01/A02 comparisons).
// Usage: node tools/themes/theme-ui.cjs [--theme <id>] [--scale 1] [--label name] [--compare <folder>]
// Uses a generated fixture only; no personal recordings. Monitoring stays off so frames are deterministic.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs'),png=require('./png.cjs')
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback}
const theme=arg('theme',null),scale=Number(arg('scale','1')),label=arg('label',(theme||'default')+'-'+scale+'x'),compareWith=arg('compare',null)
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/themes',label+'-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes)
const fixture=require('../m4/fixture.cjs')(takes)
// Rescale the three fixture regions into safe (-9.1 dBFS), over (-0.01 dBFS) and near (-3.1 dBFS) peaks.
const gains=[7,9.99,28]
fixture.document.assets.forEach((asset,index)=>{const file=path.join(fixture.folder,asset.relativePath),data=fs.readFileSync(file);for(let o=58;o+4<=data.length;o+=4)data.writeFloatLE(data.readFloatLE(o)*gains[index],o);fs.writeFileSync(file,data);asset.hash=crypto.createHash('sha256').update(data).digest('hex')})
fs.writeFileSync(path.join(fixture.folder,'session.json'),JSON.stringify(fixture.document,null,2))
const userData=path.join(folder,'user-data');fs.mkdirSync(userData)
const targetSettings={version:1,enabled:true,preset:'custom',integrated:{target:-23,tolerance:1},truePeakMax:-1,lra:null,momentaryMax:-20,shortTermMax:null}
fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false,windowSeconds:10,targetSettings,...(theme?{instrumentTheme:theme,instrumentThemeVersion:1}:{})}))
const report={folder,label,theme,scale,status:'running',scenes:[],kind:'Actual Electron renderer with generated fixture; monitoring off; not a WASAPI acceptance'}
const wait=async(fn,name,limit=30000)=>{for(const begin=Date.now();Date.now()-begin<limit;){const v=await fn().catch(()=>false);if(v)return v;await delay(50)}throw Error('Timeout: '+name)}
let session
async function shot(c){const r=await c.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});return Buffer.from(r.data,'base64')}
async function capture(c,name){
 await c.send('Page.bringToFront');let last=null,stable=false
 for(let i=0;i<20&&!stable;i++){await delay(i?350:500);const now=await shot(c);stable=last!==null&&now.equals(last);last=now}
 const file=path.join(folder,name+'.png');fs.writeFileSync(file,last);report.scenes.push({name,stable});console.log(stable?'CAPTURE':'CAPTURE_UNSTABLE',name)
}
const layout=(c,id)=>c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"工作台布局\"]');e.value="+JSON.stringify(id)+";e.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
async function seek(c,frame){const p=(await c.state()).playback;await c.request('playback.seek',{playbackId:p.id,positionFrame:String(frame),resume:false});await wait(()=>c.evaluate("document.querySelector('.workspace')?.dataset.historyPosition==="+JSON.stringify(String(frame))),'seek '+frame)}
async function main(){
 session=await launch(require('electron'),folder,{scale,userData,recordDirectory:takes,args:[path.join(root,'out-trace/main/index.js'),'--disable-backgrounding-occluded-windows'],bounds:{x:20,y:20,width:1280,height:800}})
 const c=session.cdp
 await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:scale,mobile:false})
 await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length===4"),'workspace')
 await capture(c,'01-idle')
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'})
 await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','analysis',90000)
 const p=(await c.state()).playback
 await c.request('playback.selection',{playbackId:p.id,startFrame:String(48000*2),endFrame:String(48000*6),loop:false})
 for(const [name,frame] of [['02-recorder-safe',48000*1.5],['03-recorder-over',48000*4],['04-recorder-near',48000*6.5]]){await seek(c,frame);await capture(c,name)}
 await layout(c,'metering');await wait(async()=>(await c.state()).workspace.activePreset==='metering','metering');await capture(c,'05-metering')
 await layout(c,'spectral');await wait(async()=>(await c.state()).workspace.activePreset==='spectral','spectral');await capture(c,'06-spectral')
 await layout(c,'time-frequency');await wait(async()=>(await c.state()).workspace.activePreset==='time-frequency','time-frequency')
 await wait(()=>c.evaluate("!!document.querySelector('[data-instrument=spectrogram] canvas')"),'spectrogram canvas');await capture(c,'07-spectrogram-2d')
 const has3d=await c.evaluate("(()=>{const b=[...document.querySelectorAll('.spectrogram-toolbar button')].find(x=>x.textContent.trim()==='3D');if(!b)return false;b.click();return true})()")
 if(has3d){await delay(800);await capture(c,'08-spectrogram-3d')}else report.notes=['3D toggle not found']
 await layout(c,'recorder');await wait(async()=>(await c.state()).workspace.activePreset==='recorder','recorder')
 const opened=await c.evaluate("(()=>{const b=document.querySelector('[aria-label=\"显示与帮助\"]');if(!b)return false;b.click();return true})()")
 if(opened){await wait(()=>c.evaluate("!!document.querySelector('.trace-modal')"),'display modal');await capture(c,'09-display-settings')}else (report.notes??=[]).push('display settings entry not found')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{
 if(session)await session.close().catch(e=>{report.closeError=String(e)})
 if(compareWith&&report.status==='pass'){report.comparison={}
  for(const s of report.scenes){const base=path.join(path.isAbsolute(compareWith)?compareWith:path.join(root,compareWith),s.name+'.png');if(!fs.existsSync(base)){report.comparison[s.name]={missing:true};continue}
   report.comparison[s.name]=png.compare(base,path.join(folder,s.name+'.png'),2)}
  console.log('COMPARE',JSON.stringify(report.comparison))}
 fs.rmSync(takes,{recursive:true,force:true});fs.rmSync(userData,{recursive:true,force:true})
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('THEME_UI',report.status,folder)
})
