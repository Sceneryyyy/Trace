// Simulated IPC/metadata only. This fixture never accesses a device or real media.
import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../src/trace/renderer/App'
import '../../src/trace/renderer/styles.css'
import '../../src/trace/renderer/instruments.css'
import {defaultWorkspace,loadWorkspacePreset} from '../../src/trace/workspace'
import {defaultDisplaySettings} from '../../src/trace/displaySettings'
import {defaultTargetSettings,targetKey} from '../../src/trace/targetSettings'
import {defaultInstrumentSettings} from '../../src/trace/instrumentTypes'
import {defaultSpectrogramSettings} from '../../src/trace/spectrogramProtocol'
import {applyTheme} from '../../src/trace/renderer/themeRuntime'
const format={sampleRate:48000,channelCount:2,containerBits:32,validBits:32,encoding:'ieee-float',channelMask:3,blockAlign:8}
const assetFormat={format:'wav',sampleRate:48000,channelCount:2,encoding:'pcm24'}
const metric=(value,unit)=>({value,unit,status:'ready'})
const summary={integratedToCursor:metric(-23,'LUFS'),loudnessRange:metric(3,'LU'),maxTruePeak:metric(-2,'dBTP'),momentaryMax:metric(-21,'LUFS'),shortTermMax:metric(-22,'LUFS')}
const output={id:'output-1',takeId:'record-0',label:'模拟成品',createdAt:'2026-10-17T10:00:00Z',phase:'ready',fraction:1,error:null,availability:'present',automatic:false,preset:{format:'mp3',sampleRate:48000,bitrate:192},frames:'480000',sampleRate:48000,channelCount:2}
const recordings=n=>Array.from({length:n},(_,i)=>({id:'record-'+i,name:'模拟录音 '+i,createdAt:'2026-10-17T10:00:00Z',status:'ready',frames:'480000',sampleRate:48000,encoding:'pcm24',segmentCount:1,regionCount:i===0?2:1,roles:i===0?['source','deliverable']:['source'],analysisRegions:i===0?[{id:'region-a',role:'source',ordinal:1,sampleRate:48000,channelCount:2},{id:'region-b',role:'source',ordinal:2,sampleRate:96000,channelCount:2}]:[],exports:i===0?[output]:[],continuity:'complete',error:null}))
let state={revision:1,eventSequence:1,active:true,monitoringRequested:true,deviceId:'demo',windowSeconds:10,error:null,windowVisible:true,instrumentTheme:'trace-green',workspace:defaultWorkspace(),displaySettings:defaultDisplaySettings,targetSettings:defaultTargetSettings,instrumentSettings:defaultInstrumentSettings,spectrogramSettings:defaultSpectrogramSettings,recordings:recordings(5000),analysisJobs:[],exportJobs:[output],reportJobs:[],imports:[{id:'import-missing',name:'模拟缺失素材',sourceName:'missing.wav',createdAt:'2026-10-17T10:00:00Z',status:'missing',phase:'ready',fraction:1,hasCache:false,format:assetFormat,frames:'480000',revision:1,error:'FILE_MISSING'}],recordSettings:{encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'},recordDirectory:'模拟目录 · 无实际音频'}
const listeners=new Set(),calls=[],errors=[];let markers=[],failNext=null,heldChart=null,releaseChart=null
const publish=patch=>{state={...state,...patch,revision:state.revision+1};for(const fn of listeners)fn(structuredClone(state))}
const playback=(source={takeId:'record-0',role:'source'},extra={})=>({...source,id:'playback-'+crypto.randomUUID(),label:'模拟录音 '+source.takeId,phase:'paused',positionFrame:'48000',totalFrames:'480000',sampleRate:source.regionId==='region-b'?96000:48000,channelCount:2,generation:'1',analysisId:'analysis-'+source.takeId,analysisPhase:'ready',gain:1,loop:false,follow:false,selection:null,startFrame:'0',endFrame:'480000',outputReady:false,assetFormat,error:null,...extra})
const reportResult={source:{takeId:'record-0',role:'source',scope:{kind:'whole',startFrame:'0',endFrame:'480000'},integrity:{state:'complete',notes:[]}},analysis:{sampleRate:48000,channelCount:2},targetKey:targetKey(defaultTargetSettings),evaluation:{state:'disabled',checks:[]},events:55,eventPreview:Array.from({length:55},(_,i)=>({kind:'momentary-high',startFrame:String(i*100),endFrame:String(i*100+100),channel:null,extreme:-20,status:'ready'})),markers:[]}
const peer=slot=>({id:'peer-'+slot,takeId:'record-'+(slot==='a'?0:1),role:'source',label:'模拟 '+slot.toUpperCase(),format:assetFormat,sampleRate:48000,channelCount:2,frames:'480000',range:{startFrame:'0',endFrame:'480000'},analysis:{phase:'ready',summary}})
window.__uiErrors=errors;window.addEventListener('error',e=>errors.push(e.error?.stack||e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)))
window.__calls=calls;window.__state=()=>structuredClone(state);window.__publish=publish;window.__load=(source,extra)=>publish({playback:playback(source,extra)})
window.__reports=()=>publish({reportJobs:[{id:'report-1',label:'模拟报告一',phase:'ready',scope:{kind:'whole'},createdAt:'2026-10-17T10:00:00Z'},{id:'report-2',label:'模拟报告二',phase:'ready',scope:{kind:'selection'},createdAt:'2026-10-17T11:00:00Z'}]})
window.__reference=()=>publish({reference:{version:1,a:peer('a'),b:peer('b'),active:'a',linked:true,offsetNs:'0',compatible:true,deltas:{integrated:metric(0,'LU'),truePeak:metric(0,'dB'),lra:metric(0,'LU')},match:{enabled:false}}})
window.__layout=id=>publish({workspace:loadWorkspacePreset(state.workspace,id)})
window.__count=n=>publish({recordings:recordings(n)})
window.__fail=command=>{failNext=command};window.__holdChart=()=>{heldChart=true};window.__releaseChart=()=>releaseChart?.()
window.trace={onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},onSnapshot:()=>()=>{},onSpectrogram:()=>()=>{},onReference:()=>()=>{},importFiles:async()=>({accepted:[],errors:[]}),request:async req=>{
 const {command,payload={}}=req;calls.push({command,payload:structuredClone(payload)})
 if(failNext===command){failNext=null;return {requestId:req.requestId,ok:false,state:structuredClone(state),error:{code:'FILE_MISSING',message:'FILE_MISSING'}}}
 let data=null
 if(command==='devices.list')data=[{id:'demo',label:'模拟系统设备 · 无真实音频',isDefault:true,supported:true,error:null,format}]
 else if(command==='workspace.configure')publish({workspace:payload.workspace})
 else if(command==='view.theme')publish({instrumentTheme:payload.theme})
 else if(command==='view.settings')publish({displaySettings:payload})
 else if(command==='app.configure')publish(payload)
 else if(command==='targets.configure')publish({targetSettings:payload.settings})
 else if(command==='instrument.configure')publish({instrumentSettings:payload.settings})
 else if(command==='spectrogram.configure')publish({spectrogramSettings:payload.settings})
 else if(command==='file.open')publish({playback:playback(payload)})
 else if(command==='playback.play'||command==='playback.pause')publish({playback:{...state.playback,outputReady:command==='playback.play',phase:command==='playback.play'?'playing':'paused'}})
 else if(command==='view.live')publish({playback:null})
 else if(command==='record.start')publish({currentRecord:{id:'simulated-rec',phase:'recording'}})
 else if(command==='record.stop')publish({currentRecord:null})
 else if(command==='live.start'||command==='live.stop')publish({active:command==='live.start',monitoringRequested:command==='live.start'})
 else if(command==='export.describe')data={label:'模拟来源',sampleRate:48000,frames:'480000',assetFormat}
 else if(command==='library.storage')data={audioBytes:'0',cacheBytes:'0',incomplete:false}
 else if(command==='markers.list')data={markers}
 else if(command==='markers.save'){markers=markers.filter(m=>m.id!==payload.marker.id).concat(payload.marker);data={markers}}
 else if(command==='markers.remove'){markers=markers.filter(m=>m.id!==payload.markerId);data={markers}}
 else if(command==='report.get')data={...reportResult,label:payload.reportId}
 else if(command==='chart.prepare'){if(heldChart){heldChart=false;await new Promise(r=>releaseChart=r)}data={ticket:'simulated-chart-ticket',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620"><rect width="1000" height="620" fill="white"/><text x="10" y="30">Simulated analysis only</text></svg>'}}
 else if(command==='chart.save')data={saved:true}
 else if(command==='reference.configure')publish({reference:{...state.reference,...payload}})
 else if(command==='reference.clear')publish({reference:{...state.reference,b:undefined,active:null}})
 return {requestId:req.requestId,ok:true,state:structuredClone(state),data}
}}
applyTheme('trace-green');createRoot(document.getElementById('root')).render(<App/>);
