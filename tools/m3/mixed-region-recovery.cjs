const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','mixed-recovery-'+Date.now()),directory=path.join(folder,'takes','SyntheticRegions'),audio=path.join(directory,'audio')
fs.mkdirSync(audio,{recursive:true})
function wave(name,rate,channels,frames,declared=frames,partial=0){
 const b=Buffer.alloc(58+frames*channels*4+partial);b.write('RIFF');b.writeUInt32LE(50+declared*channels*4,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(18,16);b.writeUInt16LE(3,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*4,28);b.writeUInt16LE(channels*4,32);b.writeUInt16LE(32,34);b.write('fact',38);b.writeUInt32LE(4,42);b.writeUInt32LE(declared,46);b.write('data',50);b.writeUInt32LE(declared*channels*4,54)
 for(let f=0;f<frames;f++)for(let c=0;c<channels;c++)b.writeFloatLE(.1*Math.sin(2*Math.PI*1000*f/rate)*(c?.5:1),58+(f*channels+c)*4)
 fs.writeFileSync(path.join(audio,name),b)
}
wave('Synthetic-1.wav',96000,1,1920);wave('Synthetic-r2-1.wav',48000,2,2400,1200,3)
const metric=unit=>({value:null,status:'insufficient',unit})
const regions=[
 {id:'synthetic',nativeId:'synthetic',ordinal:1,baseName:'Synthetic',journalFile:'journal.jsonl',captureEpochId:'synthetic-clock:1',format:{sampleRate:96000,channelCount:1},frames:'1920',startFrame:'0',endFrameExclusive:'1920',clock:{domain:'synthetic-clock',startQpc100ns:'100000000',endQpc100ns:'100200000',startEstimated:false,endEstimated:false},encoding:'float32',status:'interrupted',error:'DEVICE_UNAVAILABLE',estimatedFrames:'0',clippedSamples:'0'},
 {id:'synthetic-r2',nativeId:'synthetic-r2',ordinal:2,baseName:'Synthetic-r2',journalFile:'region-2.journal.jsonl',captureEpochId:'synthetic-clock:2',format:{sampleRate:48000,channelCount:2},frames:'0',startFrame:null,endFrameExclusive:null,clock:{domain:'synthetic-clock',startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},encoding:'float32',status:'recording',error:null,estimatedFrames:'0',clippedSamples:'0'}
]
const d={schemaVersion:2,product:'Trace',sessionId:'synthetic',name:'Synthetic',createdAt:new Date().toISOString(),status:'recording',deviceId:'synthetic-device',captureEpochId:'synthetic-clock:1',sourceFormat:regions[0].format,preset:{encoding:'float32',sampleRate:'source',namePrefix:'Synthetic'},captureStartFrame:'0',captureEndFrameExclusive:null,frames:'1920',durationNs:'20000000',error:null,regions,assets:[],segments:[],takes:[{takeId:'synthetic'}],events:[],eventSequence:0,hasDiscontinuities:true}
fs.writeFileSync(path.join(directory,'session.json'),JSON.stringify(d,null,2))
for(const r of regions){
 const frames=r.ordinal===1?'1920':'1200',start=r.ordinal===1?'100000000':'110000000',end=r.ordinal===1?'100200000':'110250000'
 const lines=[{seq:1,event:'prepared',id:r.nativeId},{seq:2,event:'begin',captureStartFrame:'0'},{seq:3,event:'checkpoint',frames,segments:[{file:r.baseName+'-1.wav',frames}],startQpc100ns:start,endQpc100ns:end,startQpcEstimated:false,endQpcEstimated:false}]
 fs.writeFileSync(path.join(directory,r.journalFile),lines.map(x=>JSON.stringify(x)).join('\n')+'\n')
}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),originals=fs.readdirSync(audio).map(name=>({name,hash:hash(path.join(audio,name))}))
const env={...process.env,TRACE_REGION_RECOVERY_CASE:folder,TRACE_REGION_RECOVERY_MODE:'recover'};delete env.ELECTRON_RUN_AS_NODE
const child=spawnSync(require('electron'),['tools/m3/region-recovery-app.cjs','--trace-test'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000})
fs.writeFileSync(path.join(folder,'console.log'),(child.stdout||'')+(child.stderr||''))
assert.equal(child.status,0,child.stderr)
if(!fs.existsSync(path.join(folder,'result.json')))throw Error(fs.readFileSync(path.join(folder,'error.json'),'utf8'))
const after=JSON.parse(fs.readFileSync(path.join(directory,'session.json'),'utf8'))
assert.equal(after.status,'recovered');assert.deepEqual(after.regions.map(r=>r.frames),['1920','2400'])
assert.equal(after.regions[1].clock.endQpc100ns,null)
const recovered=after.assets.filter(a=>a.role==='recovered');assert.deepEqual(recovered.map(a=>[a.sampleRate,a.channelCount]),[[96000,1],[48000,2]])
const view=after.assets.filter(a=>a.role==='session'&&a.state!=='superseded');assert(view.length);assert.equal(view.reduce((n,a)=>n+BigInt(a.frameCount),0n),6720n);assert(view.every(a=>a.sampleRate===96000&&a.channelCount===2))
const output=fs.readFileSync(path.join(directory,view[0].relativePath));let offset=12,data=0
while(offset+8<output.length){const size=output.readUInt32LE(offset+4);if(output.toString('ascii',offset,offset+4)==='data'){data=offset+8;break}offset+=8+size+(size%2)}
assert(data);const left=output.readFloatLE(data+24*8),right=output.readFloatLE(data+24*8+4)
assert(Math.abs(left-.1/Math.sqrt(2))<1e-6&&Math.abs(right-left)<1e-7)
for(const item of originals)assert.equal(hash(path.join(audio,item.name)),item.hash)
const result={status:'pass',kind:'synthetic-mixed-rate-channel-recovery',actualHardwareFormatChange:false,folder,regions:after.regions.map(r=>({frames:r.frames,format:r.format,clock:r.clock})),viewFrames:'6720',viewRate:96000,viewChannels:2,originalHashesUnchanged:true,equalPowerMonoMapping:true,partialTailDiscarded:true}
fs.writeFileSync(path.join(root,'artifacts/m2-regions/mixed-recovery-latest.json'),JSON.stringify(result,null,2));console.log('MIXED_REGION_RECOVERY_PASS')
