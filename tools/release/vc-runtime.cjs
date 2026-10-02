const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const names=['msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll']
function assertX64(file){
 const b=fs.readFileSync(file)
 if(b.length<64||b.toString('ascii',0,2)!=='MZ')throw Error('INVALID_VC_RUNTIME: '+path.basename(file))
 const at=b.readUInt32LE(60)
 if(at>b.length-24||b.toString('ascii',at,at+4)!=='PE\0\0'||b.readUInt16LE(at+4)!==0x8664)throw Error('VC_RUNTIME_NOT_X64: '+path.basename(file))
}
function selectRuntime(roots,override){
 const candidates=[]
 if(override)candidates.push({directory:path.resolve(override),version:'explicit'})
 else for(const root of roots){
  if(!fs.existsSync(root))continue
  for(const version of fs.readdirSync(root))if(/^14\.\d+\.\d+$/.test(version))candidates.push({version,directory:path.join(root,version,'x64','Microsoft.VC143.CRT')})
 }
 if(!override)candidates.sort((a,b)=>{const x=a.version.split('.').map(Number),y=b.version.split('.').map(Number);return y[1]-x[1]||y[2]-x[2]})
 for(const candidate of candidates){
  if(!names.every(name=>fs.existsSync(path.join(candidate.directory,name)))){if(override)throw Error('VC_RUNTIME_INCOMPLETE');continue}
  for(const name of names)assertX64(path.join(candidate.directory,name))
  return {...candidate,names:[...names]}
 }
 throw Error('VC_RUNTIME_NOT_FOUND: install Visual Studio 2022 C++ tools or set TRACE_VC_REDIST_DIR')
}
function discoverRuntime(env=process.env){
 if(env.TRACE_VC_REDIST_DIR)return selectRuntime([],env.TRACE_VC_REDIST_DIR)
 const vswhere=path.join(env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe')
 const result=spawnSync(vswhere,['-utf8','-version','[17.0,18.0)','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true})
 if(result.error||result.status!==0)throw Error('VS2022_DISCOVERY_FAILED: install Visual Studio Installer or set TRACE_VC_REDIST_DIR')
 return selectRuntime(result.stdout.trim().split(/\r?\n/).filter(Boolean).map(p=>path.join(p,'VC/Redist/MSVC')))
}
module.exports={assertX64,selectRuntime,discoverRuntime}
