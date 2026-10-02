import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const {selectRuntime}=createRequire(import.meta.url)('../tools/release/vc-runtime.cjs')
function fixture(root,version,machine=0x8664){
 const directory=join(root,version,'x64','Microsoft.VC143.CRT');mkdirSync(directory,{recursive:true})
 const bytes=Buffer.alloc(128);bytes.write('MZ');bytes.writeUInt32LE(64,60);bytes.write('PE\0\0',64);bytes.writeUInt16LE(machine,68)
 for(const name of ['msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll'])writeFileSync(join(directory,name),bytes)
 return directory
}
test('VS editions and numeric runtime versions are discovered without developer-machine paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'trace-runtime-'))
 fixture(root,'14.9.100');fixture(root,'14.44.35112');const latest=fixture(root,'14.44.35113')
 mkdirSync(join(root,'14.99.1'),{recursive:true})
 assert.equal(selectRuntime([root]).directory,latest);assert.equal(selectRuntime([root]).version,'14.44.35113')
 assert.equal(selectRuntime([],latest).directory,latest)
})
test('runtime discovery rejects missing, incomplete and wrong-architecture binaries',()=>{
 const root=mkdtempSync(join(tmpdir(),'trace-runtime-'))
 assert.throws(()=>selectRuntime([root]),/VC_RUNTIME_NOT_FOUND/)
 assert.throws(()=>selectRuntime([],root),/VC_RUNTIME_INCOMPLETE/)
 const wrong=fixture(root,'14.44.1',0x14c)
 assert.throws(()=>selectRuntime([],wrong),/VC_RUNTIME_NOT_X64/)
 writeFileSync(join(wrong,'msvcp140.dll'),'not a DLL')
 assert.throws(()=>selectRuntime([],wrong),/INVALID_VC_RUNTIME/)
})
