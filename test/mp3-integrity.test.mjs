import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const compiled=resolve('artifacts/file-faults/mp3-integrity.cjs');await mkdir(resolve('artifacts/file-faults'),{recursive:true})
await build({entryPoints:['src/trace/mp3Integrity.ts'],outfile:compiled,bundle:true,platform:'node',format:'cjs'})
const {mp3Declaration}=(await import(pathToFileURL(compiled))).default
async function fixture(t,bytes){const root=await mkdtemp(join(tmpdir(),'trace-mp3-header-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'misnamed.wav');await writeFile(file,bytes);return file}
function xing({version=3,mono=false,crc=false,flags=3,tag='Xing'}={}){
 const bytes=Buffer.alloc(200);bytes.writeUInt32BE((0xffe00000|(version<<19)|(1<<17)|((crc?0:1)<<16)|(9<<12)|((mono?3:0)<<6))>>>0)
 const offset=4+(crc?2:0)+(version===3?(mono?17:32):(mono?9:17));bytes.write(tag,offset);bytes.writeUInt32BE(flags,offset+4)
 let field=offset+8;if(flags&1){bytes.writeUInt32BE(47,field);field+=4}if(flags&2)bytes.writeUInt32BE(19000,field);return bytes
}
test('bounded MP3 headers distinguish MPEG versions, channels, CRC, Xing/Info and absent declarations',async t=>{
 for(const version of [3,2,0])for(const mono of [false,true])for(const crc of [false,true])for(const tag of ['Xing','Info'])assert.deepEqual(await mp3Declaration(await fixture(t,xing({version,mono,crc,tag}))),{packets:47,bytes:19000,offset:0})
 for(const flags of [0,1,2])assert.deepEqual(await mp3Declaration(await fixture(t,xing({flags}))),flags===0?null:{packets:flags===1?47:undefined,bytes:flags===2?19000:undefined,offset:0})
 for(const bytes of [Buffer.from('not mp3'),Buffer.alloc(500),xing({tag:'none'})])assert.equal(await mp3Declaration(await fixture(t,bytes)),null)
})
test('large ID3 metadata is skipped by position and v2.4 footer is counted without reading the whole tag',async t=>{
 for(const footer of [false,true]){const id3=Buffer.alloc(128*128+10+(footer?10:0));id3.write('ID3');id3[3]=4;id3[5]=footer?16:0;id3[7]=1
  assert.deepEqual(await mp3Declaration(await fixture(t,Buffer.concat([id3,xing()]))),{packets:47,bytes:19000,offset:id3.length})}
})
test('VBRI declarations and invalid/truncated length headers cannot masquerade as valid counts',async t=>{
 const vbri=xing({tag:'none'});vbri.write('VBRI',36);vbri.writeUInt16BE(1,40);vbri.writeUInt32BE(19000,46);vbri.writeUInt32BE(47,50)
 assert.deepEqual(await mp3Declaration(await fixture(t,vbri)),{packets:47,bytes:19000,offset:0})
 const zero=xing();zero.writeUInt32BE(0,44);await assert.rejects(mp3Declaration(await fixture(t,zero)),/INVALID_MP3_LENGTH_HEADER/)
 await assert.rejects(mp3Declaration(await fixture(t,xing().subarray(0,46))),/INVALID_MP3_LENGTH_HEADER/)
 const id3=Buffer.from([73,68,51,4,0,0,128,0,0,0]);await assert.rejects(mp3Declaration(await fixture(t,id3)),/INVALID_MP3_ID3_HEADER/)
})
