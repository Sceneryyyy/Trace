const fs=require('fs'),path=require('path'),crypto=require('crypto')
module.exports=function fixture(root){
 const id=crypto.randomUUID(),folder=path.join(root,'synthetic-playback'),audio=path.join(folder,'audio'),rate=48000,channels=2,name='M4_Playback_Test',frames=rate*8
 fs.mkdirSync(audio,{recursive:true});const assets=[],segments=[];let prefix=0
 for(const [index,count]of [rate*3,rate*2,rate*3].entries()){
  const data=Buffer.alloc(58+count*channels*4);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(18,16);data.writeUInt16LE(3,20);data.writeUInt16LE(channels,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*channels*4,28);data.writeUInt16LE(channels*4,32);data.writeUInt16LE(32,34);data.write('fact',38);data.writeUInt32LE(4,42);data.writeUInt32LE(count,46);data.write('data',50);data.writeUInt32LE(count*channels*4,54)
  for(let f=0;f<count;f++)for(let c=0;c<channels;c++){const at=prefix+f,amp=at<rate*3?.05:at<rate*5?.1:.025;data.writeFloatLE(amp*Math.sin(2*Math.PI*(c?1499:997)*at/rate),58+(f*channels+c)*4)}
  const file=name+'-'+(index+1)+'.wav';fs.writeFileSync(path.join(audio,file),data)
  const assetId=id+'-source-'+index
  assets.push({assetId,role:'source',regionId:id,relativePath:'audio/'+file,sampleRate:rate,channelCount:channels,encoding:'float32',frameCount:String(count),clippedSamples:'0',hash:crypto.createHash('sha256').update(data).digest('hex')})
  segments.push({segmentId:'segment-'+index,assetId,regionId:id,frameCount:String(count),captureStartFrame:String(prefix),timelineStartFrame:String(prefix),regionStartFrame:String(prefix)});prefix+=count
 }
 const d={schemaVersion:2,product:'Trace',sessionId:id,name,createdAt:new Date().toISOString(),status:'ready',deviceId:'synthetic-fixture',captureEpochId:'synthetic:1',
  preset:{encoding:'float32',sampleRate:'source',namePrefix:'M4'},sourceFormat:{sampleRate:rate,channelCount:channels},captureStartFrame:'0',captureEndFrameExclusive:String(frames),frames:String(frames),durationNs:'8000000000',error:null,
  regions:[{id,nativeId:id,ordinal:1,baseName:name,journalFile:'journal.jsonl',captureEpochId:'synthetic:1',format:{sampleRate:rate,channelCount:channels},frames:String(frames),startFrame:'0',endFrameExclusive:String(frames),
   clock:{domain:'synthetic',startQpc100ns:'100000000',endQpc100ns:'180000000',startEstimated:false,endEstimated:false},encoding:'float32',status:'closed',error:null,estimatedFrames:'0',clippedSamples:'0'}],
  assets,segments,takes:[{takeId:id}],events:[],eventSequence:0,hasDiscontinuities:false,fixtureOnly:true}
 fs.writeFileSync(path.join(folder,'session.json'),JSON.stringify(d,null,2));return {folder,document:d}
}
