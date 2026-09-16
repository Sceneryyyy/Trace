import assert from 'node:assert/strict'
import { readFile, readdir, open, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
const root=resolve('.')
const reportPath=resolve(process.argv[2]||'artifacts/m2/long-latest.json')
const report=JSON.parse(await readFile(reportPath,'utf8'))
assert.equal(report.status,'pass');assert(report.durationSeconds>=1800)
const takes=join(report.folder,'takes')
let directory,session
for(const name of await readdir(takes)){
 const candidate=JSON.parse(await readFile(join(takes,name,'session.json'),'utf8'))
 if(candidate.sessionId===report.take.id){directory=join(takes,name);session=candidate;break}
}
assert(session,'Long recording session must be reopened')
const sources=session.assets.filter(a=>a.role==='source')
let total=0n,zeroFrames=0n,nonzeroFrames=0n
const files=[]
for(const asset of sources){
 const file=join(directory,asset.relativePath)
 const probe=spawnSync(join(root,'.tools/ffmpeg/bin/ffprobe.exe'),['-v','error','-show_entries','stream=codec_name,sample_rate,channels,duration_ts,bits_per_sample','-of','json',file],{encoding:'utf8',windowsHide:true})
 assert.equal(probe.status,0,probe.stderr)
 const info=JSON.parse(probe.stdout).streams[0]
 assert.equal(info.codec_name,'pcm_s24le');assert.equal(Number(info.sample_rate),asset.sampleRate);assert.equal(info.channels,2)
 assert.equal(String(info.duration_ts),asset.frameCount)
 const hash=createHash('sha256');for await(const data of createReadStream(file))hash.update(data)
 assert.equal(hash.digest('hex'),asset.hash,'Persisted source hash matches reopened bytes')
 const handle=await open(file,'r')
 let dataOffset=0,dataBytes=0
 try{
  const head=Buffer.alloc(12);await handle.read(head,0,12,0)
  assert.equal(head.toString('ascii',0,4),'RIFF');assert.equal(head.toString('ascii',8,12),'WAVE')
  const size=(await handle.stat()).size;assert.equal(head.readUInt32LE(4)+8,size)
  let offset=12
  while(offset+8<=size){
   const chunk=Buffer.alloc(8);await handle.read(chunk,0,8,offset)
   const length=chunk.readUInt32LE(4)
   if(chunk.toString('ascii',0,4)==='data'){dataOffset=offset+8;dataBytes=length;break}
   offset+=8+length+(length%2)
  }
  assert(dataOffset>0);assert.equal(dataBytes%6,0);assert.equal(BigInt(dataBytes/6),BigInt(asset.frameCount))
  const buffer=Buffer.alloc(6*65536)
  let position=0
  while(position<dataBytes){
   const wanted=Math.min(buffer.length,dataBytes-position)
   const {bytesRead}=await handle.read(buffer,0,wanted,dataOffset+position)
   assert.equal(bytesRead,wanted)
   for(let offset=0;offset<bytesRead;offset+=6){
    if(buffer.readUInt32LE(offset)===0&&buffer.readUInt16LE(offset+4)===0)zeroFrames++
    else nonzeroFrames++
   }
   position+=bytesRead
  }
 }finally{await handle.close()}
 total+=BigInt(asset.frameCount)
 files.push({relativePath:asset.relativePath,frames:asset.frameCount,codec:info.codec_name,sha256:asset.hash})
}
assert.equal(total.toString(),report.final.writtenFrames)
assert.equal(total,zeroFrames+nonzeroFrames)
assert(zeroFrames>0n&&nonzeroFrames>0n,'Actual recording retains both silence and rendered tone')
const verified={status:'pass',checkedAt:new Date().toISOString(),recordingReport:reportPath,frames:total.toString(),
 durationSeconds:Number(total)/report.final.sourceFormat.sampleRate,zeroFrames:zeroFrames.toString(),nonzeroFrames:nonzeroFrames.toString(),files,
 checks:['reopened session','ffprobe format and frame count','RIFF size and complete PCM frames','SHA256 unchanged','both recorded silence and tone']}
await writeFile(join(report.folder,'reopen-verification.json'),JSON.stringify(verified,null,2)+'\n')
console.log(JSON.stringify(verified,null,2))
